# @sweberdev/summand

## CompiledRuleSet (type, beta)

```ts
interface CompiledRuleSet {
    id: string;
    title: string;
    namespaces: Array<[
        string,
        string
    ]>;
    lets: Array<[
        string,
        string
    ]>;
    functions: CompiledFunction[];
    patterns: CompiledPattern[];
}
```

## compileSchematron (value, beta)

```ts
function compileSchematron(source: string, options: {
    id: string;
    includes?: Record<string, string>;
}): CompiledRuleSet;
```

## decodeXml (value)

```ts
function decodeXml(bytes: Uint8Array): string;
```

## detect (value)

```ts
function detect(doc: XNode): Detection | DetectionError;
```

## Detection (type)

```ts
interface Detection {
    syntax: Syntax;
    profile: Profile;
}
```

## DetectionError (type)

```ts
type DetectionError = "not-an-invoice" | "zugferd-1";
```

## EmbeddedFile (type)

```ts
interface EmbeddedFile {
    name?: string;
    mimeType?: string;
    data: Uint8Array;
}
```

## extractInvoiceXml (value)

```ts
function extractInvoiceXml(bytes: Uint8Array): {
    xml: string;
    name?: string;
    info: PdfInfo;
} | undefined;
```

## Flag (type, beta)

```ts
type Flag = "fatal" | "error" | "warning" | "information";
```

## InvoiceInput (type)

```ts
type InvoiceInput = string | Uint8Array | ArrayBuffer;
```

## InvoiceSummary (type)

```ts
interface InvoiceSummary {
    number?: string;
    typeCode?: string;
    issueDate?: string;
    dueDate?: string;
    currency?: string;
    buyerReference?: string;
    orderReference?: string;
    seller: {
        name?: string;
        vatId?: string;
        country?: string;
    };
    buyer: {
        name?: string;
        vatId?: string;
        country?: string;
    };
    lineTotal?: string;
    taxExclusiveTotal?: string;
    taxTotal?: string;
    taxInclusiveTotal?: string;
    payableAmount?: string;
    lineCount: number;
}
```

## isPdf (value)

```ts
function isPdf(bytes: Uint8Array): boolean;
```

## isValidLeitwegId (value)

```ts
function isValidLeitwegId(value: string): boolean;
```

## leitwegCheckDigits (value)

```ts
function leitwegCheckDigits(coarse: string, fine?: string): string;
```

## LeitwegId (type)

```ts
interface LeitwegId {
    coarse: string;
    fine?: string;
    checkDigits: string;
}
```

## nodePath (value, beta)

```ts
function nodePath(n: XNode): string;
```

## parseLeitwegId (value)

```ts
function parseLeitwegId(value: string): LeitwegId | undefined;
```

## parseXml (value, beta)

```ts
function parseXml(source: string): XNode;
```

## PdfError (value)

```ts
class PdfError extends Error {
    constructor(message: string);
}
```

## PdfInfo (type)

```ts
interface PdfInfo {
    files: EmbeddedFile[];
    xmpConformanceLevel?: string;
    xmpDocumentFileName?: string;
    encrypted: boolean;
}
```

## Profile (type)

```ts
interface Profile {
    id: ProfileId;
    label: string;
    specificationId: string;
    en16931: boolean;
}
```

## profileFor (value)

```ts
function profileFor(specificationId: string): Profile;
```

## ProfileId (type)

```ts
type ProfileId = "xrechnung" | "xrechnung-extension" | "xrechnung-cvd" | "peppol-bis-billing-3" | "en16931" | "factur-x-basic" | "factur-x-extended" | "factur-x-basic-wl" | "factur-x-minimum" | "unknown";
```

## readPdf (value)

```ts
function readPdf(bytes: Uint8Array): PdfInfo;
```

## RULE_SETS (value)

```ts
const RULE_SETS: Record<RuleSetId, RuleSetInfo>;
```

## ruleSet (value, beta)

```ts
function ruleSet(id: RuleSetId): CompiledRuleSet;
```

## RuleSetId (type)

```ts
type RuleSetId = "en16931-ubl" | "en16931-cii" | "xrechnung-ubl" | "xrechnung-cii";
```

## ruleSetInfo (value)

