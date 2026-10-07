/**
 * XML Schema validation of invoice documents against the bundled UBL 2.1 and UN/CEFACT CII D16B
 * schemas (compiled to JSON by scripts/build-schemas.ts, see xsd-model.ts for the format).
 *
 * Checks element structure (unexpected elements, missing required elements, order, number of
 * occurrences), attributes (required, unknown, fixed values) and simple values (built-in types
 * such as xs:decimal and xs:date, and the facets of derived types). Wildcards follow their
 * processContents: "skip" ignores the content, "lax" validates elements that have a global
 * declaration in the compiled model, "strict" requires one.
 */
import { SCHEMAS, type SchemaId, type SchemaInfo, schemaModel } from "./schemas/index";
import { nodePath, stringValue, type XNode } from "./xml";
import type {
  AnyParticle,
  AttributeDef,
  BuiltinType,
  ComplexTypeDef,
  Facets,
  Particle,
  SchemaModel,
  SimpleTypeDef,
} from "./xsd-model";

/**
 * What kind of schema violation a {@link SchemaFinding} is. New kinds may be added in a minor
 * release, so handle unknown values.
 *
 * - `unexpected-element`: an element that is not allowed here
 * - `missing-element`: a required element is missing
 * - `element-order`: elements are in the wrong order
 * - `too-many`: an element occurs more often than allowed
 * - `content`: text or child elements where the type allows none, or the reverse
 * - `missing-attribute`: a required attribute is missing
 * - `unknown-attribute`: an attribute that is not declared
 * - `attribute-value`: an attribute has an invalid or non-fixed value
 * - `value`: the text of an element does not match its type or facets
 */
export type SchemaFindingKind =
  | "unexpected-element"
  | "missing-element"
  | "element-order"
  | "too-many"
  | "content"
  | "missing-attribute"
  | "unknown-attribute"
  | "attribute-value"
  | "value";

/** One violation found by {@link validateSchema}. In {@link validateInvoice} it becomes a "SUM-XSD" error. */
export interface SchemaFinding {
  /** Category of the violation. */
  kind: SchemaFindingKind;
  /** Human-readable text in the language of the `lang` option. */
  message: string;
  /** XPath of the element or attribute. */
  location: string;
  /** Line in the source document. */
  line: number;
}

export { SCHEMAS, type SchemaId, type SchemaInfo, schemaModel };

const XSI = "http://www.w3.org/2001/XMLSchema-instance";

// ---------------------------------------------------------------------------------------------
// Runtime form of a model
// ---------------------------------------------------------------------------------------------

interface Slot {
  key?: string;
  wild?: AnyParticle;
  min: number;
  max: number;
}

interface RtComplex {
  def: ComplexTypeDef;
  attrs: Map<string, AttributeDef>;
  required: AttributeDef[];
  /** Element declarations of the content model by name key. */
  decls: Map<string, number>;
  wildcards: AnyParticle[];
  slots: Slot[];
  /** True when the slots describe the content model exactly (a plain sequence). */
  exact: boolean;
}

interface Runtime {
  model: SchemaModel;
  nsIndex: Map<string, number>;
  /** Global element declarations (for wildcards and the root). */
  elements: Map<string, number>;
  complex: Array<RtComplex | undefined>;
}

const runtimes = new WeakMap<SchemaModel, Runtime>();

function runtime(model: SchemaModel): Runtime {
  let rt = runtimes.get(model);
  if (!rt) {
    const elements = new Map(Object.entries(model.elements));
    if (model.refs) {
      const visit = (p: Particle) => {
        if (Array.isArray(p)) elements.set(p[0], p[1]);
        else if ("i" in p) for (const item of p.i) visit(item);
      };
      for (const t of model.types) if (t.k === "c" && t.p) visit(t.p);
    }
    rt = {
      model,
      nsIndex: new Map(model.ns.map((ns, i) => [ns, i])),
      elements,
      complex: [],
    };
    runtimes.set(model, rt);
  }
  return rt;
}

const occursMax = (x: number) => (x === -1 ? Number.POSITIVE_INFINITY : x);

/** Inlines nested sequences that occur exactly once into their parent sequence. */
function flattenSequence(p: Particle): Particle[] | null {
  if (Array.isArray(p) || "w" in p) return [p];
  if (p.g !== "s" || p.n !== 1 || p.x !== 1) return null;
  const out: Particle[] = [];
  for (const item of p.i) {
    if (!Array.isArray(item) && "g" in item) {
      const inner = flattenSequence(item);
      if (!inner) return null;
      out.push(...inner);
    } else {
      out.push(item);
    }
  }
  return out;
}

