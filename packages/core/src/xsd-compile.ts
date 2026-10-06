/**
 * Compiles XML Schema files into the compact {@link SchemaModel} the validator in xsd.ts uses.
 * Used at build time by scripts/build-schemas.ts; it is not part of the runtime bundle.
 *
 * Supported: global and local element declarations (refs, form, elementFormDefault), named and
 * anonymous complex types with sequence / choice / all / group refs and occurrence bounds,
 * simple and complex content with extension and restriction, attributes (use, fixed, form,
 * attribute groups), xs:any and xs:anyAttribute, simple types derived by restriction with facets.
 * Anything else that is reachable from a root (lists, unions, substitution groups, identity
 * constraints, nillable or fixed elements, ...) makes the compiler throw, so the compiled model
 * can never silently be more lenient than the schema.
 */
import { parseXml, type XNode } from "./xml";
import type {
  AttributeDef,
  BuiltinType,
  ComplexTypeDef,
  Facets,
  Particle,
  SchemaModel,
  SimpleTypeDef,
  TypeDef,
} from "./xsd-model";
import { translateXsdPattern } from "./xsd-regex";

const XS = "http://www.w3.org/2001/XMLSchema";

const BUILTINS = new Set<string>([
  "anySimpleType",
  "string",
  "normalizedString",
  "token",
  "language",
  "Name",
  "NCName",
  "NMTOKEN",
  "ID",
  "IDREF",
  "QName",
  "anyURI",
  "boolean",
  "decimal",
  "integer",
  "nonNegativeInteger",
  "positiveInteger",
  "nonPositiveInteger",
  "negativeInteger",
  "long",
  "int",
  "short",
  "byte",
  "unsignedLong",
  "unsignedInt",
  "unsignedShort",
  "unsignedByte",
  "double",
  "float",
  "date",
  "time",
  "dateTime",
  "gYear",
  "gYearMonth",
  "gMonth",
  "gMonthDay",
  "gDay",
  "duration",
  "base64Binary",
  "hexBinary",
]);

const NUMERIC = new Set([
  "decimal",
  "integer",
  "nonNegativeInteger",
  "positiveInteger",
  "nonPositiveInteger",
  "negativeInteger",
  "long",
  "int",
  "short",
  "byte",
  "unsignedLong",
  "unsignedInt",
  "unsignedShort",
  "unsignedByte",
]);

interface SchemaDoc {
  file: string;
  tns: string;
  elementQualified: boolean;
  attributeQualified: boolean;
}

interface Component {
  node: XNode;
  schema: SchemaDoc;
}

export interface CompileXsdOptions {
  /** XSD sources by file name. All files are loaded; imports are resolved by namespace. */
  files: Record<string, string>;
  /** Root elements as [namespace, local name]. */
  roots: Array<[string, string]>;
  /** Imported namespaces that are intentionally not supplied (reported, not an error). */
  ignoreImports?: string[];
}

export interface CompileXsdResult {
  model: SchemaModel;
  /** Notes about things that were skipped (unsupported patterns, ignored imports). */
  notes: string[];
}

class XsdCompileError extends Error {
  constructor(message: string, node?: XNode, schema?: SchemaDoc) {
    super(schema ? `${message} (${schema.file}, line ${node?.line ?? "?"})` : message);
    this.name = "XsdCompileError";
  }
}

const key = (ns: string, local: string) => `{${ns}}${local}`;

function xsChildren(n: XNode): XNode[] {
  return n.children.filter((c) => c.kind === "element" && c.ns === XS && c.local !== "annotation");
}

function attr(n: XNode, name: string): string | undefined {
  return n.attributes.find((a) => a.ns === "" && a.local === name)?.value;
}

function resolvePrefix(n: XNode, prefix: string): string | undefined {
  for (let x: XNode | null = n; x; x = x.parent) {
    const uri = x.namespaces?.get(prefix);
    if (uri !== undefined) return uri;
  }
  return prefix === "" ? "" : undefined;
}

