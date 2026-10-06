import type { SchemaModel } from "../xsd-model";
import cii from "./cii.json";
import ubl from "./ubl.json";

export type SchemaId = "ubl-2.1" | "cii-d16b";

export interface SchemaInfo {
  id: SchemaId;
  name: string;
  version: string;
  source: string;
  license: string;
}

/** The bundled XML Schemas (compiled from the official XSD files) and their versions. */
export const SCHEMAS: Record<SchemaId, SchemaInfo> = {
  "ubl-2.1": {
    id: "ubl-2.1",
    name: "OASIS UBL 2.1 Invoice and CreditNote schema",
    version: "2.1",
    source: "https://docs.oasis-open.org/ubl/os-UBL-2.1/",
    license: "OASIS (see NOTICE.md)",
  },
  "cii-d16b": {
    id: "cii-d16b",
    name: "UN/CEFACT Cross Industry Invoice schema D16B (SCRDM subset, uncoupled code lists)",
    version: "100.D16B",
    source: "https://github.com/ConnectingEurope/eInvoicing-EN16931",
    license: "UN/CEFACT (see NOTICE.md)",
  },
};

const models: Record<SchemaId, SchemaModel> = {
  "ubl-2.1": ubl as unknown as SchemaModel,
  "cii-d16b": cii as unknown as SchemaModel,
};

/** The compiled model of a bundled schema. */
export function schemaModel(id: SchemaId): SchemaModel {
  return models[id];
}
