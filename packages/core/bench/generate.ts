/**
 * Builds large invoices from the sample invoices of the XRechnung test suite: the two lines of
 * 01.01a are repeated (alternating) with fresh line ids and the totals are recalculated, so the
 * result stays a valid invoice. The "en16931" variants only change the specification identifier.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const samples = join(
  dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/xrechnung-testsuite/business-cases/standard",
);

export type Syntax = "ubl" | "cii";
export type Flavour = "xrechnung" | "en16931";

const XRECHNUNG_ID = "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";
const EN16931_ID = "urn:cen.eu:en16931:2017";

const cents = (text: string) => Math.round(Number(text) * 100);
const money = (c: number) => (c / 100).toFixed(2);

export function generateInvoice(syntax: Syntax, flavour: Flavour, lines: number): string {
  const file = syntax === "ubl" ? "01.01a-INVOICE_ubl.xml" : "01.01a-INVOICE_uncefact.xml";
  const xml = readFileSync(join(samples, file), "utf8");
  const open = syntax === "ubl" ? "<cac:InvoiceLine>" : "<ram:IncludedSupplyChainTradeLineItem>";
  const close = syntax === "ubl" ? "</cac:InvoiceLine>" : "</ram:IncludedSupplyChainTradeLineItem>";
  const start = xml.indexOf(open);
  const end = xml.lastIndexOf(close) + close.length;
  const blocks = xml
    .slice(start, end)
    .split(close)
    .slice(0, -1)
    .map((b) => `${b}${close}`);
  const idPattern =
    syntax === "ubl" ? /(<cbc:ID>)[^<]*(<\/cbc:ID>)/ : /(<ram:LineID>)[^<]*(<\/ram:LineID>)/;
  const amountPattern =
    syntax === "ubl"
      ? /<cbc:LineExtensionAmount currencyID="EUR">([^<]*)</
      : /<ram:ChargeAmount>([^<]*)</;

  let net = 0;
  const generated: string[] = [];
  for (let i = 0; i < lines; i++) {
    const block = blocks[i % blocks.length] as string;
    net += cents((amountPattern.exec(block) as RegExpExecArray)[1] as string);
    generated.push(block.replace(idPattern, `$1${i + 1}$2`));
  }
  const tax = Math.round(net * 0.07);
  const gross = net + tax;

  // Totals of the sample: net 314.86, VAT 22.04, gross 336.9 (the header is the part outside the lines).
  const fix = (part: string) =>
    part
      .replaceAll("314.86", money(net))
      .replaceAll("22.04", money(tax))
      .replaceAll("336.9", money(gross))
      .replaceAll(XRECHNUNG_ID, flavour === "en16931" ? EN16931_ID : XRECHNUNG_ID);
  return fix(xml.slice(0, start)) + generated.join("\n") + fix(xml.slice(end));
}
