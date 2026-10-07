/**
 * The compact JSON form of a compiled XML Schema (see scripts/build-schemas.ts). Only the
 * declarations reachable from the root elements are included; named types are inlined into one
 * flat, deduplicated type table that is referenced by index.
 */

/** XSD built-in simple types the validator implements. */
export type BuiltinType =
  | "anySimpleType"
  | "string"
  | "normalizedString"
  | "token"
  | "language"
  | "Name"
  | "NCName"
  | "NMTOKEN"
  | "ID"
  | "IDREF"
  | "QName"
  | "anyURI"
  | "boolean"
  | "decimal"
  | "integer"
  | "nonNegativeInteger"
  | "positiveInteger"
  | "nonPositiveInteger"
  | "negativeInteger"
  | "long"
  | "int"
  | "short"
  | "byte"
  | "unsignedLong"
  | "unsignedInt"
  | "unsignedShort"
  | "unsignedByte"
  | "double"
  | "float"
  | "date"
  | "time"
  | "dateTime"
  | "gYear"
  | "gYearMonth"
  | "gMonth"
  | "gMonthDay"
  | "gDay"
  | "duration"
  | "base64Binary"
  | "hexBinary";

export interface Facets {
  enumeration?: string[];
  /** Patterns as anchored JavaScript sources ("u" flag); inner arrays are alternatives of one
   * derivation step (OR), the outer array combines derivation steps (AND). */
  pattern?: string[][];
  length?: number;
  minLength?: number;
  maxLength?: number;
  totalDigits?: number;
  fractionDigits?: number;
  minInclusive?: string;
  maxInclusive?: string;
  minExclusive?: string;
  maxExclusive?: string;
}

export interface SimpleTypeDef {
  k: "s";
  /** The built-in type the value is checked against first. */
  b: BuiltinType;
  f?: Facets;
}

/** [name, type index, required (1) or optional (0), fixed value]. Name is "local" or "ns:local". */
export type AttributeDef = [name: string, type: number, required: 0 | 1, fixed?: string];

/** [name ("ns:local"), type index, minOccurs, maxOccurs (-1 = unbounded)]. */
export type ElementParticle = [name: string, type: number, min: number, max: number];

export interface GroupParticle {
  /** sequence, choice or all */
  g: "s" | "c" | "a";
  i: Particle[];
  n: number;
  x: number;
}

/** A wildcard (xs:any). ns: allowed namespace indexes, not: excluded ones, neither: any. */
export interface AnyParticle {
  w: "skip" | "lax" | "strict";
  ns?: number[];
  not?: number[];
  n: number;
  x: number;
}

export type Particle = ElementParticle | GroupParticle | AnyParticle;

export interface ComplexTypeDef {
  k: "c";
  a?: AttributeDef[];
  /** Simple content: index of the simple type of the text. */
  s?: number;
  /** Element content. Neither s nor p: empty content. */
  p?: Particle;
  mixed?: 1;
  /** xs:anyType: any attributes, any content (validated laxly). */
  any?: 1;
}

export type TypeDef = SimpleTypeDef | ComplexTypeDef;

/**
 * A compiled XML Schema in the compact JSON form produced by `pnpm schemas`. The format is an
 * implementation detail of the schema validator and may change in a minor release.
 *
 * @beta
 */
export interface SchemaModel {
  /** Namespace URIs; names refer to them as "index:local". "" is the absent namespace. */
  ns: string[];
  types: TypeDef[];
  /**
   * Global element declarations reachable from the roots ("ns:local" → type index). With refs,
   * only the roots are listed and the other global declarations are taken from the particles.
   */
  elements: Record<string, number>;
  /** Set when every element particle refers to a global element declaration. */
  refs?: 1;
  /** Root element names ("ns:local"). */
  roots: string[];
}
