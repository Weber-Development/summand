import { NS, type Syntax } from "./detect";
import type { XNode } from "./xml";
import { evaluate, stringOf } from "./xpath/eval";
import { builtinFunctions } from "./xpath/functions";
import { parseXPath } from "./xpath/parser";

/** The key facts of an invoice, for lists, logs and previews. Missing values are left out. */
export interface InvoiceSummary {
  /** Invoice number (BT-1). */
  number?: string;
  /** Invoice type code (BT-3), e.g. "380" invoice, "381" credit note. */
  typeCode?: string;
  /** Issue date (BT-2) as YYYY-MM-DD. */
  issueDate?: string;
  /** Payment due date (BT-9) as YYYY-MM-DD. */
  dueDate?: string;
  /** Currency (BT-5). */
  currency?: string;
  /** Buyer reference (BT-10), in XRechnung usually the Leitweg-ID. */
  buyerReference?: string;
  /** Purchase order reference (BT-13). */
  orderReference?: string;
  seller: { name?: string; vatId?: string; country?: string };
  buyer: { name?: string; vatId?: string; country?: string };
  /** Sum of invoice line net amounts (BT-106). */
  lineTotal?: string;
  /** Total without VAT (BT-109). */
  taxExclusiveTotal?: string;
  /** Total VAT (BT-110). */
  taxTotal?: string;
  /** Total with VAT (BT-112). */
  taxInclusiveTotal?: string;
  /** Amount due for payment (BT-115). */
  payableAmount?: string;
  /** Number of invoice lines. */
  lineCount: number;
}

const namespaces = new Map<string, string>([
  ["cbc", NS.cbc],
  ["cac", NS.cac],
  ["rsm", NS.rsm],
  ["ram", NS.ram],
  ["udt", NS.udt],
]);

const UBL = {
  number: "/*/cbc:ID",
  typeCode: "/*/cbc:InvoiceTypeCode | /*/cbc:CreditNoteTypeCode",
  issueDate: "/*/cbc:IssueDate",
  dueDate: "/*/cbc:DueDate | /*/cac:PaymentMeans/cbc:PaymentDueDate",
  currency: "/*/cbc:DocumentCurrencyCode",
  buyerReference: "/*/cbc:BuyerReference",
  orderReference: "/*/cac:OrderReference/cbc:ID",
  sellerName: [
    "/*/cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName",
    "/*/cac:AccountingSupplierParty/cac:Party/cac:PartyName/cbc:Name",
  ],
  sellerVat: "/*/cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID",
  sellerCountry:
    "/*/cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cac:Country/cbc:IdentificationCode",
  buyerName: [
    "/*/cac:AccountingCustomerParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName",
    "/*/cac:AccountingCustomerParty/cac:Party/cac:PartyName/cbc:Name",
  ],
  buyerVat: "/*/cac:AccountingCustomerParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID",
  buyerCountry:
    "/*/cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cac:Country/cbc:IdentificationCode",
  lineTotal: "/*/cac:LegalMonetaryTotal/cbc:LineExtensionAmount",
  taxExclusiveTotal: "/*/cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount",
  taxTotal: "/*/cac:TaxTotal/cbc:TaxAmount[@currencyID = /*/cbc:DocumentCurrencyCode]",
  taxInclusiveTotal: "/*/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount",
  payableAmount: "/*/cac:LegalMonetaryTotal/cbc:PayableAmount",
  lines: "/*/cac:InvoiceLine | /*/cac:CreditNoteLine",
};

const T = "/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction";
const AG = `${T}/ram:ApplicableHeaderTradeAgreement`;
const ST = `${T}/ram:ApplicableHeaderTradeSettlement`;
const SUM = `${ST}/ram:SpecifiedTradeSettlementHeaderMonetarySummation`;

const CII = {
  number: "/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:ID",
  typeCode: "/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:TypeCode",
  issueDate: "/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString",
  dueDate: `${ST}/ram:SpecifiedTradePaymentTerms/ram:DueDateDateTime/udt:DateTimeString`,
  currency: `${ST}/ram:InvoiceCurrencyCode`,
  buyerReference: `${AG}/ram:BuyerReference`,
  orderReference: `${AG}/ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID`,
  sellerName: `${AG}/ram:SellerTradeParty/ram:Name`,
  sellerVat: `${AG}/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']`,
  sellerCountry: `${AG}/ram:SellerTradeParty/ram:PostalTradeAddress/ram:CountryID`,
  buyerName: `${AG}/ram:BuyerTradeParty/ram:Name`,
  buyerVat: `${AG}/ram:BuyerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID = 'VA']`,
  buyerCountry: `${AG}/ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CountryID`,
  lineTotal: `${SUM}/ram:LineTotalAmount`,
  taxExclusiveTotal: `${SUM}/ram:TaxBasisTotalAmount`,
  taxTotal: `${SUM}/ram:TaxTotalAmount[@currencyID = ${ST}/ram:InvoiceCurrencyCode or not(@currencyID)]`,
  taxInclusiveTotal: `${SUM}/ram:GrandTotalAmount`,
  payableAmount: `${SUM}/ram:DuePayableAmount`,
  lines: `${T}/ram:IncludedSupplyChainTradeLineItem`,
};

function cii102(value: string | undefined): string | undefined {
  if (!value) return value;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : value;
}

/** Reads the key facts of a UBL or CII invoice. */
export function summarize(doc: XNode, syntax: Syntax): InvoiceSummary {
  const paths: Record<keyof typeof UBL, string | string[]> = syntax === "cii" ? CII : UBL;
  const env = {
    item: doc,
    position: 1,
    size: 1,
    vars: new Map(),
    functions: builtinFunctions,
    current: doc,
  };
  const get = (path: string | string[]): string | undefined => {
    if (Array.isArray(path)) {
      for (const p of path) {
        const v = get(p);
        if (v !== undefined) return v;
      }
      return undefined;
    }
    try {
      const r = evaluate(parseXPath(path, namespaces), env);
      const first = r[0];
      if (first === undefined) return undefined;
      const s = stringOf(first).trim();
      return s === "" ? undefined : s;
    } catch {
      return undefined;
    }
  };
  const count = (path: string | string[]): number => {
    try {
      return evaluate(parseXPath(String(path), namespaces), env).length;
    } catch {
      return 0;
    }
  };
  const summary: InvoiceSummary = {
    number: get(paths.number),
    typeCode: get(paths.typeCode),
    issueDate: syntax === "cii" ? cii102(get(paths.issueDate)) : get(paths.issueDate),
    dueDate: syntax === "cii" ? cii102(get(paths.dueDate)) : get(paths.dueDate),
    currency: get(paths.currency),
    buyerReference: get(paths.buyerReference),
    orderReference: get(paths.orderReference),
    seller: {
      name: get(paths.sellerName),
      vatId: get(paths.sellerVat),
      country: get(paths.sellerCountry),
    },
    buyer: {
      name: get(paths.buyerName),
      vatId: get(paths.buyerVat),
      country: get(paths.buyerCountry),
    },
    lineTotal: get(paths.lineTotal),
    taxExclusiveTotal: get(paths.taxExclusiveTotal),
    taxTotal: get(paths.taxTotal),
    taxInclusiveTotal: get(paths.taxInclusiveTotal),
    payableAmount: get(paths.payableAmount),
    lineCount: count(paths.lines),
  };
  return JSON.parse(JSON.stringify(summary)) as InvoiceSummary;
}