```ts
function ruleSetInfo(): RuleSetInfo[];
function ruleSetInfo(id: RuleSetId): RuleSetInfo;
```

## RuleSetInfo (type)

```ts
interface RuleSetInfo {
    id: RuleSetId;
    name: string;
    version: string;
    release: string;
    publisher: string;
    source: string;
    license: string;
    rules: number;
}
```

## ruleSetsFor (value)

```ts
function ruleSetsFor(detection: Detection, options?: Pick<ValidateOptions, "xrechnung">): RuleSetId[];
```

## RunOptions (type, beta)

```ts
interface RunOptions {
    functions?: ReadonlyMap<string, XPathFunction>;
    variables?: ReadonlyMap<string, Sequence>;
    lang?: "en" | "de";
}
```

## runSchematron (value, beta)

```ts
function runSchematron(set: CompiledRuleSet, doc: XNode, options?: RunOptions): SchematronFinding[];
```

## SchemaFinding (type)

```ts
interface SchemaFinding {
    kind: SchemaFindingKind;
    message: string;
    location: string;
    line: number;
}
```

## SchemaFindingKind (type)

```ts
type SchemaFindingKind = "unexpected-element" | "missing-element" | "element-order" | "too-many" | "content" | "missing-attribute" | "unknown-attribute" | "attribute-value" | "value";
```

## SchemaId (type)

```ts
type SchemaId = "ubl-2.1" | "cii-d16b";
```

## SchemaInfo (type)

```ts
interface SchemaInfo {
    id: SchemaId;
    name: string;
    version: string;
    source: string;
    license: string;
}
```

## SchemaModel (type, beta)

```ts
interface SchemaModel {
    ns: string[];
    types: TypeDef[];
    elements: Record<string, number>;
    refs?: 1;
    roots: string[];
}
```

## SCHEMAS (value)

```ts
const SCHEMAS: Record<SchemaId, SchemaInfo>;
```

## SchematronFinding (type, beta)

```ts
interface SchematronFinding {
    id: string;
    flag: Flag;
    message: string;
    location: string;
    line: number;
    evaluationError?: string;
}
```

## Severity (type)

```ts
type Severity = "error" | "warning" | "info";
```

## stringValue (value, beta)

```ts
function stringValue(n: XNode): string;
```

## summarize (value)

```ts
function summarize(doc: XNode, syntax: Syntax): InvoiceSummary;
```

## Syntax (type)

```ts
type Syntax = "ubl-invoice" | "ubl-creditnote" | "cii";
```

## validateInvoice (value)

```ts
function validateInvoice(input: InvoiceInput, options?: ValidateOptions): ValidationResult;
```

## ValidateOptions (type)

```ts
interface ValidateOptions {
    ruleSets?: "auto" | RuleSetId[];
    xrechnung?: boolean;
    leitwegId?: boolean;
    schema?: boolean;
    includeXml?: boolean;
    extended?: "lenient" | "strict";
    lang?: "en" | "de";
}
```

## validateSchema (value)

```ts
function validateSchema(doc: XNode, schema: SchemaId | SchemaModel, options?: ValidateSchemaOptions): SchemaFinding[];
```

## ValidateSchemaOptions (type)

```ts
interface ValidateSchemaOptions {
    lang?: "en" | "de";
}
```

## ValidationMessage (type)

```ts
interface ValidationMessage {
    id: string;
    severity: Severity;
    message: string;
    location?: string;
    line?: number;
    ruleSet: RuleSetId | "summand";
    evaluationError?: string;
}
```

## ValidationResult (type)

```ts
interface ValidationResult {
    valid: boolean;
    syntax?: Syntax;
    profile?: Profile;
    source: {
        type: "xml" | "pdf";
        attachmentName?: string;
        pdfConformanceLevel?: string;
    };
    ruleSets: RuleSetInfo[];
    schemas: SchemaInfo[];
    errors: ValidationMessage[];
    warnings: ValidationMessage[];
    infos: ValidationMessage[];
    summary?: InvoiceSummary;
    xml?: string;
    durationMs: number;
}
```

## XmlError (value, beta)

```ts
class XmlError extends Error {
    readonly line: number;
    readonly column: number;
    constructor(message: string, line: number, column: number);
}
```

