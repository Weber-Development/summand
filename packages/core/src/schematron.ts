/**
 * A Schematron runtime on top of the XPath engine. Rule sets are compiled once from the
 * Schematron XML (see {@link compileSchematron}) into plain JSON and evaluated against invoice
 * documents with {@link runSchematron}.
 */

import { childElements, nodePath, parseXml, stringValue, type XNode } from "./xml";
import type { Ast } from "./xpath/ast";
import {
  type Env,
  ebv,
  evaluate,
  type Sequence,
  stringOf,
  XPathError,
  type XPathFunction,
} from "./xpath/eval";
import { builtinFunctions } from "./xpath/functions";
import { parseXPath } from "./xpath/parser";

const SCH_NS = "http://purl.oclc.org/dsdl/schematron";
const XSL_NS = "http://www.w3.org/1999/XSL/Transform";

export type Flag = "fatal" | "error" | "warning" | "information";

/** Part of an assertion message: literal text, the context node's name, or an XPath value. */
export type MessagePart = string | { name: true } | { select: string };

export interface CompiledAssert {
  id: string;
  flag: Flag;
  test: string;
  /** true for <report> (fires when the test is true). */
  report?: boolean;
  message: MessagePart[];
  /** German message, when a translation exists. */
  messageDe?: MessagePart[];
}

export interface CompiledRule {
  context: string;
  lets: Array<[string, string]>;
  asserts: CompiledAssert[];
}

export interface CompiledPattern {
  id: string;
  lets: Array<[string, string]>;
  rules: CompiledRule[];
}

/** An xsl:function declared in the schema (parameters, local variables, result). */
export interface CompiledFunction {
  /** Prefixed name as written, resolved with the rule set's namespaces. */
  name: string;
  params: string[];
  vars: Array<[string, string]>;
  select: string;
}

export interface CompiledRuleSet {
  id: string;
  title: string;
  namespaces: Array<[string, string]>;
  lets: Array<[string, string]>;
  functions: CompiledFunction[];
  patterns: CompiledPattern[];
}

export interface SchematronFinding {
  /** Rule identifier, e.g. "BR-CO-10". */
  id: string;
  flag: Flag;
  message: string;
  /** XPath of the node the rule fired on. */
  location: string;
  /** Line of that node in the source document. */
  line: number;
  /** Set when the rule could not be evaluated (for example a non-numeric amount). */
  evaluationError?: string;
}

function textContent(n: XNode): string {
  return stringValue(n);
}

function attr(n: XNode, name: string): string | undefined {
  return n.attributes.find((a) => a.local === name && a.ns === "")?.value;
}

function normalizeFlag(flag: string | undefined): Flag {
  switch ((flag ?? "").toLowerCase()) {
    case "warning":
    case "warn":
      return "warning";
    case "information":
    case "info":
      return "information";
    case "error":
      return "error";
    default:
      return "fatal";
  }
}

function messageParts(n: XNode): MessagePart[] {
  const parts: MessagePart[] = [];
  const walk = (x: XNode) => {
    for (const c of x.children) {
      if (c.kind === "text") parts.push(c.value);
      else if (c.kind === "element" && c.ns === SCH_NS && c.local === "name")
        parts.push({ name: true });
      else if (c.kind === "element" && c.ns === SCH_NS && c.local === "value-of") {
        parts.push({ select: attr(c, "select") ?? "." });
      } else if (c.kind === "element") walk(c);
    }
  };
  walk(n);
  return parts;
}

/**
 * Compiles a Schematron schema (ISO Schematron, XSLT 2 binding) into a rule set. `includes`
 * resolves <include href> to the text of the referenced file.
 */
