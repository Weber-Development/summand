import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractInvoiceXml,
  isValidLeitwegId,
  leitwegCheckDigits,
  validateInvoice,
} from "../src/index";

const fixtures = join(__dirname, "fixtures");
const xr = readFileSync(
  join(fixtures, "xrechnung-testsuite/business-cases/standard/01.01a-INVOICE_ubl.xml"),
  "utf8",
);
const cii = readFileSync(
  join(fixtures, "xrechnung-testsuite/business-cases/standard/01.01a-INVOICE_uncefact.xml"),
  "utf8",
);
const pdf = (name: string) => readFileSync(join(fixtures, "pdf", name));

describe("validateInvoice", () => {
  it("validates XRechnung UBL with EN 16931 and XRechnung rules", () => {
    const r = validateInvoice(xr);
    expect(r.valid).toBe(true);
    expect(r.syntax).toBe("ubl-invoice");
    expect(r.profile?.id).toBe("xrechnung");
    expect(r.ruleSets.map((s) => s.id)).toEqual(["en16931-ubl", "xrechnung-ubl"]);
    expect(r.summary?.number).toBeTruthy();
    expect(r.summary?.lineCount).toBeGreaterThan(0);
  });

  it("reports broken totals with rule id, location and line", () => {
    const broken = xr.replace(
      /<cbc:PayableAmount currencyID="EUR">[^<]+</,
      '<cbc:PayableAmount currencyID="EUR">1.00<',
    );
    const r = validateInvoice(broken);
    expect(r.valid).toBe(false);
    const e = r.errors.find((x) => x.id === "BR-CO-16");
    expect(e?.location).toContain("LegalMonetaryTotal");
    expect(e?.line).toBeGreaterThan(1);
    expect(e?.ruleSet).toBe("en16931-ubl");
  });

  it("reports messages in German with lang: de", () => {
    const broken = xr.replace(
      /<cbc:PayableAmount currencyID="EUR">[^<]+</,
      '<cbc:PayableAmount currencyID="EUR">1.00<',
    );
    const en = validateInvoice(broken).errors.find((x) => x.id === "BR-CO-16");
    const de = validateInvoice(broken, { lang: "de" }).errors.find((x) => x.id === "BR-CO-16");
    expect(en?.message).toContain("Amount due for payment (BT-115)");
    expect(de?.message).toContain("(BT-115)");
    expect(de?.message).not.toContain("shall");
    expect(de?.location).toBe(en?.location);
    const notXml = validateInvoice("<x>", { lang: "de" });
    expect(notXml.errors[0]?.message).toMatch(/^Die Rechnung ist kein wohlgeformtes XML/);
  });

  it("applies XRechnung rules (missing buyer reference, BR-DE-15)", () => {
    const r = validateInvoice(cii.replace(/<ram:BuyerReference>[^<]*<\/ram:BuyerReference>/, ""));
    expect(r.errors.map((e) => e.id)).toContain("BR-DE-15");
  });

  it("can force XRechnung rules on a plain EN 16931 invoice", () => {
    const plain = cii.replace(
      /urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0/,
      "urn:cen.eu:en16931:2017",
    );
    expect(validateInvoice(plain).ruleSets.map((s) => s.id)).toEqual(["en16931-cii"]);
    expect(validateInvoice(plain, { xrechnung: true }).ruleSets.map((s) => s.id)).toEqual([
      "en16931-cii",
      "xrechnung-cii",
    ]);
  });

  it("warns about a Leitweg-ID with wrong check digits", () => {
    const r = validateInvoice(
      xr.replace(/<cbc:BuyerReference>[^<]*</, "<cbc:BuyerReference>04011000-12345-34<"),
    );
    expect(r.warnings.map((w) => w.id)).toContain("SUM-LEITWEG");
  });

  it("rejects non-XML, non-invoices and empty input", () => {
    expect(validateInvoice("not xml").errors[0]?.id).toBe("SUM-XML");
    expect(validateInvoice("<Order/>").errors[0]?.id).toBe("SUM-FORMAT");
    expect(validateInvoice(new Uint8Array()).valid).toBe(false);
  });

  it("decodes bytes using the XML declaration", () => {
    const latin1 = new TextEncoder().encode(xr);
    expect(validateInvoice(latin1).valid).toBe(true);
    expect(validateInvoice(latin1.buffer.slice(0) as ArrayBuffer).valid).toBe(true);
  });
});

describe("PDF invoices", () => {
  it("extracts and validates ZUGFeRD EN 16931", () => {
    const r = validateInvoice(pdf("EN16931_Einfach.pdf"));
    expect(r.source).toMatchObject({
      type: "pdf",
      attachmentName: "factur-x.xml",
      pdfConformanceLevel: "EN 16931",
    });
    expect(r.profile?.id).toBe("en16931");
    expect(r.valid).toBe(true);
  });

  it("validates an XRechnung embedded in a PDF", () => {
    const r = validateInvoice(pdf("validXRechnung.pdf"));
    expect(r.profile?.id).toBe("xrechnung");
    expect(r.valid).toBe(true);
  });

  it("rejects BASIC WL as not EN 16931", () => {
    const r = validateInvoice(pdf("validAvoir_FR_type380_BASICWL.pdf"));
    expect(r.profile?.id).toBe("factur-x-basic-wl");
    expect(r.errors.map((e) => e.id)).toEqual(["SUM-PROFILE"]);
  });

  it("rejects ZUGFeRD 1.0 and plain PDFs", () => {
    expect(validateInvoice(pdf("zugferd_invoice.pdf")).errors[0]?.id).toBe("SUM-FORMAT");
    expect(
      validateInvoice(pdf("MustangGnuaccountingBeispielRE-20201121_508blanko.pdf")).errors[0]?.id,
    ).toBe("SUM-PDF");
  });

  it("treats EXTENDED leniently unless strict", () => {
    const lenient = validateInvoice(pdf("EXTENDED_Fremdwaehrung_wdis_fx-pdfa4.pdf"));
    expect(lenient.profile?.id).toBe("factur-x-extended");
    expect(lenient.infos.map((i) => i.id)).toContain("SUM-EXTENDED");
    expect(lenient.valid).toBe(true);
  });

  it("extractInvoiceXml returns the embedded XML", () => {
    const x = extractInvoiceXml(new Uint8Array(pdf("EN16931_Einfach.pdf")));
    expect(x?.xml).toContain("CrossIndustryInvoice");
  });
});

describe("Leitweg-ID", () => {
  it("checks and computes check digits", () => {
    expect(isValidLeitwegId("04011000-1234512345-06")).toBe(true);
    expect(isValidLeitwegId("991-33333TEST-33")).toBe(true);
    expect(isValidLeitwegId("04011000-12345-34")).toBe(false);
    expect(isValidLeitwegId("hello")).toBe(false);
    expect(leitwegCheckDigits("04011000", "1234512345")).toBe("06");
  });
});
