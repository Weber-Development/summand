# @sweberdev/summand/batch

## BatchError (type)

```ts
interface BatchError {
    code: "SUM-BATCH";
    message: string;
}
```

## BatchInput (type)

```ts
type BatchInput = string | {
    name: string;
    data: InvoiceInput;
};
```

## BatchResult (type)

```ts
interface BatchResult {
    index: number;
    name: string;
    result?: ValidationResult;
    error?: BatchError;
}
```

## BatchRun (type)

```ts
interface BatchRun extends AsyncIterable<BatchResult> {
    toArray(): Promise<BatchResult[]>;
}
```

## validateMany (value)

```ts
function validateMany(inputs: Iterable<BatchInput> | AsyncIterable<BatchInput>, options?: ValidateManyOptions): BatchRun;
```

## ValidateManyOptions (type)

```ts
interface ValidateManyOptions extends ValidateOptions {
    concurrency?: number;
    signal?: AbortSignal;
}
```

# Types reachable from the exports above, not exported by name

## InvoiceInput

```ts
type InvoiceInput = string | Uint8Array | ArrayBuffer;
```

## InvoiceSummary

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

## Profile

```ts
interface Profile {
    id: ProfileId;
    label: string;
    specificationId: string;
    en16931: boolean;
}
```

## ProfileId

```ts
type ProfileId = "xrechnung" | "xrechnung-extension" | "xrechnung-cvd" | "peppol-bis-billing-3" | "en16931" | "factur-x-basic" | "factur-x-extended" | "factur-x-basic-wl" | "factur-x-minimum" | "unknown";
```

## RuleSetFamily

```ts
type RuleSetFamily = "en16931" | "xrechnung";
```

## RuleSetId

```ts
type RuleSetId = "en16931-ubl" | "en16931-cii" | "xrechnung-ubl" | "xrechnung-cii";
```

## RuleSetInfo

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

## RuleSetSelector

```ts
type RuleSetSelector = RuleSetFamily | RuleSetId | `${RuleSetFamily | RuleSetId}@${string}`;
```

## SchemaId

```ts
type SchemaId = "ubl-2.1" | "cii-d16b";
```

## SchemaInfo

```ts
interface SchemaInfo {
    id: SchemaId;
    name: string;
    version: string;
    source: string;
    license: string;
}
```

## Severity

```ts
type Severity = "error" | "warning" | "info";
```

## Syntax

```ts
type Syntax = "ubl-invoice" | "ubl-creditnote" | "cii";
```

## ValidateOptions

```ts
interface ValidateOptions {
    ruleSets?: "auto" | RuleSetSelector[];
    leitwegId?: boolean;
    schema?: boolean;
    includeXml?: boolean;
    extended?: "lenient" | "strict";
    lang?: "en" | "de";
}
```

## ValidationMessage

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

## ValidationResult

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
