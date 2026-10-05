import type { Decimal } from "./decimal";

export type Axis =
  | "child"
  | "descendant"
  | "descendant-or-self"
  | "self"
  | "parent"
  | "ancestor"
  | "ancestor-or-self"
  | "following-sibling"
  | "preceding-sibling"
  | "following"
  | "preceding"
  | "attribute";

export type NodeTest =
  | { t: "name"; ns: string | null; local: string | null } // null = wildcard
  | {
      t: "kind";
      kind: "node" | "text" | "comment" | "pi" | "element" | "attribute" | "document";
      name?: { ns: string | null; local: string | null };
    };

export interface SequenceType {
  /** Expanded atomic type name such as "xs:decimal", or a kind such as "node()". */
  name: string;
  occurrence: "" | "?" | "*" | "+";
  empty?: boolean;
}

export type Ast =
  | { t: "num"; v: Decimal | number }
  | { t: "str"; v: string }
  | { t: "var"; name: string }
  | { t: "ctx" }
  | { t: "seq"; items: Ast[] }
  | { t: "for"; bindings: Array<[string, Ast]>; ret: Ast }
  | { t: "quant"; every: boolean; bindings: Array<[string, Ast]>; sat: Ast }
  | { t: "if"; cond: Ast; whenTrue: Ast; whenFalse: Ast }
  | { t: "or"; l: Ast; r: Ast }
  | { t: "and"; l: Ast; r: Ast }
  | { t: "gcmp"; op: "=" | "!=" | "<" | "<=" | ">" | ">="; l: Ast; r: Ast }
  | { t: "vcmp"; op: "eq" | "ne" | "lt" | "le" | "gt" | "ge"; l: Ast; r: Ast }
  | { t: "ncmp"; op: "is" | "<<" | ">>"; l: Ast; r: Ast }
  | { t: "range"; l: Ast; r: Ast }
  | { t: "arith"; op: "+" | "-" | "*" | "div" | "idiv" | "mod"; l: Ast; r: Ast }
  | { t: "neg"; e: Ast }
  | { t: "setop"; op: "union" | "intersect" | "except"; l: Ast; r: Ast }
  | { t: "instance"; e: Ast; type: SequenceType }
  | { t: "castable"; e: Ast; type: SequenceType }
  | { t: "cast"; e: Ast; type: SequenceType }
  | { t: "path"; absolute: "" | "/" | "//"; steps: Step[] }
  | { t: "call"; name: string; args: Ast[] };

export type Step =
  | { t: "axis"; axis: Axis; test: NodeTest; preds: Ast[]; desc: boolean }
  | { t: "filter"; primary: Ast; preds: Ast[]; desc: boolean };