export function compileSchematron(
  source: string,
  options: { id: string; includes?: Record<string, string> },
): CompiledRuleSet {
  const doc = parseXml(source);
  const schema = doc.children.find((c) => c.kind === "element" && c.local === "schema");
  if (!schema || schema.ns !== SCH_NS) throw new Error("Not an ISO Schematron schema");

  const set: CompiledRuleSet = {
    id: options.id,
    title: textContent(childElements(schema, SCH_NS, "title")[0] ?? schema)
      .trim()
      .replace(/\s+/g, " "),
    namespaces: [],
    lets: [],
    functions: [],
    patterns: [],
  };
  // Prefixes declared on the schema element (e.g. for xsl:function names) count as well.
  for (const [prefix, uri] of schema.namespaces ?? []) {
    if (prefix && uri !== SCH_NS && uri !== XSL_NS) set.namespaces.push([prefix, uri]);
  }

  const visitSchemaChild = (c: XNode) => {
    if (c.kind === "element" && c.ns === XSL_NS && c.local === "function") {
      const fn: CompiledFunction = {
        name: attr(c, "name") ?? "",
        params: [],
        vars: [],
        select: "()",
      };
      for (const x of c.children) {
        if (x.kind !== "element" || x.ns !== XSL_NS) continue;
        if (x.local === "param") fn.params.push(attr(x, "name") ?? "");
        if (x.local === "variable")
          fn.vars.push([attr(x, "name") ?? "", attr(x, "select") ?? "()"]);
        if (x.local === "sequence") fn.select = attr(x, "select") ?? "()";
      }
      set.functions.push(fn);
      return;
    }
    if (c.kind !== "element" || c.ns !== SCH_NS) return;
    switch (c.local) {
      case "ns":
        set.namespaces.push([attr(c, "prefix") ?? "", attr(c, "uri") ?? ""]);
        break;
      case "let":
        set.lets.push([attr(c, "name") ?? "", attr(c, "value") ?? "."]);
        break;
      case "include": {
        const href = attr(c, "href") ?? "";
        const text = options.includes?.[href];
        if (text === undefined) throw new Error(`Missing include ${href}`);
        const included = parseXml(text);
        const root = included.children.find((x) => x.kind === "element");
        if (!root) break;
        if (root.local === "schema" || root.local === "pattern") {
          if (root.local === "pattern") visitSchemaChild(root);
          else for (const x of root.children) visitSchemaChild(x);
        } else visitSchemaChild(root);
        break;
      }
      case "pattern": {
        if (attr(c, "abstract") === "true") break;
        const pattern: CompiledPattern = {
          id: attr(c, "id") ?? `pattern-${set.patterns.length + 1}`,
          lets: [],
          rules: [],
        };
        for (const r of c.children) {
          if (r.kind !== "element" || r.ns !== SCH_NS) continue;
          // Pattern-level variables are global in the XSLT implementation of Schematron.
          if (r.local === "let") set.lets.push([attr(r, "name") ?? "", attr(r, "value") ?? "."]);
          if (r.local !== "rule" || attr(r, "abstract") === "true") continue;
          const rule: CompiledRule = { context: attr(r, "context") ?? "/", lets: [], asserts: [] };
          for (const a of r.children) {
            if (a.kind !== "element" || a.ns !== SCH_NS) continue;
            if (a.local === "let") rule.lets.push([attr(a, "name") ?? "", attr(a, "value") ?? "."]);
            if (a.local === "assert" || a.local === "report") {
              rule.asserts.push({
                id: attr(a, "id") ?? "",
                flag: normalizeFlag(attr(a, "flag") ?? attr(a, "role")),
                test: attr(a, "test") ?? "true()",
                ...(a.local === "report" ? { report: true } : {}),
                message: messageParts(a),
              });
            }
          }
          pattern.rules.push(rule);
        }
        set.patterns.push(pattern);
        break;
      }
    }
  };
  for (const c of schema.children) visitSchemaChild(c);
  return set;
}

interface PreparedRuleSet {
  namespaces: Map<string, string>;
  cache: Map<string, Ast>;
}

const prepared = new WeakMap<CompiledRuleSet, PreparedRuleSet>();

function prepare(set: CompiledRuleSet): PreparedRuleSet {
  let p = prepared.get(set);
  if (!p) {
    p = { namespaces: new Map(set.namespaces), cache: new Map() };
    prepared.set(set, p);
  }
  return p;
}

function compileExpr(p: PreparedRuleSet, src: string): Ast {
  let ast = p.cache.get(src);
  if (!ast) {
    ast = parseXPath(src, p.namespaces);
    p.cache.set(src, ast);
  }
  return ast;
}

/** Turns an XSLT match pattern into an expression selecting all matching nodes. */
function patternToSelect(ast: Ast): Ast {
  if (ast.t === "setop" && ast.op === "union") {
    return { t: "setop", op: "union", l: patternToSelect(ast.l), r: patternToSelect(ast.r) };
  }
  if (ast.t === "seq" && ast.items.length === 1) return patternToSelect(ast.items[0] as Ast);
  if (ast.t === "path" && ast.absolute === "") return { ...ast, absolute: "//" };
  return ast;
}

export interface RunOptions {
  /** Extra functions, keyed like "{uri}local" (see parseXPath). */
  functions?: ReadonlyMap<string, XPathFunction>;
  /** Variables available to all expressions, e.g. external parameters. */
  variables?: ReadonlyMap<string, Sequence>;
  /** Message language. German falls back to the original text where no translation exists. */
  lang?: "en" | "de";
}

const selectCache = new WeakMap<Ast, Ast>();