function qname(n: XNode, value: string, schema: SchemaDoc): [string, string] {
  const v = value.trim();
  const i = v.indexOf(":");
  const prefix = i === -1 ? "" : v.slice(0, i);
  const local = i === -1 ? v : v.slice(i + 1);
  const ns = resolvePrefix(n, prefix);
  if (ns === undefined) throw new XsdCompileError(`Undeclared prefix in ${v}`, n, schema);
  return [ns, local];
}

function occurs(n: XNode): { n: number; x: number } {
  const min = attr(n, "minOccurs");
  const max = attr(n, "maxOccurs");
  return {
    n: min === undefined ? 1 : Number.parseInt(min, 10),
    x: max === undefined ? 1 : max.trim() === "unbounded" ? -1 : Number.parseInt(max, 10),
  };
}

function checkAttributes(n: XNode, allowed: string[], schema: SchemaDoc) {
  for (const a of n.attributes) {
    if (a.ns !== "") continue;
    if (!allowed.includes(a.local))
      throw new XsdCompileError(`Unsupported attribute ${a.local} on xs:${n.local}`, n, schema);
  }
}

export function compileXsd(options: CompileXsdOptions): CompileXsdResult {
  const notes: string[] = [];
  const tables = {
    element: new Map<string, Component>(),
    complexType: new Map<string, Component>(),
    simpleType: new Map<string, Component>(),
    attribute: new Map<string, Component>(),
    group: new Map<string, Component>(),
    attributeGroup: new Map<string, Component>(),
  };
  const loadedNamespaces = new Set<string>();
  const imports: Array<{ ns: string; file: string }> = [];

  for (const [file, source] of Object.entries(options.files)) {
    const doc = parseXml(source);
    const root = doc.children.find((c) => c.kind === "element");
    if (!root || root.ns !== XS || root.local !== "schema")
      throw new XsdCompileError(`${file} is not an XML Schema`);
    const schema: SchemaDoc = {
      file,
      tns: attr(root, "targetNamespace") ?? "",
      elementQualified: attr(root, "elementFormDefault") === "qualified",
      attributeQualified: attr(root, "attributeFormDefault") === "qualified",
    };
    loadedNamespaces.add(schema.tns);
    for (const c of xsChildren(root)) {
      if (c.local === "import") {
        imports.push({ ns: attr(c, "namespace") ?? "", file });
        continue;
      }
      if (c.local === "include") continue; // included files are passed in explicitly
      const table = tables[c.local as keyof typeof tables];
      if (!table) throw new XsdCompileError(`Unsupported top-level xs:${c.local}`, c, schema);
      const name = attr(c, "name");
      if (!name) throw new XsdCompileError(`Top-level xs:${c.local} without name`, c, schema);
      table.set(key(schema.tns, name), { node: c, schema });
    }
  }
  for (const imp of imports) {
    if (loadedNamespaces.has(imp.ns)) continue;
    if (options.ignoreImports?.includes(imp.ns)) {
      notes.push(`Import of ${imp.ns} in ${imp.file} not loaded (by configuration).`);
      continue;
    }
    throw new XsdCompileError(`Import of ${imp.ns} in ${imp.file} cannot be resolved`);
  }

  const types: TypeDef[] = [];
  const named = new Map<string, number>();
  const nsList: string[] = [];
  const nsIndex = (ns: string) => {
    let i = nsList.indexOf(ns);
    if (i === -1) {
      i = nsList.length;
      nsList.push(ns);
    }
    return i;
  };
  const qn = (ns: string, local: string) => `${nsIndex(ns)}:${local}`;
  const globalElements: Record<string, number> = {};
  let allRefs = true;

  const lookup = (kind: keyof typeof tables, k: string, n?: XNode, schema?: SchemaDoc) => {
    const c = tables[kind].get(k);
    if (!c) throw new XsdCompileError(`Unknown ${kind} ${k}`, n, schema);
    return c;
  };

  const builtin = (name: string, n: XNode, schema: SchemaDoc): number => {
    const k = key(XS, name);
    const existing = named.get(k);
    if (existing !== undefined) return existing;
    let def: TypeDef;
    if (name === "anyType") def = { k: "c", any: 1 };
    else if (BUILTINS.has(name)) def = { k: "s", b: name as BuiltinType };
    else throw new XsdCompileError(`Unsupported built-in type xs:${name}`, n, schema);
    types.push(def);
    named.set(k, types.length - 1);
    return types.length - 1;
  };

  // Named and anonymous complex types are compiled lazily (after their index is reserved), so
  // recursive references through elements resolve to the reserved index.
  const pending = new Map<number, () => void>();
  const ensure = (index: number): TypeDef => {
    const job = pending.get(index);
    if (job) {
      pending.delete(index);
      job();
    }
    return types[index] as TypeDef;
  };
  const reserveComplex = (node: XNode, schema: SchemaDoc): number => {
    const index = types.length;
    const def: ComplexTypeDef = { k: "c" };
    types.push(def);
    pending.set(index, () => compileComplex(node, schema, def, index));
    return index;
  };

  /** Type index for a QName reference to a type. */
  const typeRef = (n: XNode, value: string, schema: SchemaDoc): number => {
    const [ns, local] = qname(n, value, schema);
    if (ns === XS) return builtin(local, n, schema);
    const k = key(ns, local);
    const existing = named.get(k);
    if (existing !== undefined) return existing;
    const complex = tables.complexType.get(k);
    if (complex) {
      const index = reserveComplex(complex.node, complex.schema);
      named.set(k, index);
      return index;
    }
    const simple = tables.simpleType.get(k);
    if (simple) {
      const index = types.length;
      types.push({ k: "s", b: "anySimpleType" });
      named.set(k, index);
      types[index] = compileSimple(simple.node, simple.schema);
      return index;
    }
    throw new XsdCompileError(`Unknown type ${value}`, n, schema);
  };

  const simpleDef = (index: number, n: XNode, schema: SchemaDoc): SimpleTypeDef => {
    const t = types[index];
    if (t?.k !== "s") throw new XsdCompileError("Expected a simple type", n, schema);
    return t;
  };

  const addFacets = (base: SimpleTypeDef, restriction: XNode, schema: SchemaDoc): SimpleTypeDef => {
    const f: Facets = { ...base.f };
    if (base.f?.pattern) f.pattern = [...base.f.pattern];
    const enumeration: string[] = [];
    const patterns: string[] = [];
    for (const c of xsChildren(restriction)) {
      const value = attr(c, "value") ?? "";
      switch (c.local) {
        case "simpleType":
          continue;
        case "enumeration":
          enumeration.push(value);
          break;
        case "pattern": {
          const js = translateXsdPattern(value);
          if (js === null) notes.push(`Pattern ${value} is not supported and is not checked.`);
          else patterns.push(js);
          break;
        }
        case "length":
        case "minLength":
        case "maxLength":
        case "totalDigits":
        case "fractionDigits":
          f[c.local] = Number.parseInt(value, 10);
          break;
        case "minInclusive":
        case "maxInclusive":
        case "minExclusive":
        case "maxExclusive":
          if (!NUMERIC.has(base.b))
            throw new XsdCompileError(`Range facets on ${base.b} are not supported`, c, schema);
          f[c.local] = value.trim();
          break;
        case "whiteSpace":
          // The built-in base defines the whitespace handling; a narrower setting is allowed only
          // from preserve/replace to collapse, which does not change the checks done here.
          break;
        case "attribute":
        case "attributeGroup":
        case "anyAttribute":
          break;
        default:
          throw new XsdCompileError(`Unsupported facet xs:${c.local}`, c, schema);
      }
    }
    if (enumeration.length > 0) f.enumeration = enumeration;
    if (patterns.length > 0) f.pattern = [...(f.pattern ?? []), patterns];
    const out: SimpleTypeDef = { k: "s", b: base.b };
    if (Object.keys(f).length > 0) out.f = f;
    return out;
  };

  const compileSimple = (n: XNode, schema: SchemaDoc): SimpleTypeDef => {
    const [derivation] = xsChildren(n);
    if (derivation?.local !== "restriction")
      throw new XsdCompileError(
        `Unsupported simple type derivation xs:${derivation?.local ?? "?"}`,
        n,
        schema,
      );
    return addFacets(simpleBase(derivation, schema), derivation, schema);
  };

  /** Base simple type of an xs:restriction (base attribute or nested xs:simpleType). */
  const simpleBase = (restriction: XNode, schema: SchemaDoc): SimpleTypeDef => {
    const base = attr(restriction, "base");
    if (base) {
      const index = typeRef(restriction, base, schema);
      ensure(index);
      return simpleDef(index, restriction, schema);
    }
    const inline = xsChildren(restriction).find((c) => c.local === "simpleType");
    if (!inline) throw new XsdCompileError("Restriction without base", restriction, schema);
    return compileSimple(inline, schema);
  };

  const addSimple = (def: SimpleTypeDef): number => {
    types.push(def);
    return types.length - 1;
  };

  const compileAttributes = (
    container: XNode,
    schema: SchemaDoc,
    inherited: AttributeDef[],
  ): AttributeDef[] => {
    const out = new Map<string, AttributeDef>();
    for (const a of inherited) out.set(a[0], a);
    const visit = (parent: XNode, s: SchemaDoc) => {
      for (const c of xsChildren(parent)) {
        if (c.local === "attribute") {
          checkAttributes(c, ["name", "ref", "type", "use", "fixed", "default", "form", "id"], s);
          let name: string;
          let typeIndex: number;
          let decl = c;
          let declSchema = s;
          const ref = attr(c, "ref");
          if (ref) {
            const [ns, local] = qname(c, ref, s);
            const global = lookup("attribute", key(ns, local), c, s);
            decl = global.node;
            declSchema = global.schema;
            name = ns === "" ? local : qn(ns, local);
          } else {
            const local = attr(c, "name") as string;
            const form = attr(c, "form");
            const qualified = form ? form === "qualified" : s.attributeQualified;
            name = qualified && s.tns !== "" ? qn(s.tns, local) : local;
          }
          const type = attr(decl, "type");
          const inline = xsChildren(decl).find((x) => x.local === "simpleType");
          if (type) typeIndex = typeRef(decl, type, declSchema);
          else if (inline) typeIndex = addSimple(compileSimple(inline, declSchema));
          else typeIndex = builtin("anySimpleType", decl, declSchema);
          const use = attr(c, "use") ?? "optional";
          if (use === "prohibited") {
            out.delete(name);
            continue;
          }
          const fixed = attr(c, "fixed") ?? attr(decl, "fixed");
          const def: AttributeDef = [name, typeIndex, use === "required" ? 1 : 0];
          if (fixed !== undefined) def.push(fixed);
          out.set(name, def);
        } else if (c.local === "attributeGroup") {
          const ref = attr(c, "ref");
          if (!ref) throw new XsdCompileError("Attribute group without ref", c, s);
          const [ns, local] = qname(c, ref, s);
          const group = lookup("attributeGroup", key(ns, local), c, s);
          visit(group.node, group.schema);
        } else if (c.local === "anyAttribute") {
          throw new XsdCompileError("xs:anyAttribute is not supported", c, s);
        }
      }
    };
    visit(container, schema);
    return [...out.values()];
  };

  const compileParticle = (n: XNode, schema: SchemaDoc): Particle | null => {
    const o = occurs(n);
    switch (n.local) {
      case "element": {
        checkAttributes(n, ["name", "ref", "type", "minOccurs", "maxOccurs", "form", "id"], schema);
        const ref = attr(n, "ref");
        if (ref) {
          const [ns, local] = qname(n, ref, schema);
          const name = qn(ns, local);
          return [name, globalElement(ns, local, n, schema), o.n, o.x];
        }
        allRefs = false;
        const local = attr(n, "name") as string;
        const form = attr(n, "form");
        const qualified = form ? form === "qualified" : schema.elementQualified;
        const ns = qualified ? schema.tns : "";
        return [qn(ns, local), elementType(n, schema), o.n, o.x];
      }
      case "sequence":
      case "choice":
      case "all": {
        const items: Particle[] = [];
        for (const c of xsChildren(n)) {
          const p = compileParticle(c, schema);
          if (p) items.push(p);
        }
        if (items.length === 0) return null;
        if (items.length === 1 && o.n === 1 && o.x === 1 && n.local !== "all")
          return items[0] as Particle;
        return {
          g: n.local === "sequence" ? "s" : n.local === "choice" ? "c" : "a",
          i: items,
          ...o,
        };
      }
      case "group": {
        const ref = attr(n, "ref");
        if (!ref) throw new XsdCompileError("Group without ref", n, schema);
        const [ns, local] = qname(n, ref, schema);
        const group = lookup("group", key(ns, local), n, schema);
        const [model] = xsChildren(group.node);
        if (!model) return null;
        const inner = compileParticle(model, group.schema);
        if (!inner) return null;
        if (o.n === 1 && o.x === 1) return inner;
        return { g: "s", i: [inner], ...o };
      }
      case "any": {
        checkAttributes(
          n,
          ["namespace", "processContents", "minOccurs", "maxOccurs", "id"],
          schema,
        );
        const pc = (attr(n, "processContents") ?? "strict") as "skip" | "lax" | "strict";
        const constraint = (attr(n, "namespace") ?? "##any").trim();
        const p: Particle = { w: pc, ...o };
        if (constraint === "##other") p.not = [nsIndex(schema.tns), nsIndex("")];
        else if (constraint !== "##any")
          p.ns = constraint
            .split(/\s+/)
            .map((t) => nsIndex(t === "##targetNamespace" ? schema.tns : t === "##local" ? "" : t));
        return p;
      }
      default:
        throw new XsdCompileError(`Unsupported particle xs:${n.local}`, n, schema);
    }
  };

  /** Type of a (local or global) element declaration. */
  const elementType = (n: XNode, schema: SchemaDoc): number => {
    for (const c of xsChildren(n)) {
      if (c.local === "key" || c.local === "unique" || c.local === "keyref")
        throw new XsdCompileError("Identity constraints are not supported", c, schema);
    }
    const type = attr(n, "type");
    if (type) return typeRef(n, type, schema);
    const complex = xsChildren(n).find((c) => c.local === "complexType");
    if (complex) return reserveComplex(complex, schema);
    const simple = xsChildren(n).find((c) => c.local === "simpleType");
    if (simple) return addSimple(compileSimple(simple, schema));
    return builtin("anyType", n, schema);
  };

  const globalElement = (ns: string, local: string, at?: XNode, atSchema?: SchemaDoc): number => {
    const name = qn(ns, local);
    const existing = globalElements[name];
    if (existing !== undefined) return existing;
    const decl = lookup("element", key(ns, local), at, atSchema);
    checkAttributes(decl.node, ["name", "type", "id"], decl.schema);
    const index = elementType(decl.node, decl.schema);
    globalElements[name] = index;
    return index;
  };

  const compiling = new Set<number>();
  const compileComplex = (n: XNode, schema: SchemaDoc, def: ComplexTypeDef, self: number) => {
    compiling.add(self);
    checkAttributes(n, ["name", "mixed", "id"], schema);
    if (attr(n, "mixed") === "true") def.mixed = 1;
    const children = xsChildren(n);
    const content = children.find(
      (c) => c.local === "simpleContent" || c.local === "complexContent",
    );
    if (!content) {
      const model = children.find((c) => ["sequence", "choice", "all", "group"].includes(c.local));
      const p = model ? compileParticle(model, schema) : null;
      if (p) def.p = p;
      const attrs = compileAttributes(n, schema, []);
      if (attrs.length) def.a = attrs;
      compiling.delete(self);
      return;
    }
    const [derivation] = xsChildren(content);
    if (!derivation || (derivation.local !== "extension" && derivation.local !== "restriction"))
      throw new XsdCompileError("Expected xs:extension or xs:restriction", content, schema);
    const baseName = attr(derivation, "base");
    if (!baseName) throw new XsdCompileError("Derivation without base", derivation, schema);
    const baseIndex = typeRef(derivation, baseName, schema);
    if (compiling.has(baseIndex))
      throw new XsdCompileError(`Circular derivation from ${baseName}`, derivation, schema);
    const base = ensure(baseIndex);
    const baseAttrs = base.k === "c" ? (base.a ?? []) : [];
    if (content.local === "simpleContent") {
      if (derivation.local === "extension") {
        if (base.k === "s") def.s = baseIndex;
        else if (base.s !== undefined) def.s = base.s;
        else
          throw new XsdCompileError(
            "simpleContent extension of a complex type without simple content",
            derivation,
            schema,
          );
      } else {
        if (base.k !== "c" || base.s === undefined)
          throw new XsdCompileError(
            "simpleContent restriction needs a simple-content base",
            derivation,
            schema,
          );
        const inline = xsChildren(derivation).find((c) => c.local === "simpleType");
        const start = inline
          ? compileSimple(inline, schema)
          : simpleDef(base.s, derivation, schema);
        const restricted = addFacets(start, derivation, schema);
        def.s = restricted.f || inline ? addSimple(restricted) : base.s;
      }
    } else {
      if (attr(content, "mixed") === "true") def.mixed = 1;
      const model = xsChildren(derivation).find((c) =>
        ["sequence", "choice", "all", "group"].includes(c.local),
      );
      const own = model ? compileParticle(model, schema) : null;
      if (derivation.local === "extension") {
        if (base.k !== "c")
          throw new XsdCompileError("complexContent of a simple type", derivation, schema);
        if (base.any)
          throw new XsdCompileError("Extension of xs:anyType is not supported", derivation, schema);
        if (base.mixed) def.mixed = 1;
        if (base.p && own) def.p = { g: "s", i: [base.p, own], n: 1, x: 1 };
        else if (base.p || own) def.p = (base.p ?? own) as Particle;
      } else if (own) {
        def.p = own;
      }
    }
    const attrs = compileAttributes(derivation, schema, baseAttrs);
    if (attrs.length) def.a = attrs;
    compiling.delete(self);
  };

  const roots: string[] = [];
  for (const [ns, local] of options.roots) {
    globalElement(ns, local);
    roots.push(qn(ns, local));
  }
  while (pending.size > 0) {
    for (const index of [...pending.keys()]) ensure(index);
  }

  const model = dedupe({ ns: nsList, types, elements: globalElements, roots });
  if (allRefs) {
    // Every element particle refers to a global declaration (UBL): the runtime rebuilds the
    // global element table from the particles, so only the roots are stored.
    model.elements = Object.fromEntries(roots.map((r) => [r, model.elements[r] as number]));
    model.refs = 1;
  }
  return { model, notes };
}

