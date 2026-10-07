# @sweberdev/summand/rules-check

## CheckOptions (type, deprecated)

```ts
type CheckOptions = RuleSetCheckOptions;
```

## checkRuleSets (value)

```ts
function checkRuleSets(options?: RuleSetCheckOptions): Promise<RuleSetCheck[]>;
```

## FetchLike (type)

```ts
type FetchLike = (url: string, init?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}>;
```

## RuleSetCheck (type)

```ts
interface RuleSetCheck {
    id: RuleSetId;
    version: string;
    status: RuleSetCheckStatus;
    latest?: string;
    reason?: string;
}
```

## RuleSetCheckOptions (type)

```ts
interface RuleSetCheckOptions {
    fetch?: FetchLike;
    timeoutMs?: number;
    token?: string;
}
```

## RuleSetCheckStatus (type)

```ts
type RuleSetCheckStatus = "up-to-date" | "outdated" | "unknown";
```

# Types reachable from the exports above, not exported by name

## RuleSetId

```ts
type RuleSetId = "en16931-ubl" | "en16931-cii" | "xrechnung-ubl" | "xrechnung-cii";
```
