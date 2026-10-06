---
title: Getting started
description: Install Summand and validate your first XRechnung or ZUGFeRD invoice.
---

## Install

```bash
pnpm add @sweberdev/summand
# or: npm install @sweberdev/summand
```

Node.js 20 or newer, or any modern browser. There are no runtime dependencies.

## Validate an invoice

`validateInvoice` takes the XML as a string, or the file as bytes (`Uint8Array` or `ArrayBuffer`). Bytes can be XML or a ZUGFeRD / Factur-X PDF.

```ts
import { readFile } from "node:fs/promises";
import { validateInvoice } from "@sweberdev/summand";

const result = validateInvoice(await readFile("invoice.pdf"));

if (result.valid) {
  console.log(`${result.profile?.label}: invoice ${result.summary?.number} is valid`);
} else {
  for (const e of result.errors) {
    console.log(`${e.id} (line ${e.line}): ${e.message}`);
  }
}
```

A result looks like this:

```json
{
  "valid": false,
  "syntax": "cii",
  "profile": { "id": "xrechnung", "label": "XRechnung 3.0", "en16931": true },
  "source": { "type": "pdf", "attachmentName": "factur-x.xml", "pdfConformanceLevel": "XRECHNUNG" },
  "ruleSets": [{ "id": "en16931-cii", "version": "1.3.16" }, { "id": "xrechnung-cii", "version": "2.6.0" }],
  "schemas": [{ "id": "cii-d16b", "version": "100.D16B" }],
  "errors": [
    {
      "id": "BR-DE-15",
      "severity": "error",
      "message": "Das Element \"Buyer reference\" (BT-10) muss übermittelt werden.",
      "location": "/rsm:CrossIndustryInvoice",
      "line": 2,
      "ruleSet": "xrechnung-cii"
    }
  ],
  "warnings": [],
  "infos": [],
  "summary": { "number": "RE-2026-0042", "issueDate": "2026-10-05", "currency": "EUR", "payableAmount": "336.90", "lineCount": 2 }
}
```

`valid` is `true` when there are no errors. Warnings (for example "should" rules of EN 16931) do not make an invoice invalid.

## From the command line

```bash
npx @sweberdev/summand validate invoices/*.xml invoices/*.pdf
```

See [CLI](guides/cli.md).

## Next steps

- [Validating invoices](guides/validate.md): options and the result in detail
- [Profiles and rule sets](guides/profiles.md): which rules run for XRechnung, ZUGFeRD and Factur-X
- [In the browser](guides/browser.md): check uploads before they reach your server