function slotsOf(p: Particle, minMul: number, maxMul: number, out: Slot[]) {
  if (Array.isArray(p)) {
    out.push({ key: p[0], min: p[2] * minMul, max: occursMax(p[3]) * maxMul });
    return;
  }
  if ("w" in p) {
    out.push({ wild: p, min: p.n * minMul, max: occursMax(p.x) * maxMul });
    return;
  }
  const min = p.g === "c" && p.i.length > 1 ? 0 : p.n * minMul;
  const max = occursMax(p.x) * maxMul;
  for (const item of p.i) slotsOf(item, min, max, out);
}

function collectDecls(p: Particle, decls: Map<string, number>, wildcards: AnyParticle[]) {
  if (Array.isArray(p)) decls.set(p[0], p[1]);
  else if ("w" in p) wildcards.push(p);
  else for (const item of p.i) collectDecls(item, decls, wildcards);
}

function rtComplex(rt: Runtime, index: number): RtComplex {
  let c = rt.complex[index];
  if (c) return c;
  const def = rt.model.types[index] as ComplexTypeDef;
  const attrs = new Map<string, AttributeDef>();
  const required: AttributeDef[] = [];
  for (const a of def.a ?? []) {
    attrs.set(a[0], a);
    if (a[2] === 1) required.push(a);
  }
  const decls = new Map<string, number>();
  const wildcards: AnyParticle[] = [];
  const slots: Slot[] = [];
  let exact = true;
  if (def.p) {
    collectDecls(def.p, decls, wildcards);
    const flat = flattenSequence(def.p);
    if (flat) {
      for (const item of flat) slotsOf(item, 1, 1, slots);
      const keys = slots.filter((s) => s.key).map((s) => s.key);
      exact = new Set(keys).size === keys.length && slots.every((s) => s.max >= s.min);
    } else {
      slotsOf(def.p, 1, 1, slots);
      exact = false;
    }
  }
  c = { def, attrs, required, decls, wildcards, slots, exact };
  rt.complex[index] = c;
  return c;
}

