import type { CompiledRuleSet } from "../schematron";
import en16931Cii from "./en16931-cii.json";
import en16931Ubl from "./en16931-ubl.json";
import xrechnungCii from "./xrechnung-cii.json";
import xrechnungUbl from "./xrechnung-ubl.json";

export type RuleSetId = "en16931-ubl" | "en16931-cii" | "xrechnung-ubl" | "xrechnung-cii";

export interface RuleSetInfo {
  id: RuleSetId;
  name: string;
  version: string;
  source: string;
  license: string;
}

/** The bundled official rule sets and their versions. */
export const RULE_SETS: Record<RuleSetId, RuleSetInfo> = {
  "en16931-ubl": {
    id: "en16931-ubl",
    name: "EN 16931 validation artefacts (UBL)",
    version: "1.3.16",
    source: "https://github.com/ConnectingEurope/eInvoicing-EN16931",
    license: "EUPL-1.2",
  },
  "en16931-cii": {
    id: "en16931-cii",
    name: "EN 16931 validation artefacts (UN/CEFACT CII)",
    version: "1.3.16",
    source: "https://github.com/ConnectingEurope/eInvoicing-EN16931",
    license: "EUPL-1.2",
  },
  "xrechnung-ubl": {
    id: "xrechnung-ubl",
    name: "XRechnung Schematron (UBL), XRechnung 3.0",
    version: "2.6.0",
    source: "https://github.com/itplr-kosit/xrechnung-schematron",
    license: "Apache-2.0",
  },
  "xrechnung-cii": {
    id: "xrechnung-cii",
    name: "XRechnung Schematron (UN/CEFACT CII), XRechnung 3.0",
    version: "2.6.0",
    source: "https://github.com/itplr-kosit/xrechnung-schematron",
    license: "Apache-2.0",
  },
};

const compiled: Record<RuleSetId, CompiledRuleSet> = {
  "en16931-ubl": en16931Ubl as unknown as CompiledRuleSet,
  "en16931-cii": en16931Cii as unknown as CompiledRuleSet,
  "xrechnung-ubl": xrechnungUbl as unknown as CompiledRuleSet,
  "xrechnung-cii": xrechnungCii as unknown as CompiledRuleSet,
};

export function ruleSet(id: RuleSetId): CompiledRuleSet {
  return compiled[id];
}
