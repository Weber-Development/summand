# @sweberdev/summand/cli

## CliIo (type)

```ts
interface CliIo {
    out: (line: string) => void;
    err: (line: string) => void;
}
```

## runCli (value)

```ts
function runCli(argv: string[], io?: CliIo, options?: {
    fetch?: FetchLike;
}): Promise<number>;
```

# Types reachable from the exports above, not exported by name

## FetchLike

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
