# @sweberdev/summand/xpath

## Ast (type, beta)

```ts
type Ast = {
    t: "num";
    v: Decimal | number;
} | {
    t: "str";
    v: string;
} | {
    t: "var";
    name: string;
} | {
    t: "ctx";
} | {
    t: "seq";
    items: Ast[];
} | {
    t: "for";
    bindings: Array<[
        string,
        Ast
    ]>;
    ret: Ast;
} | {
    t: "quant";
    every: boolean;
    bindings: Array<[
        string,
        Ast
    ]>;
    sat: Ast;
} | {
    t: "if";
    cond: Ast;
    whenTrue: Ast;
    whenFalse: Ast;
} | {
    t: "or";
    l: Ast;
    r: Ast;
} | {
    t: "and";
    l: Ast;
    r: Ast;
} | {
    t: "gcmp";
    op: "=" | "!=" | "<" | "<=" | ">" | ">=";
    l: Ast;
    r: Ast;
} | {
    t: "vcmp";
    op: "eq" | "ne" | "lt" | "le" | "gt" | "ge";
    l: Ast;
    r: Ast;
} | {
    t: "ncmp";
    op: "is" | "<<" | ">>";
    l: Ast;
    r: Ast;
} | {
    t: "range";
    l: Ast;
    r: Ast;
} | {
    t: "arith";
    op: "+" | "-" | "*" | "div" | "idiv" | "mod";
    l: Ast;
    r: Ast;
} | {
    t: "neg";
    e: Ast;
} | {
    t: "setop";
    op: "union" | "intersect" | "except";
    l: Ast;
    r: Ast;
} | {
    t: "instance";
    e: Ast;
    type: SequenceType;
} | {
    t: "castable";
    e: Ast;
    type: SequenceType;
} | {
    t: "cast";
    e: Ast;
    type: SequenceType;
} | {
    t: "path";
    absolute: "" | "/" | "//";
    steps: Step[];
} | {
    t: "call";
    name: string;
    args: Ast[];
};
```

## Atomic (type, beta)

```ts
type Atomic = string | boolean | number | Decimal | Untyped | XDate;
```

## atomize (value, beta)

```ts
function atomize(seq: Sequence): Atomic[];
```

## builtinFunctions (value, beta)

```ts
const builtinFunctions: ReadonlyMap<string, XPathFunction>;
```

## Decimal (value, beta)

```ts
class Decimal {
    readonly mantissa: bigint;
    readonly scale: number;
    private constructor();
    static readonly ZERO: Decimal;
    static fromBigInt(value: bigint): Decimal;
    static fromInt(value: number): Decimal;
    static parse(text: string): Decimal | null;
    static fromNumber(value: number): Decimal | null;
    private normalize;
    private static align;
    add(other: Decimal): Decimal;
    sub(other: Decimal): Decimal;
    mul(other: Decimal): Decimal;
    div(other: Decimal): Decimal | null;
    idiv(other: Decimal): Decimal | null;
    mod(other: Decimal): Decimal | null;
    neg(): Decimal;
    abs(): Decimal;
    floor(): Decimal;
    ceiling(): Decimal;
    round(precision?: number): Decimal;
    roundHalfEven(precision?: number): Decimal;
    private mulPow10;
    compare(other: Decimal): number;
    isZero(): boolean;
    isInteger(): boolean;
    toNumber(): number;
    toBigInt(): bigint;
    toString(): string;
    get fractionDigits(): number;
}
```

## ebv (value, beta)

```ts
function ebv(seq: Sequence): boolean;
```

## Env (type, beta)

```ts
interface Env {
    item: Item | undefined;
    position: number;
    size: number;
    vars: Map<string, Sequence>;
    functions: ReadonlyMap<string, XPathFunction>;
    current: Item | undefined;
    memo?: Map<Ast, {
        root: XNode;
        value: Sequence;
    }>;
}
```

## evaluate (value, beta)

```ts
function evaluate(ast: Ast, env: Env): Sequence;
```

## isNode (value, beta)

```ts
function isNode(v: Item | undefined): v is XNode;
```

## Item (type, beta)

```ts
type Item = XNode | Atomic;
```

## parseXPath (value, beta)

```ts
function parseXPath(src: string, namespaces: ReadonlyMap<string, string>): Ast;
```

## select (value, beta)

```ts
function select(expression: string, node: XNode, namespaces?: Record<string, string>, variables?: Record<string, Seq>): Seq;
```

## Sequence (type, beta)

```ts
type Sequence = Item[];
```

## stringOf (value, beta)

```ts
function stringOf(v: Item): string;
```

## Untyped (value, beta)

```ts
class Untyped {
    readonly value: string;
    constructor(value: string);
    toString(): string;
}
```

## XDate (value, beta)

```ts
class XDate {
    readonly type: "date" | "dateTime";
    readonly lexical: string;
    readonly key: string;
    constructor(type: "date" | "dateTime", lexical: string, key: string);
    toString(): string;
}
```

## XPathError (value, beta)

```ts
class XPathError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
```

## XPathFunction (type, beta)

```ts
type XPathFunction = (env: Env, args: Sequence[]) => Sequence;
```

## xpathRegex (value, beta)

```ts
function xpathRegex(pattern: string, flags?: string, global?: boolean): RegExp;
```

## XPathSyntaxError (value, beta)

```ts
class XPathSyntaxError extends Error {
    readonly expression: string;
    constructor(message: string, expression: string);
}
```

# Types reachable from the exports above, not exported by name

## Axis

```ts
type Axis = "child" | "descendant" | "descendant-or-self" | "self" | "parent" | "ancestor" | "ancestor-or-self" | "following-sibling" | "preceding-sibling" | "following" | "preceding" | "attribute";
```

## NodeTest

```ts
type NodeTest = {
    t: "name";
    ns: string | null;
    local: string | null;
} | {
    t: "kind";
    kind: "node" | "text" | "comment" | "pi" | "element" | "attribute" | "document";
    name?: {
        ns: string | null;
        local: string | null;
    };
};
```

## SequenceType

```ts
interface SequenceType {
    name: string;
    occurrence: "" | "?" | "*" | "+";
    empty?: boolean;
}
```

## Step

```ts
type Step = {
    t: "axis";
    axis: Axis;
    test: NodeTest;
    preds: Ast[];
    desc: boolean;
} | {
    t: "filter";
    primary: Ast;
    preds: Ast[];
    desc: boolean;
};
```

## XNode

```ts
interface XNode {
    kind: XNodeKind;
    ns: string;
    local: string;
    prefix: string;
    value: string;
    parent: XNode | null;
    children: XNode[];
    attributes: XNode[];
    namespaces: Map<string, string> | null;
    order: number;
    line: number;
}
```

## XNodeKind

```ts
type XNodeKind = "document" | "element" | "attribute" | "text" | "comment" | "pi";
```