## XNode (type, beta)

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

# Types reachable from the exports above, not exported by name

## AnyParticle

```ts
interface AnyParticle {
    w: "skip" | "lax" | "strict";
    ns?: number[];
    not?: number[];
    n: number;
    x: number;
}
```

## Ast

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

## Atomic

```ts
type Atomic = string | boolean | number | Decimal | Untyped | XDate;
```

## AttributeDef

```ts
type AttributeDef = [
    name: string,
    type: number,
    required: 0 | 1,
    fixed?: string
];
```

## Axis

```ts
type Axis = "child" | "descendant" | "descendant-or-self" | "self" | "parent" | "ancestor" | "ancestor-or-self" | "following-sibling" | "preceding-sibling" | "following" | "preceding" | "attribute";
```

## BuiltinType

```ts
type BuiltinType = "anySimpleType" | "string" | "normalizedString" | "token" | "language" | "Name" | "NCName" | "NMTOKEN" | "ID" | "IDREF" | "QName" | "anyURI" | "boolean" | "decimal" | "integer" | "nonNegativeInteger" | "positiveInteger" | "nonPositiveInteger" | "negativeInteger" | "long" | "int" | "short" | "byte" | "unsignedLong" | "unsignedInt" | "unsignedShort" | "unsignedByte" | "double" | "float" | "date" | "time" | "dateTime" | "gYear" | "gYearMonth" | "gMonth" | "gMonthDay" | "gDay" | "duration" | "base64Binary" | "hexBinary";
```

## CompiledAssert

```ts
interface CompiledAssert {
    id: string;
    flag: Flag;
    test: string;
    report?: boolean;
    message: MessagePart[];
    messageDe?: MessagePart[];
}
```

## CompiledFunction

```ts
interface CompiledFunction {
    name: string;
    params: string[];
    vars: Array<[
        string,
        string
    ]>;
    select: string;
}
```

## CompiledPattern

```ts
interface CompiledPattern {
    id: string;
    lets: Array<[
        string,
        string
    ]>;
    rules: CompiledRule[];
}
```

## CompiledRule

```ts
interface CompiledRule {
    context: string;
    lets: Array<[
        string,
        string
    ]>;
    asserts: CompiledAssert[];
}
```

## ComplexTypeDef

```ts
interface ComplexTypeDef {
    k: "c";
    a?: AttributeDef[];
    s?: number;
    p?: Particle;
    mixed?: 1;
    any?: 1;
}
```

## Decimal

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

## ElementParticle

```ts
type ElementParticle = [
    name: string,
    type: number,
    min: number,
    max: number
];
```

## Env

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

## Facets

```ts
interface Facets {
    enumeration?: string[];
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
```

## GroupParticle

```ts
interface GroupParticle {
    g: "s" | "c" | "a";
    i: Particle[];
    n: number;
    x: number;
}
```

## Item

```ts
type Item = XNode | Atomic;
```

## MessagePart

```ts
type MessagePart = string | {
    name: true;
} | {
    select: string;
};
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

## Particle

```ts
type Particle = ElementParticle | GroupParticle | AnyParticle;
```

## Sequence

```ts
type Sequence = Item[];
```

## SequenceType

```ts
interface SequenceType {
    name: string;
    occurrence: "" | "?" | "*" | "+";
    empty?: boolean;
}
```

## SimpleTypeDef

```ts
interface SimpleTypeDef {
    k: "s";
    b: BuiltinType;
    f?: Facets;
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

## TypeDef

```ts
type TypeDef = SimpleTypeDef | ComplexTypeDef;
```

## Untyped

```ts
class Untyped {
    readonly value: string;
    constructor(value: string);
    toString(): string;
}
```

## XDate

```ts
class XDate {
    readonly type: "date" | "dateTime";
    readonly lexical: string;
    readonly key: string;
    constructor(type: "date" | "dateTime", lexical: string, key: string);
    toString(): string;
}
```

## XNodeKind

```ts
type XNodeKind = "document" | "element" | "attribute" | "text" | "comment" | "pi";
```

## XPathFunction

```ts
type XPathFunction = (env: Env, args: Sequence[]) => Sequence;
```
