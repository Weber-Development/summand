import { documentElement, stringValue, type XNode } from "./xml";

export const NS = {
  ublInvoice: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  ublCreditNote: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  rsm: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
  zugferd1: "urn:ferd:CrossIndustryDocument:invoice:1p0",
} as const;

export type Syntax = "ubl-invoice" | "ubl-creditnote" | "cii";

export type ProfileId =
  | "xrechnung"
  | "xrechnung-extension"
  | "xrechnung-cvd"
  | "peppol-bis-billing-3"
  | "en16931"
  | "factur-x-basic"
  | "factur-x-extended"
  | "factur-x-basic-wl"
  | "factur-x-minimum"
  | "unknown";

export interface Profile {
  id: ProfileId;
  /** Human readable name, e.g. "XRechnung 3.0" or "ZUGFeRD / Factur-X EN 16931". */
  label: string;
  /** Specification identifier (BT-24) as found in the document. */
  specificationId: string;
  /** True when the profile is an EN 16931 compliant invoice. MINIMUM and BASIC WL are not. */
  en16931: boolean;
}

export interface Detection {
  syntax: Syntax;
  profile: Profile;
}

export type DetectionError = "not-an-invoice" | "zugferd-1";

function child(n: XNode | undefined, ns: string, local: string): XNode | undefined {
  return n?.children.find((c) => c.kind === "element" && c.ns === ns && c.local === local);
}

/** Recognises the syntax (UBL Invoice, UBL Credit Note, CII) and the profile of a parsed document. */
export function detect(doc: XNode): Detection | DetectionError {
  const root = documentElement(doc);
  if (!root) return "not-an-invoice";
  let syntax: Syntax;
  let specificationId = "";
  if (root.ns === NS.ublInvoice && root.local === "Invoice") syntax = "ubl-invoice";
  else if (root.ns === NS.ublCreditNote && root.local === "CreditNote") syntax = "ubl-creditnote";
  else if (root.ns === NS.rsm && root.local === "CrossIndustryInvoice") syntax = "cii";
  else if (root.ns === NS.zugferd1) return "zugferd-1";
  else return "not-an-invoice";

  if (syntax === "cii") {
    const ctx = child(root, NS.rsm, "ExchangedDocumentContext");
    const guideline = child(
      child(ctx, NS.ram, "GuidelineSpecifiedDocumentContextParameter"),
      NS.ram,
      "ID",
    );
    specificationId = guideline ? stringValue(guideline).trim() : "";
  } else {
    const c = child(root, NS.cbc, "CustomizationID");
    specificationId = c ? stringValue(c).trim() : "";
  }
  return { syntax, profile: profileFor(specificationId) };
}

/** Maps a specification identifier (BT-24) to a known profile. */
export function profileFor(specificationId: string): Profile {
  const s = specificationId.toLowerCase();
  const make = (id: ProfileId, label: string, en16931 = true): Profile => ({
    id,
    label,
    specificationId,
    en16931,
  });
  if (s.includes("xrechnung")) {
    const version = /xrechnung_(\d+\.\d+)/.exec(s)?.[1];
    const v = version ? ` ${version}` : "";
    if (s.includes("kosit:extension"))
      return make("xrechnung-extension", `XRechnung${v} Extension`);
    if (s.includes(":cvd")) return make("xrechnung-cvd", `XRechnung${v} CVD`);
    return make("xrechnung", `XRechnung${v}`);
  }
  if (s.includes("peppol")) return make("peppol-bis-billing-3", "Peppol BIS Billing 3.0");
  if (s.includes("factur-x.eu:1p0:minimum") || s.includes("zugferd.de:2p0:minimum")) {
    return make("factur-x-minimum", "ZUGFeRD / Factur-X MINIMUM", false);
  }
  if (s.includes("factur-x.eu:1p0:basicwl") || s.includes("zugferd.de:2p0:basicwl")) {
    return make("factur-x-basic-wl", "ZUGFeRD / Factur-X BASIC WL", false);
  }
  if (s.includes("factur-x.eu:1p0:basic") || s.includes("zugferd.de:2p0:basic")) {
    return make("factur-x-basic", "ZUGFeRD / Factur-X BASIC");
  }
  if (s.includes("factur-x.eu:1p0:extended") || s.includes("zugferd.de:2p0:extended")) {
    return make("factur-x-extended", "ZUGFeRD / Factur-X EXTENDED");
  }
  if (s.startsWith("urn:cen.eu:en16931:2017")) return make("en16931", "EN 16931");
  return make("unknown", specificationId ? "Unknown specification" : "No specification identifier");
}
