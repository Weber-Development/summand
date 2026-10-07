/**
 * The XPath 2.0 engine Summand uses for Schematron, for direct use on parsed documents. Everything
 * in this entry point is advanced API (`@beta`): it may change in a minor release.
 */
export type { Ast } from "./xpath/ast";
export { Decimal } from "./xpath/decimal";
export {
  type Atomic,
  atomize,
  type Env,
  ebv,
  evaluate,
  type Item,
  isNode,
  type Sequence,
  stringOf,
  Untyped,
  XDate,
  XPathError,
  type XPathFunction,
} from "./xpath/eval";
export { builtinFunctions, xpathRegex } from "./xpath/functions";
export { parseXPath, XPathSyntaxError } from "./xpath/parser";

import type { XNode } from "./xml";
import { evaluate as run, type Sequence as Seq } from "./xpath/eval";
import { builtinFunctions as builtins } from "./xpath/functions";
import { parseXPath as parse } from "./xpath/parser";

/**
 * Evaluates an XPath expression against a node. `namespaces` maps the prefixes used in the
 * expression to namespace URIs, `variables` binds `$name` variables.
 *
 * @throws {@link XPathSyntaxError} for an invalid expression, {@link XPathError} when it cannot
 * be evaluated.
 * @beta
 */
export function select(
  expression: string,
  node: XNode,
  namespaces: Record<string, string> = {},
  variables: Record<string, Seq> = {},
): Seq {
  return run(parse(expression, new Map(Object.entries(namespaces))), {
    item: node,
    position: 1,
    size: 1,
    vars: new Map(Object.entries(variables)),
    functions: builtins,
    current: node,
  });
}