/** Evaluates a compiled rule set against a parsed document. */
export function runSchematron(
  set: CompiledRuleSet,
  doc: XNode,
  options: RunOptions = {},
): SchematronFinding[] {
  const p = prepare(set);
  const functions = new Map<string, XPathFunction>([
    ...builtinFunctions,
    ...(options.functions ?? []),
  ]);
  const baseEnv = (item: XNode | undefined, vars: Map<string, Sequence>): Env => ({
    item,
    position: 1,
    size: 1,
    vars,
    functions,
    current: item,
  });
  const globals = new Map<string, Sequence>(options.variables ?? []);

  for (const fn of set.functions) {
    const i = fn.name.indexOf(":");
    const uri = i === -1 ? "" : p.namespaces.get(fn.name.slice(0, i));
    if (uri === undefined) continue;
    const key = `{${uri}}${fn.name.slice(i + 1)}`;
    functions.set(`${key}#${fn.params.length}`, (_env, args) => {
      const vars = new Map(globals);
      fn.params.forEach((name, index) => {
        vars.set(name, args[index] ?? []);
      });
      for (const [name, value] of fn.vars)
        vars.set(name, evaluate(compileExpr(p, value), baseEnv(undefined, vars)));
      return evaluate(compileExpr(p, fn.select), baseEnv(undefined, vars));
    });
  }

  const bindLets = (lets: Array<[string, string]>, node: XNode, vars: Map<string, Sequence>) => {
    for (const [name, value] of lets) {
      try {
        vars.set(name, evaluate(compileExpr(p, value), baseEnv(node, vars)));
      } catch (e) {
        if (!(e instanceof XPathError)) throw e;
        vars.set(name, []);
      }
    }
  };

  // Global variables may refer to each other in any order: evaluate until nothing changes.
  let pending = set.lets;
  while (pending.length) {
    const retry: Array<[string, string]> = [];
    for (const [name, value] of pending) {
      try {
        globals.set(name, evaluate(compileExpr(p, value), baseEnv(doc, globals)));
      } catch (e) {
        if (!(e instanceof XPathError)) throw e;
        if (e.code === "XPST0008") retry.push([name, value]);
        else globals.set(name, []);
      }
    }
    if (retry.length === pending.length) {
      for (const [name] of retry) globals.set(name, []);
      break;
    }
    pending = retry;
  }

  const findings: SchematronFinding[] = [];
  for (const pattern of set.patterns) {
    const patternVars = pattern.lets.length ? new Map(globals) : globals;
    bindLets(pattern.lets, doc, patternVars);
    // Each node is handled by the first rule of the pattern whose context matches it.
    const owner = new Map<XNode, number>();
    pattern.rules.forEach((rule, index) => {
      const ast = compileExpr(p, rule.context);
      let select = selectCache.get(ast);
      if (!select) {
        select = patternToSelect(ast);
        selectCache.set(ast, select);
      }
      let matched: Sequence;
      try {
        matched = evaluate(select, baseEnv(doc, patternVars));
      } catch (e) {
        if (!(e instanceof XPathError)) throw e;
        return;
      }
      for (const n of matched) {
        if (typeof n === "object" && n !== null && "children" in n && !owner.has(n as XNode))
          owner.set(n as XNode, index);
      }
    });
    const nodes = [...owner.keys()].sort((a, b) => a.order - b.order);
    for (const node of nodes) {
      const rule = pattern.rules[owner.get(node) as number] as CompiledRule;
      const vars = rule.lets.length ? new Map(patternVars) : patternVars;
      bindLets(rule.lets, node, vars);
      const env = baseEnv(node, vars);
      for (const a of rule.asserts) {
        let fired: boolean;
        let evaluationError: string | undefined;
        try {
          const result = ebv(evaluate(compileExpr(p, a.test), env));
          fired = a.report ? result : !result;
        } catch (e) {
          if (!(e instanceof XPathError)) throw e;
          fired = true;
          evaluationError = e.message;
        }
        if (!fired) continue;
        findings.push({
          id: a.id,
          flag: a.flag,
          message: renderMessage(p, (options.lang === "de" && a.messageDe) || a.message, env, node),
          location: nodePath(node),
          line: node.line,
          ...(evaluationError ? { evaluationError } : {}),
        });
      }
    }
  }
  return findings;
}

function renderMessage(p: PreparedRuleSet, parts: MessagePart[], env: Env, node: XNode): string {
  let out = "";
  for (const part of parts) {
    if (typeof part === "string") out += part;
    else if ("name" in part) out += node.prefix ? `${node.prefix}:${node.local}` : node.local;
    else {
      try {
        out += evaluate(compileExpr(p, part.select), env)
          .map((v) => stringOf(v))
          .join(" ");
      } catch {
        // leave the value out
      }
    }
  }
  return out.replace(/\s+/g, " ").trim();
}
