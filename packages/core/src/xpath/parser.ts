/**
 * Parser for the XPath 2.0 subset that Schematron rules for e-invoices use (EN 16931, XRechnung,
 * Peppol): paths with all axes, predicates, for/some/every/if expressions, general and value
 * comparisons, arithmetic, sequences and function calls.
 */
import type { Ast, Axis, NodeTest, SequenceType, Step } from "./ast";
import { Decimal } from "./decimal";

export class XPathSyntaxError extends Error {
  constructor(
    message: string,
    readonly expression: string,
  ) {
    super(
      `${message} in XPath: ${expression.length > 200 ? `${expression.slice(0, 200)}…` : expression}`,
    );
    this.name = "XPathSyntaxError";
  }
}

type Token =
  | { k: "name"; v: string }
  | { k: "num"; v: string }
  | { k: "str"; v: string }
  | { k: "var"; v: string }
  | { k: "op"; v: string }
  | { k: "eof"; v: "" };

const NAME_START = /[A-Za-z_À-￿]/;
const NAME_CHAR = /[A-Za-z0-9_.\-·À-￿]/;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const err = (m: string) => new XPathSyntaxError(m, src);
  const readNCName = (): string => {
    const start = i;
    i++;
    while (i < src.length && NAME_CHAR.test(src[i] as string)) i++;
    return src.slice(start, i);
  };
  while (i < src.length) {
    const c = src[i] as string;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "(" && src[i + 1] === ":") {
      let depth = 1;
      i += 2;
      while (i < src.length && depth > 0) {
        if (src[i] === "(" && src[i + 1] === ":") {
          depth++;
          i += 2;
        } else if (src[i] === ":" && src[i + 1] === ")") {
          depth--;
          i += 2;
        } else i++;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      let value = "";
      i++;
      for (;;) {
        if (i >= src.length) throw err("Unterminated string literal");
        if (src[i] === c) {
          if (src[i + 1] === c) {
            value += c;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        value += src[i];
        i++;
      }
      out.push({ k: "str", v: value });
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw err("Invalid number");
      out.push({ k: "num", v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === "$") {
      i++;
      while (src[i] === " ") i++;
      if (!NAME_START.test(src[i] ?? "")) throw err("Expected variable name");
      let name = readNCName();
      if (src[i] === ":" && NAME_START.test(src[i + 1] ?? "")) {
        i++;
        name += `:${readNCName()}`;
      }
      out.push({ k: "var", v: name });
      continue;
    }
    if (NAME_START.test(c)) {
      let name = readNCName();
      if (src[i] === ":" && src[i + 1] !== ":") {
        if (src[i + 1] === "*") {
          name += ":*";
          i += 2;
        } else if (NAME_START.test(src[i + 1] ?? "")) {
          i++;
          name += `:${readNCName()}`;
        }
      }
      out.push({ k: "name", v: name });
      continue;
    }
    if (c === "*" && src[i + 1] === ":" && NAME_START.test(src[i + 2] ?? "")) {
      i += 2;
      out.push({ k: "name", v: `*:${readNCName()}` });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["//", "::", "!=", "<=", ">=", "<<", ">>", ".."].includes(two)) {
      out.push({ k: "op", v: two });
      i += 2;
      continue;
    }
    if ("/()[]@,.|+-*=<>?".includes(c)) {
      out.push({ k: "op", v: c });
      i++;
      continue;
    }
    throw err(`Unexpected character "${c}"`);
  }
  out.push({ k: "eof", v: "" });
  return out;
}

const AXES = new Set<Axis>([
  "child",
  "descendant",
  "descendant-or-self",
  "self",
  "parent",
  "ancestor",
  "ancestor-or-self",
  "following-sibling",
  "preceding-sibling",
  "following",
  "preceding",
  "attribute",
]);

const KIND_TESTS: Record<string, NodeTest["t"] extends never ? never : string> = {
  node: "node",
  text: "text",
  comment: "comment",
  "processing-instruction": "pi",
  element: "element",
  attribute: "attribute",
  "document-node": "document",
};

export const XS_NS = "http://www.w3.org/2001/XMLSchema";
export const FN_NS = "http://www.w3.org/2005/xpath-functions";

/**
 * Parses an XPath expression. `namespaces` maps prefixes to URIs for name tests and function
 * names; function names come back as "fn:local", "xs:local" or "{uri}local".
 */
export function parseXPath(src: string, namespaces: ReadonlyMap<string, string>): Ast {
  const tokens = tokenize(src);
  let p = 0;
  const peek = (o = 0): Token => tokens[p + o] ?? { k: "eof", v: "" };
  const next = (): Token => tokens[p++] ?? { k: "eof", v: "" };
  const err = (m: string) => new XPathSyntaxError(m, src);
  const isOp = (v: string, o = 0) => {
    const t = peek(o);
    return t.k === "op" && t.v === v;
  };
  const isName = (v: string, o = 0) => {
    const t = peek(o);
    return t.k === "name" && t.v === v;
  };
  const expectOp = (v: string) => {
    if (!isOp(v)) throw err(`Expected "${v}" but found "${peek().v}"`);
    p++;
  };

  const resolvePrefix = (prefix: string): string => {
    const uri = namespaces.get(prefix);
    if (uri === undefined) {
      if (prefix === "xs") return XS_NS;
      if (prefix === "fn") return FN_NS;
      throw err(`Unknown namespace prefix "${prefix}"`);
    }
    return uri;
  };

  const nameTest = (
    qname: string,
    isAttribute: boolean,
  ): { ns: string | null; local: string | null } => {
    if (qname === "*") return { ns: null, local: null };
    const i = qname.indexOf(":");
    if (i === -1) return { ns: isAttribute ? "" : "", local: qname };
    const prefix = qname.slice(0, i);
    const local = qname.slice(i + 1);
    return {
      ns: prefix === "*" ? null : resolvePrefix(prefix),
      local: local === "*" ? null : local,
    };
  };

  const functionName = (qname: string): string => {
    const i = qname.indexOf(":");
    if (i === -1) return `fn:${qname}`;
    const uri = resolvePrefix(qname.slice(0, i));
    const local = qname.slice(i + 1);
    if (uri === FN_NS) return `fn:${local}`;
    if (uri === XS_NS) return `xs:${local}`;
    return `{${uri}}${local}`;
  };

  const sequenceType = (): SequenceType => {
    const t = next();
    if (t.k !== "name") throw err("Expected a type name");
    let name: string;
    if (isOp("(")) {
      // empty-sequence(), item(), node() and other kind tests
      p++;
      let depth = 1;
      while (depth > 0) {
        const x = next();
        if (x.k === "eof") throw err("Unterminated type");
        if (x.k === "op" && x.v === "(") depth++;
        if (x.k === "op" && x.v === ")") depth--;
      }
      name = `${t.v}()`;
      if (t.v === "empty-sequence") return { name, occurrence: "", empty: true };
    } else {
      const fn = functionName(t.v);
      name = fn.startsWith("fn:") ? `xs:${fn.slice(3)}` : fn;
    }
    let occurrence: SequenceType["occurrence"] = "";
    if (isOp("?") || isOp("*") || isOp("+")) occurrence = next().v as "?" | "*" | "+";
    return { name, occurrence };
  };

  const bindings = (): Array<[string, Ast]> => {
    const out: Array<[string, Ast]> = [];
    for (;;) {
      const v = next();
      if (v.k !== "var") throw err("Expected a variable binding");
      if (!isName("in")) throw err('Expected "in"');
      p++;
      out.push([v.v, exprSingle()]);
      if (!isOp(",")) break;
      p++;
    }
    return out;
  };

  function expr(): Ast {
    const first = exprSingle();
    if (!isOp(",")) return first;
    const items = [first];
    while (isOp(",")) {
      p++;
      items.push(exprSingle());
    }
    return { t: "seq", items };
  }

  function exprSingle(): Ast {
    const t = peek();
    if (t.k === "name" && peek(1).k === "var") {
      if (t.v === "for") {
        p++;
        const b = bindings();
        if (!isName("return")) throw err('Expected "return"');
        p++;
        return { t: "for", bindings: b, ret: exprSingle() };
      }
      if (t.v === "some" || t.v === "every") {
        p++;
        const b = bindings();
        if (!isName("satisfies")) throw err('Expected "satisfies"');
        p++;
        return { t: "quant", every: t.v === "every", bindings: b, sat: exprSingle() };
      }
    }
    if (t.k === "name" && t.v === "if" && isOp("(", 1)) {
      p += 2;
      const cond = expr();
      expectOp(")");
      if (!isName("then")) throw err('Expected "then"');
      p++;
      const thenBranch = exprSingle();
      if (!isName("else")) throw err('Expected "else"');
      p++;
      return { t: "if", cond, whenTrue: thenBranch, whenFalse: exprSingle() };
    }
    return orExpr();
  }

  function orExpr(): Ast {
    let l = andExpr();
    while (isName("or")) {
      p++;
      l = { t: "or", l, r: andExpr() };
    }
    return l;
  }

  function andExpr(): Ast {
    let l = comparisonExpr();
    while (isName("and")) {
      p++;
      l = { t: "and", l, r: comparisonExpr() };
    }
    return l;
  }

  function comparisonExpr(): Ast {
    const l = rangeExpr();
    const t = peek();
    if (t.k === "op" && ["=", "!=", "<", "<=", ">", ">="].includes(t.v)) {
      p++;
      return { t: "gcmp", op: t.v as "=", l, r: rangeExpr() };
    }
    if (t.k === "op" && (t.v === "<<" || t.v === ">>")) {
      p++;
      return { t: "ncmp", op: t.v, l, r: rangeExpr() };
    }
    if (t.k === "name" && ["eq", "ne", "lt", "le", "gt", "ge"].includes(t.v)) {
      p++;
      return { t: "vcmp", op: t.v as "eq", l, r: rangeExpr() };
    }
    if (t.k === "name" && t.v === "is") {
      p++;
      return { t: "ncmp", op: "is", l, r: rangeExpr() };
    }
    return l;
  }

  function rangeExpr(): Ast {
    const l = additiveExpr();
    if (isName("to")) {
      p++;
      return { t: "range", l, r: additiveExpr() };
    }
    return l;
  }

  function additiveExpr(): Ast {
    let l = multiplicativeExpr();
    while (isOp("+") || isOp("-")) {
      const op = next().v as "+" | "-";
      l = { t: "arith", op, l, r: multiplicativeExpr() };
    }
    return l;
  }

  function multiplicativeExpr(): Ast {
    let l = unionExpr();
    for (;;) {
      if (isOp("*")) {
        p++;
        l = { t: "arith", op: "*", l, r: unionExpr() };
      } else if (isName("div") || isName("idiv") || isName("mod")) {
        const op = next().v as "div";
        l = { t: "arith", op, l, r: unionExpr() };
      } else return l;
    }
  }

  function unionExpr(): Ast {
    let l = intersectExpr();
    while (isOp("|") || isName("union")) {
      p++;
      l = { t: "setop", op: "union", l, r: intersectExpr() };
    }
    return l;
  }

  function intersectExpr(): Ast {
    let l = instanceofExpr();
    while (isName("intersect") || isName("except")) {
      const op = next().v as "intersect" | "except";
      l = { t: "setop", op, l, r: instanceofExpr() };
    }
    return l;
  }

  function instanceofExpr(): Ast {
    let e = castableExpr();
    if (isName("instance") && isName("of", 1)) {
      p += 2;
      e = { t: "instance", e, type: sequenceType() };
    }
    if (isName("treat") && isName("as", 1)) {
      p += 2;
      sequenceType();
    }
    return e;
  }

  function castableExpr(): Ast {
    let e = unaryExpr();
    if (isName("castable") && isName("as", 1)) {
      p += 2;
      e = { t: "castable", e, type: sequenceType() };
    } else if (isName("cast") && isName("as", 1)) {
      p += 2;
      e = { t: "cast", e, type: sequenceType() };
    }
    return e;
  }

  function unaryExpr(): Ast {
    let negate = false;
    let signed = false;
    while (isOp("-") || isOp("+")) {
      signed = true;
      if (next().v === "-") negate = !negate;
    }
    const e = pathExpr();
    if (negate) return { t: "neg", e };
    if (signed) return { t: "arith", op: "+", l: { t: "num", v: Decimal.ZERO }, r: e };
    return e;
  }

  const startsStep = (): boolean => {
    const t = peek();
    if (t.k === "name" || t.k === "num" || t.k === "str" || t.k === "var") return true;
    return t.k === "op" && ["@", ".", "..", "(", "*"].includes(t.v);
  };

  function pathExpr(): Ast {
    let absolute: "" | "/" | "//" = "";
    if (isOp("/")) {
      p++;
      absolute = "/";
      if (!startsStep()) return { t: "path", absolute, steps: [] };
    } else if (isOp("//")) {
      p++;
      absolute = "//";
    }
    const steps: Step[] = [stepExpr(absolute === "//")];
    while (isOp("/") || isOp("//")) {
      const desc = next().v === "//";
      steps.push(stepExpr(desc));
    }
    if (absolute === "" && steps.length === 1) {
      const only = steps[0] as Step;
      if (only.t === "filter" && only.preds.length === 0) return only.primary;
    }
    return { t: "path", absolute, steps };
  }

  function predicates(): Ast[] {
    const preds: Ast[] = [];
    while (isOp("[")) {
      p++;
      preds.push(expr());
      expectOp("]");
    }
    return preds;
  }

  function nodeTestFor(axis: Axis): NodeTest {
    const t = peek();
    if (t.k === "op" && t.v === "*") {
      p++;
      return { t: "name", ns: null, local: null };
    }
    if (t.k !== "name") throw err(`Expected a node test but found "${t.v}"`);
    p++;
    const kind = KIND_TESTS[t.v];
    if (kind && isOp("(")) {
      p++;
      let name: { ns: string | null; local: string | null } | undefined;
      if (!isOp(")")) {
        const n = next();
        if (n.k === "name" || (n.k === "op" && n.v === "*")) {
          name = nameTest(n.v, kind === "attribute");
        } else if (n.k === "str" && kind === "pi") {
          name = { ns: "", local: n.v };
        }
        while (!isOp(")")) {
          if (peek().k === "eof") throw err("Unterminated kind test");
          p++;
        }
      }
      expectOp(")");
      return { t: "kind", kind: kind as "node", name };
    }
    return { t: "name", ...nameTest(t.v, axis === "attribute") };
  }

  function stepExpr(desc: boolean): Step {
    const t = peek();
    if (t.k === "op" && t.v === "..") {
      p++;
      return {
        t: "axis",
        axis: "parent",
        test: { t: "kind", kind: "node" },
        preds: predicates(),
        desc,
      };
    }
    if (t.k === "op" && t.v === "@") {
      p++;
      const test = nodeTestFor("attribute");
      return { t: "axis", axis: "attribute", test, preds: predicates(), desc };
    }
    if (t.k === "name" && isOp("::", 1)) {
      const axis = t.v as Axis;
      if (!AXES.has(axis)) throw err(`Unknown axis "${t.v}"`);
      p += 2;
      const test = nodeTestFor(axis);
      return { t: "axis", axis, test, preds: predicates(), desc };
    }
    if ((t.k === "name" && !(isOp("(", 1) && !KIND_TESTS[t.v])) || (t.k === "op" && t.v === "*")) {
      const test = nodeTestFor("child");
      const axis: Axis = test.t === "kind" && test.kind === "attribute" ? "attribute" : "child";
      return { t: "axis", axis, test, preds: predicates(), desc };
    }
    const primary = primaryExpr();
    return { t: "filter", primary, preds: predicates(), desc };
  }

  function primaryExpr(): Ast {
    const t = next();
    switch (t.k) {
      case "num": {
        if (/[eE]/.test(t.v)) return { t: "num", v: Number(t.v) };
        return { t: "num", v: Decimal.parse(t.v) as Decimal };
      }
      case "str":
        return { t: "str", v: t.v };
      case "var":
        return { t: "var", name: t.v };
      case "op":
        if (t.v === ".") return { t: "ctx" };
        if (t.v === "(") {
          if (isOp(")")) {
            p++;
            return { t: "seq", items: [] };
          }
          const e = expr();
          expectOp(")");
          return e.t === "seq" ? e : { t: "seq", items: [e] };
        }
        throw err(`Unexpected "${t.v}"`);
      case "name": {
        if (!isOp("(")) throw err(`Unexpected name "${t.v}"`);
        p++;
        const args: Ast[] = [];
        if (!isOp(")")) {
          args.push(exprSingle());
          while (isOp(",")) {
            p++;
            args.push(exprSingle());
          }
        }
        expectOp(")");
        return { t: "call", name: functionName(t.v), args };
      }
      default:
        throw err("Unexpected end of expression");
    }
  }

  const ast = expr();
  if (peek().k !== "eof") throw err(`Unexpected "${peek().v}"`);
  return ast;
}
