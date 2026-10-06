import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateInvoice } from "../src/validate";
import { parseXml } from "../src/xml";
import { type SchemaFinding, validateSchema } from "../src/xsd";
import { compileXsd } from "../src/xsd-compile";
import { translateXsdPattern } from "../src/xsd-regex";

const fixtures = join(__dirname, "fixtures");
const standard = join(fixtures, "xrechnung-testsuite/business-cases/standard");
const ubl = readFileSync(join(standard, "01.01a-INVOICE_ubl.xml"), "utf8");
const cii = readFileSync(join(standard, "01.01a-INVOICE_uncefact.xml"), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : f.endsWith(".xml") ? [p] : [];
  });
}

const schemaErrors = (xml: string) => validateInvoice(xml).errors.filter((e) => e.id === "SUM-XSD");

function findings(xml: string): SchemaFinding[] {
  const doc = parseXml(xml);
  const root = doc.children.find((c) => c.kind === "element");
  return validateSchema(doc, root?.local === "CrossIndustryInvoice" ? "cii-d16b" : "ubl-2.1");
}

describe("XML Schema validation: valid documents", () => {
  it("accepts every KoSIT reference invoice", () => {
    const files = walk(join(fixtures, "xrechnung-testsuite"));
    expect(files.length).toBeGreaterThan(40);
    const failing = files
      .map((f) => ({ f, e: schemaErrors(readFileSync(f, "utf8")) }))
      .filter(({ e }) => e.length > 0)
      .map(({ f, e }) => `${f}: ${e.map((x) => `${x.line} ${x.message}`).join("; ")}`);
    expect(failing).toEqual([]);
  });

  it("accepts the embedded XML of the valid PDF invoices", () => {
    for (const name of [
      "EN16931_Einfach.pdf",
      "EXTENDED_Fremdwaehrung_wdis_fx-pdfa4.pdf",
      "validAvoir_FR_type380_BASICWL.pdf",
      "validXRechnung.pdf",
    ]) {
      const r = validateInvoice(readFileSync(join(fixtures, "pdf", name)));
      expect(
        r.errors.filter((e) => e.id === "SUM-XSD"),
        name,
      ).toEqual([]);
      expect(r.schemas.map((s) => s.id)).toEqual(["cii-d16b"]);
    }
  });

  it("reports schema errors in German with lang: de", () => {
    const broken = ubl
      .replace("<cbc:IssueDate>2016-04-04<", "<cbc:IssueDate>04.04.2016<")
      .replace("<cbc:ID>123456XX</cbc:ID>", "");
    const de = validateInvoice(broken, { lang: "de" }).errors.filter((e) => e.id === "SUM-XSD");
    expect(de.map((e) => e.message)).toEqual([
      "Pflichtelement cbc:ID fehlt in ubl:Invoice (erwartet vor cbc:IssueDate).",
      'Wert "04.04.2016" von cbc:IssueDate ist kein gültiges Datum (JJJJ-MM-TT).',
    ]);
    expect(de[1]?.location).toBe("/ubl:Invoice/cbc:IssueDate");
    const doc = parseXml(broken);
    expect(validateSchema(doc, "ubl-2.1", { lang: "de" })[1]?.message).toContain("gültiges Datum");
    expect(validateSchema(doc, "ubl-2.1")[1]?.message).toContain("not a valid xs:date");
  });

  it("reports the schema in the result and can be switched off", () => {
    expect(validateInvoice(ubl).schemas.map((s) => s.id)).toEqual(["ubl-2.1"]);
    expect(validateInvoice(cii).schemas.map((s) => s.id)).toEqual(["cii-d16b"]);
    const broken = ubl.replace("<cbc:IssueDate>2016-04-04<", "<cbc:IssueDate>04.04.2016<");
    expect(schemaErrors(broken)).toHaveLength(1);
    const off = validateInvoice(broken, { schema: false });
    expect(off.schemas).toEqual([]);
    expect(off.errors.filter((e) => e.id === "SUM-XSD")).toEqual([]);
  });
});