// ---------------------------------------------------------------------------------------------
// Simple values
// ---------------------------------------------------------------------------------------------

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const INTEGER = /^[+-]?\d+$/;
const DOUBLE = /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|-?INF|NaN)$/;
const TZ = "(Z|[+-]\\d{2}:\\d{2})?";
const DATE = new RegExp(`^(-?\\d{4,})-(\\d{2})-(\\d{2})${TZ}$`);
const TIME = new RegExp(`^(\\d{2}):(\\d{2}):(\\d{2}(?:\\.\\d+)?)${TZ}$`);
const DATE_TIME = new RegExp(
  `^(-?\\d{4,})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2}(?:\\.\\d+)?)${TZ}$`,
);
const G_YEAR = new RegExp(`^(-?\\d{4,})${TZ}$`);
const G_YEAR_MONTH = new RegExp(`^(-?\\d{4,})-(\\d{2})${TZ}$`);
const G_MONTH = new RegExp(`^--(\\d{2})${TZ}$`);
const G_MONTH_DAY = new RegExp(`^--(\\d{2})-(\\d{2})${TZ}$`);
const G_DAY = new RegExp(`^---(\\d{2})${TZ}$`);
const DURATION =
  /^-?P(?=\d|T\d)(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/;
const LANGUAGE = /^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/;
const HEX = /^(?:[0-9a-fA-F]{2})*$/;
const NAME_START =
  "A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const NAME_CHAR = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
const NCNAME = new RegExp(`^[${NAME_START}][${NAME_CHAR}]*$`, "u");
const NAME = new RegExp(`^[:${NAME_START}][:${NAME_CHAR}]*$`, "u");
const NMTOKEN = new RegExp(`^[:${NAME_CHAR}]+$`, "u");
const QNAME = new RegExp(
  `^(?:[${NAME_START}][${NAME_CHAR}]*:)?[${NAME_START}][${NAME_CHAR}]*$`,
  "u",
);

const INTEGER_RANGES: Partial<Record<BuiltinType, [bigint | null, bigint | null]>> = {
  nonNegativeInteger: [0n, null],
  positiveInteger: [1n, null],
  nonPositiveInteger: [null, 0n],
  negativeInteger: [null, -1n],
  long: [-(2n ** 63n), 2n ** 63n - 1n],
  int: [-(2n ** 31n), 2n ** 31n - 1n],
  short: [-32768n, 32767n],
  byte: [-128n, 127n],
  unsignedLong: [0n, 2n ** 64n - 1n],
  unsignedInt: [0n, 2n ** 32n - 1n],
  unsignedShort: [0n, 65535n],
  unsignedByte: [0n, 255n],
};

/** Description of the expected format: [English hint, German predicate]. */
const TYPE_HINTS: Partial<Record<BuiltinType, [string, string]>> = {
  decimal: ["a decimal number such as 123.45", "ist keine gültige Dezimalzahl (z. B. 123.45)"],
  integer: ["an integer", "ist keine gültige ganze Zahl"],
  boolean: ["true, false, 1 or 0", "ist kein gültiger Wahrheitswert (true, false, 1 oder 0)"],
  date: ["a date YYYY-MM-DD", "ist kein gültiges Datum (JJJJ-MM-TT)"],
  time: ["a time hh:mm:ss", "ist keine gültige Uhrzeit (hh:mm:ss)"],
  dateTime: [
    "a date and time YYYY-MM-DDThh:mm:ss",
    "ist kein gültiger Zeitpunkt (JJJJ-MM-TTThh:mm:ss)",
  ],
  base64Binary: ["Base64 data", "sind keine gültigen Base64-Daten"],
  hexBinary: ["hexadecimal data", "sind keine gültigen Hexadezimaldaten"],
  language: [
    "a language code such as de or en-GB",
    "ist kein gültiger Sprachcode (z. B. de oder en-GB)",
  ],
  double: ["a floating point number", "ist keine gültige Gleitkommazahl"],
  float: ["a floating point number", "ist keine gültige Gleitkommazahl"],
};

function isLeap(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysIn(month: number, year: number) {
  return month === 2 ? (isLeap(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validYear(y: string) {
  const digits = y.replace(/^-/, "");
  return !(digits.length > 4 && digits.startsWith("0")) && !/^0+$/.test(digits);
}

function validTz(tz: string | undefined) {
  if (!tz || tz === "Z") return true;
  const h = Number(tz.slice(1, 3));
  const m = Number(tz.slice(4, 6));
  return m <= 59 && (h < 14 || (h === 14 && m === 0));
}

function validDate(y: string, mo: string, d: string) {
  const month = Number(mo);
  const day = Number(d);
  // The leap-year rule uses the proleptic Gregorian calendar; -0001 is a leap year (year 0).
  const year = Number(y) < 0 ? Number(y) + 1 : Number(y);
  return validYear(y) && month >= 1 && month <= 12 && day >= 1 && day <= daysIn(month, year);
}

function validTime(h: string, m: string, s: string) {
  const hh = Number(h);
  const mm = Number(m);
  const ss = Number(s);
  if (hh === 24) return mm === 0 && ss === 0;
  return hh < 24 && mm < 60 && ss < 60;
}

function validBase64(v: string) {
  const s = v.replace(/ /g, "");
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return false;
  if (s.endsWith("==")) return /[AQgw]==$/.test(s);
  if (s.endsWith("=")) return /[AEIMQUYcgkosw048]=$/.test(s);
  return true;
}

function builtinValid(b: BuiltinType, v: string): boolean {
  switch (b) {
    case "anySimpleType":
    case "string":
    case "normalizedString":
    case "token":
    case "anyURI":
      return true;
    case "language":
      return LANGUAGE.test(v);
    case "Name":
      return NAME.test(v);
    case "NCName":
    case "ID":
    case "IDREF":
      return NCNAME.test(v);
    case "NMTOKEN":
      return NMTOKEN.test(v);
    case "QName":
      return QNAME.test(v);
    case "boolean":
      return v === "true" || v === "false" || v === "1" || v === "0";
    case "decimal":
      return DECIMAL.test(v);
    case "double":
    case "float":
      return DOUBLE.test(v);
    case "date": {
      const m = DATE.exec(v);
      return !!m && validDate(m[1] as string, m[2] as string, m[3] as string) && validTz(m[4]);
    }
    case "time": {
      const m = TIME.exec(v);
      return !!m && validTime(m[1] as string, m[2] as string, m[3] as string) && validTz(m[4]);
    }
    case "dateTime": {
      const m = DATE_TIME.exec(v);
      return (
        !!m &&
        validDate(m[1] as string, m[2] as string, m[3] as string) &&
        validTime(m[4] as string, m[5] as string, m[6] as string) &&
        validTz(m[7])
      );
    }
    case "gYear": {
      const m = G_YEAR.exec(v);
      return !!m && validYear(m[1] as string) && validTz(m[2]);
    }
    case "gYearMonth": {
      const m = G_YEAR_MONTH.exec(v);
      const month = Number(m?.[2]);
      return !!m && validYear(m[1] as string) && month >= 1 && month <= 12 && validTz(m[3]);
    }
    case "gMonth": {
      const m = G_MONTH.exec(v);
      const month = Number(m?.[1]);
      return !!m && month >= 1 && month <= 12 && validTz(m[2]);
    }
    case "gMonthDay": {
      const m = G_MONTH_DAY.exec(v);
      return !!m && validDate("2000", m[1] as string, m[2] as string) && validTz(m[3]);
    }
    case "gDay": {
      const m = G_DAY.exec(v);
      const day = Number(m?.[1]);
      return !!m && day >= 1 && day <= 31 && validTz(m[2]);
    }
    case "duration":
      return DURATION.test(v);
    case "base64Binary":
      return validBase64(v);
    case "hexBinary":
      return HEX.test(v);
    default: {
      if (!INTEGER.test(v)) return false;
      const range = INTEGER_RANGES[b];
      if (!range) return b === "integer";
      const n = BigInt(v);
      return (range[0] === null || n >= range[0]) && (range[1] === null || n <= range[1]);
    }
  }
}

function whitespace(b: BuiltinType, v: string): string {
  if (b === "string" || b === "anySimpleType") return v;
  if (b === "normalizedString") return v.replace(/[\t\n\r]/g, " ");
  return v.replace(/[\t\n\r ]+/g, " ").trim();
}

/** Splits a decimal lexical value into sign, integer digits and fraction digits (normalised). */
function decimalParts(v: string): { neg: boolean; int: string; frac: string } {
  let s = v;
  let neg = false;
  if (s[0] === "+" || s[0] === "-") {
    neg = s[0] === "-";
    s = s.slice(1);
  }
  const [i = "", f = ""] = s.split(".");
  const int = i.replace(/^0+/, "");
  const frac = f.replace(/0+$/, "");
  if (int === "" && frac === "") neg = false;
  return { neg, int, frac };
}

function compareDecimal(a: string, b: string): number {
  const x = decimalParts(a);
  const y = decimalParts(b);
  if (x.neg !== y.neg) return x.neg ? -1 : 1;
  const sign = x.neg ? -1 : 1;
  if (x.int.length !== y.int.length) return (x.int.length < y.int.length ? -1 : 1) * sign;
  if (x.int !== y.int) return (x.int < y.int ? -1 : 1) * sign;
  const len = Math.max(x.frac.length, y.frac.length);
  const fx = x.frac.padEnd(len, "0");
  const fy = y.frac.padEnd(len, "0");
  return fx === fy ? 0 : (fx < fy ? -1 : 1) * sign;
}

const patternCache = new Map<string, RegExp>();
function pattern(source: string): RegExp {
  let r = patternCache.get(source);
  if (!r) {
    r = new RegExp(source, "u");
    patternCache.set(source, r);
  }
  return r;
}

function valueLength(b: BuiltinType, v: string): number {
  if (b === "hexBinary") return v.length / 2;
  if (b === "base64Binary") {
    const s = v.replace(/ /g, "");
    return (s.length / 4) * 3 - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0);
  }
  return Array.from(v).length;
}

/** Checks facets; returns a description of the first violation. */
function facetError(b: BuiltinType, v: string, f: Facets, de: boolean): string | null {
  const tr = (en: string, german: string) => (de ? german : en);
  if (f.enumeration && !f.enumeration.includes(v)) {
    const list = f.enumeration.slice(0, 10).join(", ");
    const more = f.enumeration.length > 10 ? ", ..." : "";
    return tr(
      `is not one of the allowed values (${list}${more})`,
      `ist keiner der zulässigen Werte (${list}${more})`,
    );
  }
  if (f.pattern) {
    for (const step of f.pattern) {
      if (!step.some((p) => pattern(p).test(v)))
        return tr(
          "does not match the required pattern",
          "entspricht nicht dem vorgeschriebenen Muster",
        );
    }
  }
  const len =
    f.length !== undefined || f.minLength !== undefined || f.maxLength !== undefined
      ? valueLength(b, v)
      : 0;
  if (f.length !== undefined && len !== f.length)
    return tr(
      `must have length ${f.length} (has ${len})`,
      `muss die Länge ${f.length} haben (hat ${len})`,
    );
  if (f.minLength !== undefined && len < f.minLength)
    return tr(
      `is shorter than the minimum length ${f.minLength}`,
      `ist kürzer als die Mindestlänge ${f.minLength}`,
    );
  if (f.maxLength !== undefined && len > f.maxLength)
    return tr(
      `is longer than the maximum length ${f.maxLength}`,
      `ist länger als die Höchstlänge ${f.maxLength}`,
    );
  if (f.totalDigits !== undefined || f.fractionDigits !== undefined) {
    const { int, frac } = decimalParts(v);
    if (f.totalDigits !== undefined && int.length + frac.length > f.totalDigits)
      return tr(`has more than ${f.totalDigits} digits`, `hat mehr als ${f.totalDigits} Stellen`);
    if (f.fractionDigits !== undefined && frac.length > f.fractionDigits)
      return tr(
        `has more than ${f.fractionDigits} fraction digits`,
        `hat mehr als ${f.fractionDigits} Nachkommastellen`,
      );
  }
  if (f.minInclusive !== undefined && compareDecimal(v, f.minInclusive) < 0)
    return tr(`is less than ${f.minInclusive}`, `ist kleiner als ${f.minInclusive}`);
  if (f.maxInclusive !== undefined && compareDecimal(v, f.maxInclusive) > 0)
    return tr(`is greater than ${f.maxInclusive}`, `ist größer als ${f.maxInclusive}`);
  if (f.minExclusive !== undefined && compareDecimal(v, f.minExclusive) <= 0)
    return tr(`must be greater than ${f.minExclusive}`, `muss größer als ${f.minExclusive} sein`);
  if (f.maxExclusive !== undefined && compareDecimal(v, f.maxExclusive) >= 0)
    return tr(`must be less than ${f.maxExclusive}`, `muss kleiner als ${f.maxExclusive} sein`);
  return null;
}

/** Validates a simple value; returns the normalised value and an error description. */
function checkSimple(
  t: SimpleTypeDef,
  raw: string,
  de: boolean,
): { value: string; error: string | null } {
  const value = whitespace(t.b, raw);
  if (!builtinValid(t.b, value)) {
    const hint = TYPE_HINTS[t.b];
    const error = de
      ? (hint?.[1] ?? `ist kein gültiger Wert vom Typ xs:${t.b}`)
      : `is not a valid xs:${t.b}${hint ? ` (expected ${hint[0]})` : ""}`;
    return { value, error };
  }
  return { value, error: t.f ? facetError(t.b, value, t.f, de) : null };
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

const quote = (v: string) => JSON.stringify(v.length > 60 ? `${v.slice(0, 57)}...` : v);

function displayName(n: XNode): string {
  return n.prefix ? `${n.prefix}:${n.local}` : n.local;
}

class Validator {
  readonly findings: SchemaFinding[] = [];
  constructor(
    readonly rt: Runtime,
    readonly de = false,
  ) {}

  /** Picks the message in the requested language. */
  t(en: string, de: string): string {
    return this.de ? de : en;
  }

  report(kind: SchemaFindingKind, node: XNode, message: string) {
    this.findings.push({ kind, message, location: nodePath(node), line: node.line });
  }

  key(n: XNode): string | undefined {
    const i = this.rt.nsIndex.get(n.ns);
    return i === undefined ? undefined : `${i}:${n.local}`;
  }

  /** Display name for a model name key, using a prefix in scope at the context node. */
  modelName(key: string, context: XNode): string {
    const colon = key.indexOf(":");
    const ns = this.rt.model.ns[Number(key.slice(0, colon))] ?? "";
    const local = key.slice(colon + 1);
    if (ns === "") return local;
    for (let x: XNode | null = context; x; x = x.parent) {
      if (!x.namespaces) continue;
      for (const [prefix, uri] of x.namespaces) {
        if (uri === ns) return prefix ? `${prefix}:${local}` : local;
      }
    }
    return `{${ns}}${local}`;
  }

  slotName(s: Slot, context: XNode): string {
    if (s.key) return this.modelName(s.key, context);
    return this.t("any element", "beliebiges Element");
  }

  wildcardMatches(w: AnyParticle, n: XNode): boolean {
    const i = this.rt.nsIndex.get(n.ns) ?? -1;
    if (w.ns) return w.ns.includes(i);
    if (w.not) {
      // Namespaces outside the model never equal an excluded one, except the absent namespace.
      if (i === -1) return n.ns !== "";
      return !w.not.includes(i);
    }
    return true;
  }

  validateElement(el: XNode, typeIndex: number) {
    const t = this.rt.model.types[typeIndex];
    if (!t) return;
    let nil = false;
    for (const a of el.attributes) {
      if (a.ns !== XSI) continue;
      if (a.local === "nil" && (a.value.trim() === "true" || a.value.trim() === "1")) nil = true;
      if (a.local === "type") return; // xsi:type substitutes the type: not supported, skipped
    }
    if (nil) {
      this.report(
        "content",
        el,
        this.t(
          `${displayName(el)} is not nillable (xsi:nil is not allowed).`,
          `${displayName(el)} darf nicht leer sein (xsi:nil ist nicht erlaubt).`,
        ),
      );
      return;
    }
    if (t.k === "s") {
      this.checkNoAttributes(el);
      this.checkSimpleContent(el, t);
      return;
    }
    if (t.any) {
      this.validateLaxChildren(el);
      return;
    }
    const c = rtComplex(this.rt, typeIndex);
    this.checkAttributes(el, c);
    if (t.s !== undefined) {
      this.checkSimpleContent(el, this.rt.model.types[t.s] as SimpleTypeDef);
      return;
    }
    const kids: XNode[] = [];
    for (const child of el.children) {
      if (child.kind === "element") kids.push(child);
      else if (child.kind === "text" && !t.mixed && /[^ \t\r\n]/.test(child.value)) {
        this.report(
          "content",
          el,
          this.t(
            `${displayName(el)} must not contain text, only child elements (found ${quote(child.value.trim())}).`,
            `${displayName(el)} darf keinen Text enthalten, nur Unterelemente (gefunden: ${quote(child.value.trim())}).`,
          ),
        );
      }
    }
    if (!t.p) {
      if (kids.length > 0)
        this.report(
          "unexpected-element",
          kids[0] as XNode,
          this.t(
            `${displayName(el)} must be empty, but contains ${displayName(kids[0] as XNode)}.`,
            `${displayName(el)} muss leer sein, enthält aber ${displayName(kids[0] as XNode)}.`,
          ),
        );
      return;
    }
    this.checkContent(el, c, kids);
    for (const kid of kids) this.validateChild(kid, c);
  }

  validateChild(kid: XNode, c: RtComplex) {
    const k = this.key(kid);
    const type = k === undefined ? undefined : c.decls.get(k);
    if (type !== undefined) {
      this.validateElement(kid, type);
      return;
    }
    const w = c.wildcards.find((x) => this.wildcardMatches(x, kid));
    if (w) this.validateWildcardElement(kid, w.w);
    // Elements that match nothing were reported by checkContent; their content is not checked.
  }

  validateWildcardElement(el: XNode, mode: AnyParticle["w"]) {
    if (mode === "skip") return;
    const k = this.key(el);
    const global = k === undefined ? undefined : this.rt.elements.get(k);
    if (global !== undefined) {
      this.validateElement(el, global);
      return;
    }
    if (mode === "strict") {
      this.report(
        "unexpected-element",
        el,
        this.t(
          `${displayName(el)} has no schema declaration but must be validated strictly.`,
          `Unerwartetes Element ${displayName(el)}: Es ist im Schema nicht deklariert, muss aber streng geprüft werden.`,
        ),
      );
      return;
    }
    this.validateLaxChildren(el);
  }

  validateLaxChildren(el: XNode) {
    for (const child of el.children) {
      if (child.kind === "element") this.validateWildcardElement(child, "lax");
    }
  }

  checkNoAttributes(el: XNode) {
    for (const a of el.attributes) {
      if (a.ns === XSI) continue;
      this.report(
        "unknown-attribute",
        a,
        this.t(
          `Attribute ${displayName(a)} is not allowed on ${displayName(el)}.`,
          `Attribut ${displayName(a)} ist an ${displayName(el)} nicht erlaubt.`,
        ),
      );
    }
  }

  checkAttributes(el: XNode, c: RtComplex) {
    const seen = new Set<string>();
    for (const a of el.attributes) {
      if (a.ns === XSI) continue;
      let k: string | undefined;
      if (a.ns === "") k = a.local;
      else {
        const i = this.rt.nsIndex.get(a.ns);
        k = i === undefined ? undefined : `${i}:${a.local}`;
      }
      const def = k === undefined ? undefined : c.attrs.get(k);
      if (!def) {
        if (c.def.any) continue;
        this.report(
          "unknown-attribute",
          a,
          this.t(
            `Attribute ${displayName(a)} is not allowed on ${displayName(el)}.`,
            `Attribut ${displayName(a)} ist an ${displayName(el)} nicht erlaubt.`,
          ),
        );
        continue;
      }
      seen.add(def[0]);
      const t = this.rt.model.types[def[1]] as SimpleTypeDef;
      const { value, error } = checkSimple(t, a.value, this.de);
      if (error) {
        this.report(
          "attribute-value",
          a,
          this.t(
            `Value ${quote(a.value)} of attribute ${displayName(a)} on ${displayName(el)} ${error}.`,
            `Wert ${quote(a.value)} des Attributs ${displayName(a)} an ${displayName(el)} ${error}.`,
          ),
        );
      } else if (def[3] !== undefined && value !== whitespace(t.b, def[3])) {
        this.report(
          "attribute-value",
          a,
          this.t(
            `Attribute ${displayName(a)} on ${displayName(el)} must have the fixed value ${quote(def[3])}, found ${quote(a.value)}.`,
            `Attribut ${displayName(a)} an ${displayName(el)} muss den festen Wert ${quote(def[3])} haben, gefunden: ${quote(a.value)}.`,
          ),
        );
      }
    }
    for (const def of c.required) {
      if (seen.has(def[0])) continue;
      const name = def[0].includes(":") ? this.modelName(def[0], el) : def[0];
      this.report(
        "missing-attribute",
        el,
        this.t(
          `Required attribute ${name} is missing on ${displayName(el)}.`,
          `Pflichtattribut ${name} fehlt an ${displayName(el)}.`,
        ),
      );
    }
  }

  checkSimpleContent(el: XNode, t: SimpleTypeDef) {
    let hasChild = false;
    for (const child of el.children) {
      if (child.kind === "element") {
        hasChild = true;
        this.report(
          "unexpected-element",
          child,
          this.t(
            `${displayName(el)} has a simple value and must not contain the element ${displayName(child)}.`,
            `Unerwartetes Element ${displayName(child)}: ${displayName(el)} hat einen einfachen Wert und darf keine Unterelemente enthalten.`,
          ),
        );
      }
    }
    if (hasChild) return;
    const raw = stringValue(el);
    const { error } = checkSimple(t, raw, this.de);
    if (error)
      this.report(
        "value",
        el,
        this.t(
          `Value ${quote(raw)} of ${displayName(el)} ${error}.`,
          `Wert ${quote(raw)} von ${displayName(el)} ${error}.`,
        ),
      );
  }

  // -------------------------------------------------------------------------------------------
  // Content models
  // -------------------------------------------------------------------------------------------

  checkContent(el: XNode, c: RtComplex, kids: XNode[]) {
    if (!c.exact) {
      const p = c.def.p as Particle;
      if (this.match(p, kids, 0) === kids.length) return;
      const before = this.findings.length;
      this.diagnose(el, c, kids);
      if (this.findings.length === before) {
        const expected = [...new Set(c.slots.map((s) => this.slotName(s, el)))].join(", ");
        this.report(
          "content",
          el,
          this.t(
            `The content of ${displayName(el)} does not match its schema type (allowed: ${expected}).`,
            `Der Inhalt von ${displayName(el)} entspricht nicht seinem Schematyp (erlaubt: ${expected}).`,
          ),
        );
      }
      return;
    }
    this.diagnose(el, c, kids);
  }

  slotMatches(s: Slot, kid: XNode, k: string | undefined): boolean {
    if (s.key !== undefined) return s.key === k;
    return this.wildcardMatches(s.wild as AnyParticle, kid);
  }

  /**
   * Walks the children along the slots of the content model and reports missing, unexpected,
   * misplaced and repeated elements. Exact for plain sequences (the common case); a diagnosis
   * aid for other models, which are checked by {@link match} first.
   */
  diagnose(el: XNode, c: RtComplex, kids: XNode[]) {
    const slots = c.slots;
    const firstAt: Array<XNode | undefined> = [];
    // Required slots that were skipped, reported at the end unless the element turns up later
    // in the wrong position or an unexpected element stands in its place.
    const missing = new Map<number, XNode | undefined>();
    const standIn = new Set<number>();
    let i = 0;
    let count = 0;
    for (const kid of kids) {
      const k = this.key(kid);
      const slot = slots[i];
      if (slot && this.slotMatches(slot, kid, k) && count < slot.max) {
        count++;
        firstAt[i] ??= kid;
        continue;
      }
      let j = -1;
      for (let x = i + 1; x < slots.length; x++) {
        if (this.slotMatches(slots[x] as Slot, kid, k)) {
          j = x;
          break;
        }
      }
      if (j !== -1) {
        if (slot && count < slot.min) missing.set(i, kid);
        for (let x = i + 1; x < j; x++) if ((slots[x] as Slot).min > 0) missing.set(x, kid);
        i = j;
        count = 1;
        firstAt[i] ??= kid;
        continue;
      }
      if (slot && this.slotMatches(slot, kid, k)) {
        this.report(
          "too-many",
          kid,
          this.t(
            `${displayName(kid)} occurs too often in ${displayName(el)} (at most ${slot.max} allowed).`,
            `${displayName(kid)} kommt in ${displayName(el)} zu oft vor (höchstens ${slot.max} erlaubt).`,
          ),
        );
        continue;
      }
      let earlier = -1;
      for (let x = 0; x < i; x++) {
        if (this.slotMatches(slots[x] as Slot, kid, k)) {
          earlier = x;
          break;
        }
      }
      if (earlier !== -1) {
        missing.delete(earlier);
        let next: XNode | undefined;
        for (let x = earlier + 1; x <= i && !next; x++) next = firstAt[x];
        this.report(
          "element-order",
          kid,
          this.t(
            `${displayName(kid)} is in the wrong position in ${displayName(el)}${next ? `: it must come before ${displayName(next)}` : ""}.`,
            `${displayName(kid)} steht in ${displayName(el)} an der falschen Stelle${next ? `: Es muss vor ${displayName(next)} stehen` : ""}.`,
          ),
        );
        continue;
      }
      let expected: string[] = [];
      for (let x = i; x < slots.length; x++) {
        const s = slots[x] as Slot;
        if (x === i && count >= s.max) continue;
        expected.push(this.slotName(s, el));
        if (s.min > 0 && (x > i || count < s.min)) {
          // The unexpected element stands where this required one belongs: one error is enough.
          standIn.add(x);
          if (x === i) count = s.min;
          break;
        }
      }
      if (expected.length > 6) expected = [...expected.slice(0, 5), "...", ...expected.slice(-1)];
      this.report(
        "unexpected-element",
        kid,
        this.t(
          `${displayName(kid)} is not allowed in ${displayName(el)}${expected.length ? ` (expected ${expected.join(", ")})` : ""}.`,
          `Unerwartetes Element ${displayName(kid)} in ${displayName(el)}${expected.length ? ` (erwartet: ${expected.join(", ")})` : ""}.`,
        ),
      );
    }
    const slot = slots[i];
    if (slot && count < slot.min && !missing.has(i)) missing.set(i, undefined);
    for (let x = i + 1; x < slots.length; x++) {
      if ((slots[x] as Slot).min > 0 && !missing.has(x)) missing.set(x, undefined);
    }
    // Group the missing elements by the element they were expected before.
    const groups = new Map<XNode | undefined, string[]>();
    for (const x of [...missing.keys()].sort((a, b) => a - b)) {
      if (standIn.has(x)) continue; // an unexpected element was reported in its place
      const before = missing.get(x);
      const names = groups.get(before) ?? [];
      names.push(this.slotName(slots[x] as Slot, el));
      groups.set(before, names);
    }
    for (const [before, names] of groups) this.reportMissing(el, names, before);
  }

  reportMissing(el: XNode, names: string[], before?: XNode) {
    const where = displayName(el);
    const ahead = before ? displayName(before) : "";
    const message = this.de
      ? `${names.length === 1 ? `Pflichtelement ${names[0]} fehlt` : `Pflichtelemente ${names.join(", ")} fehlen`} in ${where}${ahead ? ` (erwartet vor ${ahead})` : ""}.`
      : `${names.length === 1 ? `Required element ${names[0]} is missing` : `Required elements ${names.join(", ")} are missing`} in ${where}${ahead ? ` (expected before ${ahead})` : ""}.`;
    this.report("missing-element", el, message);
  }

  /** Greedy matcher for general content models; returns the position after the match or -1. */
  match(p: Particle, kids: XNode[], pos: number): number {
    if (Array.isArray(p)) {
      const max = occursMax(p[3]);
      let count = 0;
      while (count < max && pos < kids.length && this.key(kids[pos] as XNode) === p[0]) {
        pos++;
        count++;
      }
      return count >= p[2] ? pos : -1;
    }
    if ("w" in p) {
      const max = occursMax(p.x);
      let count = 0;
      while (count < max && pos < kids.length && this.wildcardMatches(p, kids[pos] as XNode)) {
        pos++;
        count++;
      }
      return count >= p.n ? pos : -1;
    }
    const max = occursMax(p.x);
    let iterations = 0;
    if (p.g === "a") {
      const used = new Set<Particle>();
      while (pos < kids.length) {
        const item = p.i.find((x) => !used.has(x) && this.match(x, kids, pos) > pos);
        if (!item) break;
        used.add(item);
        pos = this.match(item, kids, pos);
      }
      const complete = p.i.every((x) => used.has(x) || this.match(x, [], 0) === 0);
      return complete || (p.n === 0 && used.size === 0) ? pos : -1;
    }
    while (iterations < max) {
      const start = pos;
      let ok = true;
      if (p.g === "s") {
        for (const item of p.i) {
          const next = this.match(item, kids, pos);
          if (next < 0) {
            ok = false;
            break;
          }
          pos = next;
        }
      } else {
        ok = false;
        let emptyOk = false;
        for (const item of p.i) {
          const next = this.match(item, kids, pos);
          if (next > pos) {
            pos = next;
            ok = true;
            break;
          }
          if (next === pos) emptyOk = true;
        }
        if (!ok && emptyOk) {
          iterations = Math.max(iterations + 1, p.n);
          break;
        }
      }
      if (!ok) {
        pos = start;
        break;
      }
      iterations++;
      if (pos === start) {
        iterations = Math.max(iterations, p.n);
        break;
      }
    }
    return iterations >= p.n ? pos : -1;
  }
}

/** Finds the schema for a document root: the model and the root type, if declared. */
function rootType(rt: Runtime, root: XNode): number | undefined {
  const i = rt.nsIndex.get(root.ns);
  if (i === undefined) return undefined;
  const k = `${i}:${root.local}`;
  return rt.model.roots.includes(k) ? rt.model.elements[k] : undefined;
}

/** Options of {@link validateSchema}. */
export interface ValidateSchemaOptions {
  /** Message language. Default "en". */
  lang?: "en" | "de";
}

/**
 * Validates a parsed document against a bundled schema ("ubl-2.1" for UBL Invoice and CreditNote,
 * "cii-d16b" for UN/CEFACT CrossIndustryInvoice) or a compiled {@link SchemaModel}. Returns the
 * violations; an empty array means the document is valid.
 */
export function validateSchema(
  doc: XNode,
  schema: SchemaId | SchemaModel,
  options: ValidateSchemaOptions = {},
): SchemaFinding[] {
  const model = typeof schema === "string" ? schemaModel(schema) : schema;
  const rt = runtime(model);
  const root = doc.kind === "document" ? doc.children.find((c) => c.kind === "element") : doc;
  if (!root) return [];
  const v = new Validator(rt, options.lang === "de");
  const type = rootType(rt, root);
  if (type === undefined) {
    v.report(
      "unexpected-element",
      root,
      v.t(
        `The root element ${displayName(root)} is not declared in the schema.`,
        `Das Wurzelelement ${displayName(root)} ist im Schema nicht deklariert.`,
      ),
    );
    return v.findings;
  }
  v.validateElement(root, type);
  return v.findings;
}
