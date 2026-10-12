---
title: In the browser
description: Validate uploads on the client before they reach your server, without sending invoices anywhere.
---

Summand has no Node-specific code in its main entry point. It works in every modern browser, in Web Workers, in Deno, Bun and edge runtimes.

```tsx
import { validateInvoice } from "@sweberdev/summand";

async function onFile(file: File) {
  const result = validateInvoice(await file.arrayBuffer());
  setResult(result);
}
```

The invoice never leaves the browser, which helps when you would rather not store invoices before they are accepted.

## Size and speed

All rule sets (including the older XRechnung release you can select) and the UBL and CII schemas are bundled as JSON: about 150 KB gzipped in total, with the messages in English and German. A typical invoice validates in 20 to 60 ms (the schema check takes under a millisecond of that); large invoices with hundreds of lines take longer. For big files, run it in a Web Worker so the page stays responsive:

```ts
// worker.ts
import { validateInvoice } from "@sweberdev/summand";
self.onmessage = (e: MessageEvent<ArrayBuffer>) => self.postMessage(validateInvoice(e.data));
```

Validating many files at once with a worker pool (`@sweberdev/summand/batch`) is Node.js only, it uses `worker_threads`. In the browser, call `validateInvoice` per file, in one Web Worker as above or in a few of them; see [Validating many invoices](batch.md#in-the-browser).

The [live demo](https://packages.sweber.dev/summand/demo) runs exactly this in the browser.