describe("XML Schema validation: UBL errors", () => {
  it("reports a missing required element", () => {
    const [e, ...rest] = findings(ubl.replace("<cbc:ID>123456XX</cbc:ID>", ""));
    expect(rest).toEqual([]);
    expect(e?.kind).toBe("missing-element");
    expect(e?.message).toBe(
      "Required element cbc:ID is missing in ubl:Invoice (expected before cbc:IssueDate).",
    );
    expect(e?.location).toBe("/ubl:Invoice");
    expect(e?.line).toBe(2);
  });

  it("reports elements in the wrong order", () => {
    const swapped = ubl.replace(
      "<cbc:ID>123456XX</cbc:ID>\n    <cbc:IssueDate>2016-04-04</cbc:IssueDate>",
      "<cbc:IssueDate>2016-04-04</cbc:IssueDate>\n    <cbc:ID>123456XX</cbc:ID>",
    );
    const f = findings(swapped);
    expect(f.map((x) => x.kind)).toEqual(["element-order"]);
    expect(f[0]?.message).toBe(
      "cbc:ID is in the wrong position in ubl:Invoice: it must come before cbc:IssueDate.",
    );
    expect(f[0]?.location).toBe("/ubl:Invoice/cbc:ID");
    expect(f[0]?.line).toBe(8);
  });

  it("reports an element that occurs too often", () => {
    const f = findings(
      ubl.replace(
        "<cbc:IssueDate>2016-04-04</cbc:IssueDate>",
        "<cbc:IssueDate>2016-04-04</cbc:IssueDate><cbc:IssueDate>2016-04-05</cbc:IssueDate>",
      ),
    );
    expect(f.map((x) => x.kind)).toEqual(["too-many"]);
    expect(f[0]?.message).toContain("cbc:IssueDate occurs too often in ubl:Invoice");
    expect(f[0]?.location).toBe("/ubl:Invoice/cbc:IssueDate[2]");
  });

  it("reports an unknown element", () => {
    const f = findings(
      ubl.replace(
        "<cbc:IssueDate>2016-04-04</cbc:IssueDate>",
        "<cbc:IssueDate>2016-04-04</cbc:IssueDate><cbc:Colour>red</cbc:Colour>",
      ),
    );
    expect(f.map((x) => x.kind)).toEqual(["unexpected-element"]);
    expect(f[0]?.message).toMatch(/^cbc:Colour is not allowed in ubl:Invoice \(expected /);
  });

  it("reports an invalid date and decimal", () => {
    const f = findings(
      ubl
        .replace("<cbc:IssueDate>2016-04-04<", "<cbc:IssueDate>2016-02-30<")
        .replace(
          '<cbc:LineExtensionAmount currencyID="EUR">314.86<',
          '<cbc:LineExtensionAmount currencyID="EUR">314,86<',
        ),
    );
    expect(f.map((x) => x.kind)).toEqual(["value", "value"]);
    expect(f[0]?.message).toBe(
      'Value "2016-02-30" of cbc:IssueDate is not a valid xs:date (expected a date YYYY-MM-DD).',
    );
    expect(f[1]?.message).toContain('Value "314,86" of cbc:LineExtensionAmount');
    expect(f[1]?.location).toBe("/ubl:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount");
  });

  it("reports missing and unknown attributes", () => {
    const f = findings(
      ubl.replace(
        '<cbc:LineExtensionAmount currencyID="EUR">314.86<',
        '<cbc:LineExtensionAmount currency="EUR">314.86<',
      ),
    );
    expect(f.map((x) => x.kind).sort()).toEqual(["missing-attribute", "unknown-attribute"]);
    expect(f.find((x) => x.kind === "missing-attribute")?.message).toBe(
      "Required attribute currencyID is missing on cbc:LineExtensionAmount.",
    );
    expect(f.find((x) => x.kind === "unknown-attribute")?.location).toMatch(/\/@currency$/);
  });

  it("reports text in an aggregate and child elements in a basic component", () => {
    const f = findings(
      ubl
        .replace(
          "<cbc:IssueDate>2016-04-04</cbc:IssueDate>",
          "<cbc:IssueDate>2016-04-04<cbc:ID>1</cbc:ID></cbc:IssueDate>",
        )
        .replace("<cac:AccountingSupplierParty>", "<cac:AccountingSupplierParty>oops"),
    );
    expect(f.map((x) => x.kind).sort()).toEqual(["content", "unexpected-element"]);
  });

  it("validates extension content laxly", () => {
    const withExtension = (content: string) =>
      ubl.replace(
        "<cbc:CustomizationID>",
        `<ext:UBLExtensions xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"><ext:UBLExtension><ext:ExtensionContent>${content}</ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions><cbc:CustomizationID>`,
      );
    expect(
      findings(withExtension('<my:Data xmlns:my="urn:example"><my:X>1</my:X></my:Data>')),
    ).toEqual([]);
    // Elements with a schema declaration are validated even inside lax content.
    const f = findings(
      withExtension(
        '<my:Data xmlns:my="urn:example"><cbc:IssueDate>soon</cbc:IssueDate></my:Data>',
      ),
    );
    expect(f.map((x) => x.kind)).toEqual(["value"]);
  });

  it("allows xsi:schemaLocation and rejects xsi:nil on non-nillable elements", () => {
    const xsi = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';
    expect(
      findings(ubl.replace("<ubl:Invoice ", `<ubl:Invoice ${xsi} xsi:schemaLocation="a b" `)),
    ).toEqual([]);
    const f = findings(
      ubl
        .replace("<ubl:Invoice ", `<ubl:Invoice ${xsi} `)
        .replace("<cbc:IssueDate>2016-04-04<", '<cbc:IssueDate xsi:nil="true"><'),
    );
    expect(f.map((x) => x.kind)).toEqual(["content"]);
  });

  it("validates credit notes", () => {
    const creditNote = ubl
      .replace(/ubl:Invoice\b/g, "ubl:CreditNote")
      .replace(":xsd:Invoice-2", ":xsd:CreditNote-2")
      .replace(/cbc:InvoiceTypeCode>/g, "cbc:CreditNoteTypeCode>")
      .replace(/cac:InvoiceLine>/g, "cac:CreditNoteLine>")
      .replace(/cbc:InvoicedQuantity/g, "cbc:CreditedQuantity");
    expect(findings(creditNote)).toEqual([]);
    const f = findings(creditNote.replace(/cbc:CreditedQuantity/g, "cbc:InvoicedQuantity"));
    expect(f.map((x) => x.kind)).toEqual(["unexpected-element", "unexpected-element"]);
    expect(f[0]?.message).toMatch(/^cbc:InvoicedQuantity is not allowed in cac:CreditNoteLine/);
  });
});

describe("XML Schema validation: CII errors", () => {
  it("reports a missing required element in a choice", () => {
    const f = findings(
      cii.replace('<udt:DateTimeString format="102">20160404</udt:DateTimeString>', ""),
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.location).toBe(
      "/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IssueDateTime",
    );
    expect(f[0]?.message).toContain("udt:DateTimeString");
  });

  it("reports a wrong order, a bad decimal and a fixed attribute value", () => {
    const f = findings(
      cii
        .replace(
          "<ram:ID>123456XX</ram:ID>\n        <ram:TypeCode>380</ram:TypeCode>",
          '<ram:TypeCode listID="UNTDID 1001">380</ram:TypeCode>\n        <ram:ID>123456XX</ram:ID>',
        )
        .replace("<ram:LineTotalAmount>26.07<", "<ram:LineTotalAmount>26.07 EUR<"),
    );
    expect(f.map((x) => x.kind).sort()).toEqual(["attribute-value", "element-order", "value"]);
    expect(f.find((x) => x.kind === "attribute-value")?.message).toBe(
      'Attribute listID on ram:TypeCode must have the fixed value "1001", found "UNTDID 1001".',
    );
  });

  it("keeps running the Schematron rules when the schema is violated", () => {
    const r = validateInvoice(
      cii.replace(/<ram:BuyerReference>[^<]*<\/ram:BuyerReference>/, "<ram:Unknown/>"),
    );
    const ids = r.errors.map((e) => e.id);
    expect(ids).toContain("SUM-XSD");
    expect(ids).toContain("BR-DE-15");
    expect(ids.indexOf("SUM-XSD")).toBe(0);
  });
});

describe("compiled schemas from XSD", () => {
  const XS = 'xmlns:xs="http://www.w3.org/2001/XMLSchema"';
  const model = compileXsd({
    roots: [["urn:t", "Root"]],
    files: {
      "t.xsd": `<xs:schema ${XS} xmlns="urn:t" targetNamespace="urn:t" elementFormDefault="qualified">
        <xs:element name="Root"><xs:complexType><xs:sequence>
          <xs:element name="Code" type="Code" minOccurs="0"/>
          <xs:element name="Amount" type="Amount" minOccurs="0"/>
          <xs:element name="Id" type="Id" minOccurs="0" maxOccurs="2"/>
          <xs:choice minOccurs="0"><xs:element name="A" type="xs:string"/><xs:element name="B" type="xs:string"/></xs:choice>
          <xs:element name="Any" minOccurs="0"><xs:complexType><xs:sequence><xs:any namespace="##other" processContents="skip" maxOccurs="unbounded"/></xs:sequence></xs:complexType></xs:element>
        </xs:sequence><xs:attribute name="version" type="xs:token" use="required" fixed="1"/></xs:complexType></xs:element>
        <xs:simpleType name="Code"><xs:restriction base="xs:token"><xs:enumeration value="AB"/><xs:enumeration value="CD"/></xs:restriction></xs:simpleType>
        <xs:simpleType name="Amount"><xs:restriction base="xs:decimal"><xs:totalDigits value="5"/><xs:fractionDigits value="2"/><xs:minInclusive value="0"/></xs:restriction></xs:simpleType>
        <xs:simpleType name="Id"><xs:restriction base="xs:string"><xs:pattern value="\\i\\c*-[0-9]{2}"/><xs:maxLength value="8"/></xs:restriction></xs:simpleType>
      </xs:schema>`,
    },
  }).model;
  const check = (body: string, attrs = 'version="1"') =>
    validateSchema(parseXml(`<Root xmlns="urn:t" ${attrs}>${body}</Root>`), model).map(
      (f) => f.message,
    );

  it("checks enumerations, digits, ranges, patterns and lengths", () => {
    expect(check("<Code> CD </Code><Amount>123.40</Amount><Id>ab-12</Id><Id>x.y-00</Id>")).toEqual(
      [],
    );
    expect(check("<Code>EF</Code>")).toEqual([
      'Value "EF" of Code is not one of the allowed values (AB, CD).',
    ]);
    expect(check("<Amount>12345.6</Amount>")).toEqual([
      'Value "12345.6" of Amount has more than 5 digits.',
    ]);
    expect(check("<Amount>1.234</Amount>")).toEqual([
      'Value "1.234" of Amount has more than 2 fraction digits.',
    ]);
    expect(check("<Amount>-1</Amount>")).toEqual(['Value "-1" of Amount is less than 0.']);
    expect(check("<Id>1a-12</Id>")).toEqual([
      'Value "1a-12" of Id does not match the required pattern.',
    ]);
    expect(check("<Id>abcdef-12</Id>")).toEqual([
      'Value "abcdef-12" of Id is longer than the maximum length 8.',
    ]);
  });

  it("checks choices, occurrences, wildcards and fixed required attributes", () => {
    expect(check('<A>x</A><Any><o:x xmlns:o="urn:o"><o:y/></o:x></Any>')).toEqual([]);
    expect(check("<A>x</A><B>y</B>")).toHaveLength(1);
    expect(check("<Id>ab-12</Id><Id>ab-12</Id><Id>ab-12</Id>")).toEqual([
      "Id occurs too often in Root (at most 2 allowed).",
    ]);
    expect(check("<Any><Code>AB</Code></Any>")).toHaveLength(1);
    expect(check("", "")).toEqual(["Required attribute version is missing on Root."]);
    expect(check("", 'version="2"')).toEqual([
      'Attribute version on Root must have the fixed value "1", found "2".',
    ]);
  });

  it("rejects unsupported constructs instead of ignoring them", () => {
    expect(() =>
      compileXsd({
        roots: [["", "R"]],
        files: {
          "u.xsd": `<xs:schema ${XS}><xs:element name="R"><xs:simpleType><xs:list itemType="xs:int"/></xs:simpleType></xs:element></xs:schema>`,
        },
      }),
    ).toThrow(/Unsupported simple type derivation xs:list/);
  });
});

describe("XSD regular expressions", () => {
  const test = (pattern: string, value: string) =>
    new RegExp(translateXsdPattern(pattern) as string, "u").test(value);

  it("anchors patterns and treats ^ and $ as characters", () => {
    expect(test("[0-9]{2}", "12")).toBe(true);
    expect(test("[0-9]{2}", "123")).toBe(false);
    expect(test("a^b$", "a^b$")).toBe(true);
    expect(test("a|b", "ab")).toBe(false);
  });

  it("supports name escapes, categories and class subtraction", () => {
    expect(test("\\i\\c*", "_a1.b")).toBe(true);
    expect(test("\\i\\c*", "1a")).toBe(false);
    expect(test("[a-z-[aeiou]]+", "bcd")).toBe(true);
    expect(test("[a-z-[aeiou]]+", "bad")).toBe(false);
    expect(test("\\p{Lu}\\d", "Ä7")).toBe(true);
    expect(test(".", "\n")).toBe(false);
    expect(test("[\\-a]+", "-a")).toBe(true);
  });

  it("returns null for constructs JavaScript cannot express", () => {
    expect(translateXsdPattern("\\p{IsBasicLatin}+")).toBeNull();
    expect(translateXsdPattern("[\\S]")).toBeNull();
    expect(() => translateXsdPattern("a{")).toThrow(SyntaxError);
  });
});
