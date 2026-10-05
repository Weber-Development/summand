/**
 * Evaluator for the XPath 2.0 subset parsed by ./parser. Values follow the XPath data model
 * closely enough for invoice rules: untyped node values, exact decimals, doubles, strings,
 * booleans and dates, with the casting rules of general comparisons and arithmetic.
 */
import { stringValue, type XNode } from "../xml";
import type { Ast, Axis, NodeTest, SequenceType, Step } from "./ast";
import { Decimal } from "./decimal";

export class XPathError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "XPathError";
  }
}

/** Atomized value of a node: an xs:untypedAtomic. */
export class Untyped {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/** xs:date or xs:dateTime. `key` sorts chronologically for values without time zone. */
export class XDate {
  constructor(
    readonly type: "date" | "dateTime",
    readonly lexical: string,
    readonly key: string,
  ) {}
  toString(): string {
    return this.lexical;
  }
}

export type Atomic = string | boolean | number | Decimal | Untyped | XDate;
export type Item = XNode | Atomic;
export type Sequence = Item[];

export function isNode(v: Item | undefined): v is XNode {
  return typeof v === "object" && v !== null && "children" in v && "kind" in v;
}

export type XPathFunction = (env: Env, args: Sequence[]) => Sequence;

export interface Env {
  item: Item | undefined;
  position: number;
  size: number;
  vars: Map<string, Sequence>;
  functions: ReadonlyMap<string, XPathFunction>;
  /** Value of XSLT current(): the context item where the outermost expression started. */
  current: Item | undefined;
}

// ---------------------------------------------------------------------------------------------
// Conversions

export function atomize(seq: Sequence): Atomic[] {
  const out: Atomic[] = [];
  for (const v of seq) out.push(isNode(v) ? new Untyped(stringValue(v)) : v);
  return out;
}

export function stringOf(v: Item): string {
  if (isNode(v)) return stringValue(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return doubleToString(v);
  return v.toString();
}

function doubleToString(n: number): string {
  if (Number.isNaN(n)) return "NaN";
  if (n === Number.POSITIVE_INFINITY) return "INF";
  if (n === Number.NEGATIVE_INFINITY) return "-INF";
  if (Number.isInteger(n) && Math.abs(n) < 1e6) return String(n);
  const abs = Math.abs(n);
  if (abs >= 1e-6 && abs < 1e6) return String(n);
  return n.toExponential().replace("e+", "E").replace("e", "E");
}

export function isNumeric(v: Atomic): v is number | Decimal {
  return typeof v === "number" || v instanceof Decimal;
}

export function toDouble(v: Atomic): number {
  if (typeof v === "number") return v;
  if (v instanceof Decimal) return v.toNumber();
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = v.toString().trim();
  if (s === "INF") return Number.POSITIVE_INFINITY;
  if (s === "-INF") return Number.NEGATIVE_INFINITY;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number.NaN;
  return Number(s);
}

export function toDecimal(v: Atomic): Decimal {
  if (v instanceof Decimal) return v;
  if (typeof v === "number") {
    const d = Decimal.fromNumber(v);
    if (!d) throw new XPathError("FOCA0002", `Cannot convert ${v} to xs:decimal`);
    return d;
  }
  if (typeof v === "boolean") return v ? Decimal.fromInt(1) : Decimal.ZERO;
  const d = Decimal.parse(v.toString());
  if (!d) throw new XPathError("FORG0001", `"${v.toString()}" is not a valid xs:decimal`);
  return d;
}

export function toInteger(v: Atomic): Decimal {
  if (v instanceof Decimal || typeof v === "number") {
    const d = toDecimal(v);
    return Decimal.fromBigInt(d.toBigInt());
  }
  const s = v.toString().trim();
  if (!/^[+-]?\d+$/.test(s)) throw new XPathError("FORG0001", `"${s}" is not a valid xs:integer`);
  return Decimal.fromBigInt(BigInt(s));
}

export function toBoolean(v: Atomic): boolean {
  if (typeof v === "boolean") return v;
  if (isNumeric(v)) return v instanceof Decimal ? !v.isZero() : v !== 0 && !Number.isNaN(v);
  const s = v.toString().trim();
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  throw new XPathError("FORG0001", `"${s}" is not a valid xs:boolean`);
}

const DATE_RE = /^(-?\d{4,})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/;
const DATETIME_RE =
  /^(-?\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})?$/;

function validDay(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const days = [
    31,
    (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return d <= (days[m - 1] as number);
}

export function toDate(v: Atomic): XDate {
  if (v instanceof XDate) {
    if (v.type === "date") return v;
    return toDate(v.lexical.slice(0, v.lexical.indexOf("T")));
  }
  const s = v.toString().trim();
  const m = DATE_RE.exec(s);
  if (!m || !validDay(Number(m[1]), Number(m[2]), Number(m[3]))) {
    throw new XPathError("FORG0001", `"${s}" is not a valid xs:date`);
  }
  return new XDate("date", s, `${m[1]}-${m[2]}-${m[3]}`);
}

export function toDateTime(v: Atomic): XDate {
  if (v instanceof XDate && v.type === "dateTime") return v;
  const s = v.toString().trim();
  const m = DATETIME_RE.exec(s);
  if (!m || !validDay(Number(m[1]), Number(m[2]), Number(m[3]))) {
    throw new XPathError("FORG0001", `"${s}" is not a valid xs:dateTime`);
  }
  return new XDate("dateTime", s, `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
}

/** Effective boolean value. */
export function ebv(seq: Sequence): boolean {
  if (seq.length === 0) return false;
  const first = seq[0] as Item;
  if (isNode(first)) return true;
  if (seq.length > 1)
    throw new XPathError(
      "FORG0006",
      "Effective boolean value of a sequence of several atomic values",
    );
  if (typeof first === "boolean") return first;
  if (typeof first === "string") return first.length > 0;
  if (first instanceof Untyped) return first.value.length > 0;
  if (first instanceof Decimal) return !first.isZero();
  if (typeof first === "number") return first !== 0 && !Number.isNaN(first);
  throw new XPathError("FORG0006", "Effective boolean value of a date");
}

// ---------------------------------------------------------------------------------------------
// Comparisons and arithmetic

function compareAtomic(a: Atomic, b: Atomic): number | null {
  // Returns null when the values are not comparable (NaN).
  if (isNumeric(a) && isNumeric(b)) {
    if (a instanceof Decimal && b instanceof Decimal) return a.compare(b);
    const x = toDouble(a);
    const y = toDouble(b);
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  if (a instanceof XDate && b instanceof XDate) return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  if (
    (typeof a === "string" || a instanceof Untyped) &&
    (typeof b === "string" || b instanceof Untyped)
  ) {
    const x = a.toString();
    const y = b.toString();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  throw new XPathError("XPTY0004", `Cannot compare ${typeName(a)} with ${typeName(b)}`);
}

function typeName(v: Atomic): string {
  if (typeof v === "string") return "xs:string";
  if (typeof v === "boolean") return "xs:boolean";
  if (typeof v === "number") return "xs:double";
  if (v instanceof Decimal) return "xs:decimal";
  if (v instanceof Untyped) return "xs:untypedAtomic";
  return `xs:${v.type}`;
}

function applyOp(op: string, c: number | null): boolean {
  if (c === null) return op === "!=" || op === "ne";
  switch (op) {
    case "=":
    case "eq":
      return c === 0;
    case "!=":
    case "ne":
      return c !== 0;
    case "<":
    case "lt":
      return c < 0;
    case "<=":
    case "le":
      return c <= 0;
    case ">":
    case "gt":
      return c > 0;
    default:
      return c >= 0;
  }
}

function generalPair(op: string, a: Atomic, b: Atomic): boolean {
  let x = a;
  let y = b;
  if (x instanceof Untyped && y instanceof Untyped) {
    // both compared as strings
  } else if (x instanceof Untyped) {
    x = castUntypedFor(x, y);
  } else if (y instanceof Untyped) {
    y = castUntypedFor(y, x);
  }
  return applyOp(op, compareAtomic(x, y));
}

function castUntypedFor(u: Untyped, other: Atomic): Atomic {
  if (isNumeric(other)) return toDouble(u);
  if (typeof other === "boolean") return toBoolean(u);
  if (other instanceof XDate) return other.type === "date" ? toDate(u) : toDateTime(u);
  return u.value;
}

function arithmetic(op: string, a: Atomic, b: Atomic): Atomic {
  const x: Atomic = a instanceof Untyped ? toDouble(a) : a;
  const y: Atomic = b instanceof Untyped ? toDouble(b) : b;
  if (!isNumeric(x) || !isNumeric(y)) {
    throw new XPathError("XPTY0004", `Arithmetic on ${typeName(x)} and ${typeName(y)}`);
  }
  if (x instanceof Decimal && y instanceof Decimal) {
    switch (op) {
      case "+":
        return x.add(y);
      case "-":
        return x.sub(y);
      case "*":
        return x.mul(y);
      case "div": {
        const r = x.div(y);
        if (!r) throw new XPathError("FOAR0001", "Division by zero");
        return r;
      }
      case "idiv": {
        const r = x.idiv(y);
        if (!r) throw new XPathError("FOAR0001", "Division by zero");
        return r;
      }
      default: {
        const r = x.mod(y);
        if (!r) throw new XPathError("FOAR0001", "Division by zero");
        return r;
      }
    }
  }
  const dx = toDouble(x);
  const dy = toDouble(y);
  switch (op) {
    case "+":
      return dx + dy;
    case "-":
      return dx - dy;
    case "*":
      return dx * dy;
    case "div":
      return dx / dy;
    case "idiv":
      if (dy === 0) throw new XPathError("FOAR0001", "Division by zero");
      return Decimal.fromInt(Math.trunc(dx / dy));
    default:
      return dx % dy;
  }
}

// ---------------------------------------------------------------------------------------------
// Axes

function* descendants(n: XNode): Generator<XNode> {
  for (const c of n.children) {
    yield c;
    if (c.children.length) yield* descendants(c);
  }
}

function axisNodes(n: XNode, axis: Axis): XNode[] {
  switch (axis) {
    case "child":
      return n.children;
    case "attribute":
      return n.attributes;
    case "self":
      return [n];
    case "parent":
      return n.parent ? [n.parent] : [];
    case "descendant":
      return [...descendants(n)];
    case "descendant-or-self":
      return [n, ...descendants(n)];
    case "ancestor": {
      const out: XNode[] = [];
      for (let x = n.parent; x; x = x.parent) out.push(x);
      return out;
    }
    case "ancestor-or-self": {
      const out: XNode[] = [];
      for (let x: XNode | null = n; x; x = x.parent) out.push(x);
      return out;
    }
    case "following-sibling": {
      if (!n.parent || n.kind === "attribute") return [];
      const sib = n.parent.children;
      return sib.slice(sib.indexOf(n) + 1);
    }
    case "preceding-sibling": {
      if (!n.parent || n.kind === "attribute") return [];
      const sib = n.parent.children;
      return sib.slice(0, sib.indexOf(n)).reverse();
    }
    case "following":
    case "preceding": {
      let root = n;
      while (root.parent) root = root.parent;
      const all = [...descendants(root)];
      const ancestors = new Set<XNode>();
      for (let x = n.parent; x; x = x.parent) ancestors.add(x);
      if (axis === "following") {
        let last = n;
        while (last.kind !== "attribute" && last.children.length)
          last = last.children[last.children.length - 1] as XNode;
        return all.filter((x) => x.order > last.order);
      }
      return all.filter((x) => x.order < n.order && !ancestors.has(x)).reverse();
    }
  }
}

const REVERSE_AXES = new Set<Axis>([
  "parent",
  "ancestor",
  "ancestor-or-self",
  "preceding-sibling",
  "preceding",
]);

function matchesTest(n: XNode, test: NodeTest, axis: Axis): boolean {
  if (test.t === "name") {
    const principal = axis === "attribute" ? "attribute" : "element";
    if (n.kind !== principal) return false;
    if (test.local !== null && n.local !== test.local) return false;
    if (test.ns !== null && n.ns !== test.ns) return false;
    return true;
  }
  switch (test.kind) {
    case "node":
      return true;
    case "text":
      return n.kind === "text";
    case "comment":
      return n.kind === "comment";
    case "pi":
      return (
        n.kind === "pi" && (!test.name || test.name.local === null || n.local === test.name.local)
      );
    case "document":
      return n.kind === "document";
    case "element":
    case "attribute":
      if (n.kind !== test.kind) return false;
      if (!test.name) return true;
      return (
        (test.name.local === null || n.local === test.name.local) &&
        (test.name.ns === null || n.ns === test.name.ns)
      );
  }
}

function documentOrder(nodes: XNode[]): XNode[] {
  if (nodes.length < 2) return nodes;
  const seen = new Set<XNode>();
  const unique: XNode[] = [];
  let sorted = true;
  let prev = -1;
  for (const n of nodes) {
    if (seen.has(n)) continue;
    seen.add(n);
    unique.push(n);
    if (n.order < prev) sorted = false;
    prev = n.order;
  }
  if (!sorted) unique.sort((a, b) => a.order - b.order);
  return unique;
}

// ---------------------------------------------------------------------------------------------
// Evaluation

function withItem(env: Env, item: Item, position: number, size: number): Env {
  return { item, position, size, vars: env.vars, functions: env.functions, current: env.current };
}

function applyPredicates(env: Env, items: Sequence, preds: Ast[]): Sequence {
  let current = items;
  for (const pred of preds) {
    const size = current.length;
    const kept: Sequence = [];
    current.forEach((item, i) => {
      const r = evaluate(pred, withItem(env, item, i + 1, size));
      if (r.length === 1 && isNumeric(r[0] as Atomic) && !isNode(r[0])) {
        if (toDouble(r[0] as Atomic) === i + 1) kept.push(item);
      } else if (ebv(r)) kept.push(item);
    });
    current = kept;
  }
  return current;
}

function contextNode(env: Env): XNode {
  if (env.item === undefined) throw new XPathError("XPDY0002", "No context item");
  if (!isNode(env.item)) throw new XPathError("XPTY0020", "Context item is not a node");
  return env.item;
}

function evalStep(step: Step, env: Env, node: XNode): Sequence {
  if (step.t === "axis") {
    const candidates = axisNodes(node, step.axis).filter((n) =>
      matchesTest(n, step.test, step.axis),
    );
    if (step.preds.length === 0) return candidates;
    const filtered = applyPredicates(env, candidates, step.preds) as XNode[];
    return REVERSE_AXES.has(step.axis) ? filtered.reverse() : filtered;
  }
  const value = evaluate(step.primary, env);
  return step.preds.length ? applyPredicates(env, value, step.preds) : value;
}

function evalPath(ast: Extract<Ast, { t: "path" }>, env: Env): Sequence {
  let current: Sequence;
  let steps = ast.steps;
  if (ast.absolute) {
    let root = contextNode(env);
    while (root.parent) root = root.parent;
    current = [root];
  } else {
    if (steps.length === 0) return [];
    // The first step is evaluated against the context item itself.
    const first = steps[0] as Step;
    if (first.t === "filter") {
      current = evaluate(first.primary, env);
      if (first.preds.length) current = applyPredicates(env, current, first.preds);
    } else {
      current = evalStep(first, env, contextNode(env));
    }
    if (current.length > 1 && current.every(isNode)) current = documentOrder(current as XNode[]);
    steps = steps.slice(1);
  }
  const absoluteDesc = ast.absolute === "//";
  steps.forEach((step, index) => {
    const desc = step.desc || (index === 0 && absoluteDesc);
    let inputs = current;
    if (desc) {
      // E1//E2 is E1/descendant-or-self::node()/E2
      const expanded: XNode[] = [];
      for (const item of inputs) {
        if (!isNode(item)) throw new XPathError("XPTY0019", "Path step on an atomic value");
        expanded.push(item, ...descendants(item));
      }
      inputs = documentOrder(expanded);
      if (step.t === "axis" && step.axis === "child" && step.preds.length === 0) {
        // Fast path: //name
        current = inputs.filter(
          (n) =>
            isNode(n) &&
            n.kind !== "document" &&
            n.kind !== "attribute" &&
            matchesTest(n, step.test, "child"),
        );
        return;
      }
    }
    const results: Sequence = [];
    let allNodes = true;
    let anyNode = false;
    const size = inputs.length;
    inputs.forEach((item, i) => {
      if (!isNode(item)) throw new XPathError("XPTY0019", "Path step on an atomic value");
      const r = evalStep(step, withItem(env, item, i + 1, size), item);
      for (const v of r) {
        if (isNode(v)) anyNode = true;
        else allNodes = false;
        results.push(v);
      }
    });
    if (anyNode && !allNodes)
      throw new XPathError("XPTY0018", "Path mixes nodes and atomic values");
    current = allNodes ? documentOrder(results as XNode[]) : results;
  });
  return current;
}

function bindAll(
  bindings: Array<[string, Ast]>,
  env: Env,
  visit: (env: Env) => boolean | undefined,
): void {
  const recurse = (i: number, vars: Map<string, Sequence>): boolean => {
    if (i === bindings.length) {
      return visit({ ...env, vars }) === false;
    }
    const [name, src] = bindings[i] as [string, Ast];
    const values = evaluate(src, { ...env, vars });
    for (const v of values) {
      const next = new Map(vars);
      next.set(name, [v]);
      if (recurse(i + 1, next)) return true;
    }
    return false;
  };
  recurse(0, env.vars);
}

export function castTo(v: Atomic, type: string): Atomic {
  switch (type) {
    case "xs:decimal":
      return toDecimal(v);
    case "xs:integer":
      return toInteger(v);
    case "xs:double":
    case "xs:float": {
      const d = toDouble(v);
      if (Number.isNaN(d) && !(typeof v === "number")) {
        const s = v.toString().trim();
        if (s !== "NaN") throw new XPathError("FORG0001", `"${s}" is not a valid xs:double`);
      }
      return d;
    }
    case "xs:string":
    case "xs:anyURI":
    case "xs:token":
    case "xs:normalizedString":
      return stringOf(v);
    case "xs:boolean":
      return toBoolean(v);
    case "xs:date":
      return toDate(v);
    case "xs:dateTime":
      return toDateTime(v);
    case "xs:untypedAtomic":
      return new Untyped(stringOf(v));
    default:
      throw new XPathError("XPST0051", `Unsupported type ${type}`);
  }
}

function instanceOf(seq: Sequence, type: SequenceType): boolean {
  if (type.empty) return seq.length === 0;
  const { occurrence } = type;
  if (seq.length === 0) return occurrence === "?" || occurrence === "*";
  if (seq.length > 1 && occurrence !== "*" && occurrence !== "+") return false;
  return seq.every((v) => {
    switch (type.name) {
      case "item()":
        return true;
      case "node()":
        return isNode(v);
      case "element()":
        return isNode(v) && v.kind === "element";
      case "attribute()":
        return isNode(v) && v.kind === "attribute";
      case "text()":
        return isNode(v) && v.kind === "text";
      case "xs:string":
        return typeof v === "string";
      case "xs:boolean":
        return typeof v === "boolean";
      case "xs:double":
        return typeof v === "number";
      case "xs:decimal":
        return v instanceof Decimal;
      case "xs:integer":
        return v instanceof Decimal && v.isInteger();
      case "xs:date":
        return v instanceof XDate && v.type === "date";
      case "xs:dateTime":
        return v instanceof XDate && v.type === "dateTime";
      case "xs:anyAtomicType":
        return !isNode(v);
      case "xs:untypedAtomic":
        return v instanceof Untyped;
      default:
        return false;
    }
  });
}

export function evaluate(ast: Ast, env: Env): Sequence {
  switch (ast.t) {
    case "num":
      return [ast.v];
    case "str":
      return [ast.v];
    case "var": {
      const v = env.vars.get(ast.name);
      if (v === undefined) throw new XPathError("XPST0008", `Unknown variable $${ast.name}`);
      return v;
    }
    case "ctx":
      if (env.item === undefined) throw new XPathError("XPDY0002", "No context item");
      return [env.item];
    case "seq": {
      if (ast.items.length === 1) return evaluate(ast.items[0] as Ast, env);
      const out: Sequence = [];
      for (const i of ast.items) for (const v of evaluate(i, env)) out.push(v);
      return out;
    }
    case "for": {
      const out: Sequence = [];
      bindAll(ast.bindings, env, (e) => {
        for (const v of evaluate(ast.ret, e)) out.push(v);
        return undefined;
      });
      return out;
    }
    case "quant": {
      let result = ast.every;
      bindAll(ast.bindings, env, (e) => {
        const ok = ebv(evaluate(ast.sat, e));
        if (ast.every && !ok) {
          result = false;
          return false;
        }
        if (!ast.every && ok) {
          result = true;
          return false;
        }
        return undefined;
      });
      return [result];
    }
    case "if":
      return ebv(evaluate(ast.cond, env))
        ? evaluate(ast.whenTrue, env)
        : evaluate(ast.whenFalse, env);
    case "or":
      return [ebv(evaluate(ast.l, env)) || ebv(evaluate(ast.r, env))];
    case "and":
      return [ebv(evaluate(ast.l, env)) && ebv(evaluate(ast.r, env))];
    case "gcmp": {
      const l = atomize(evaluate(ast.l, env));
      if (l.length === 0) return [false];
      const r = atomize(evaluate(ast.r, env));
      for (const a of l) for (const b of r) if (generalPair(ast.op, a, b)) return [true];
      return [false];
    }
    case "vcmp": {
      const l = atomize(evaluate(ast.l, env));
      const r = atomize(evaluate(ast.r, env));
      if (l.length === 0 || r.length === 0) return [];
      if (l.length > 1 || r.length > 1)
        throw new XPathError("XPTY0004", "Value comparison on a sequence");
      const a = l[0] instanceof Untyped ? (l[0] as Untyped).value : (l[0] as Atomic);
      const b = r[0] instanceof Untyped ? (r[0] as Untyped).value : (r[0] as Atomic);
      return [applyOp(ast.op, compareAtomic(a, b))];
    }
    case "ncmp": {
      const l = evaluate(ast.l, env);
      const r = evaluate(ast.r, env);
      if (l.length === 0 || r.length === 0) return [];
      const a = l[0];
      const b = r[0];
      if (!isNode(a) || !isNode(b))
        throw new XPathError("XPTY0004", "Node comparison on atomic values");
      if (ast.op === "is") return [a === b];
      return [ast.op === "<<" ? a.order < b.order : a.order > b.order];
    }
    case "range": {
      const l = atomize(evaluate(ast.l, env));
      const r = atomize(evaluate(ast.r, env));
      if (l.length === 0 || r.length === 0) return [];
      const from = Number(toInteger(l[0] as Atomic).toBigInt());
      const to = Number(toInteger(r[0] as Atomic).toBigInt());
      const out: Sequence = [];
      for (let i = from; i <= to; i++) out.push(Decimal.fromInt(i));
      return out;
    }
    case "arith": {
      const l = atomize(evaluate(ast.l, env));
      const r = atomize(evaluate(ast.r, env));
      if (l.length === 0 || r.length === 0) return [];
      if (l.length > 1 || r.length > 1)
        throw new XPathError("XPTY0004", "Arithmetic on a sequence of several values");
      return [arithmetic(ast.op, l[0] as Atomic, r[0] as Atomic)];
    }
    case "neg": {
      const v = atomize(evaluate(ast.e, env));
      if (v.length === 0) return [];
      const x = v[0] instanceof Untyped ? toDouble(v[0] as Atomic) : (v[0] as Atomic);
      if (x instanceof Decimal) return [x.neg()];
      if (typeof x === "number") return [-x];
      throw new XPathError("XPTY0004", "Negation of a non-numeric value");
    }
    case "setop": {
      const l = evaluate(ast.l, env);
      const r = evaluate(ast.r, env);
      if (!l.every(isNode) || !r.every(isNode))
        throw new XPathError("XPTY0004", "Set operation on atomic values");
      const ln = l as XNode[];
      const rn = r as XNode[];
      if (ast.op === "union") return documentOrder([...ln, ...rn]);
      const rs = new Set(rn);
      return documentOrder(
        ast.op === "intersect" ? ln.filter((n) => rs.has(n)) : ln.filter((n) => !rs.has(n)),
      );
    }
    case "instance":
      return [instanceOf(evaluate(ast.e, env), ast.type)];
    case "castable": {
      const v = atomize(evaluate(ast.e, env));
      if (v.length === 0) return [ast.type.occurrence === "?"];
      if (v.length > 1) return [false];
      try {
        castTo(v[0] as Atomic, ast.type.name);
        return [true];
      } catch {
        return [false];
      }
    }
    case "cast": {
      const v = atomize(evaluate(ast.e, env));
      if (v.length === 0) {
        if (ast.type.occurrence === "?") return [];
        throw new XPathError("XPTY0004", "Cast of an empty sequence");
      }
      return [castTo(v[0] as Atomic, ast.type.name)];
    }
    case "path":
      return evalPath(ast, env);
    case "call": {
      const fn = env.functions.get(`${ast.name}#${ast.args.length}`) ?? env.functions.get(ast.name);
      if (!fn) throw new XPathError("XPST0017", `Unknown function ${ast.name}#${ast.args.length}`);
      return fn(
        env,
        ast.args.map((a) => evaluate(a, env)),
      );
    }
  }
}