/** Merges structurally identical types (repeated until nothing changes) and renumbers. */
function dedupe(model: SchemaModel): SchemaModel {
  let types = model.types;
  let elements = model.elements;
  for (;;) {
    const canonical = new Map<string, number>();
    const map: number[] = [];
    const kept: TypeDef[] = [];
    types.forEach((t, i) => {
      const k = JSON.stringify(t);
      const existing = canonical.get(k);
      if (existing !== undefined) {
        map[i] = existing;
      } else {
        canonical.set(k, kept.length);
        map[i] = kept.length;
        kept.push(t);
      }
    });
    if (kept.length === types.length) break;
    const remap = (i: number) => map[i] as number;
    types = kept.map((t) => renumber(t, remap));
    elements = Object.fromEntries(Object.entries(elements).map(([k, v]) => [k, remap(v)]));
  }
  return { ...model, types, elements };
}

function renumber(t: TypeDef, remap: (i: number) => number): TypeDef {
  if (t.k === "s") return t;
  const out: ComplexTypeDef = { ...t };
  if (t.a)
    out.a = t.a.map((a) => {
      const copy = [...a] as AttributeDef;
      copy[1] = remap(a[1]);
      return copy;
    });
  if (t.s !== undefined) out.s = remap(t.s);
  if (t.p) out.p = renumberParticle(t.p, remap);
  return out;
}

function renumberParticle(p: Particle, remap: (i: number) => number): Particle {
  if (Array.isArray(p)) return [p[0], remap(p[1]), p[2], p[3]];
  if ("g" in p) return { ...p, i: p.i.map((c) => renumberParticle(c, remap)) };
  return p;
}
