---
title: ZUGFeRD and Factur-X PDFs
description: How Summand finds the invoice XML in a hybrid PDF and what it checks about the PDF.
---

A ZUGFeRD or Factur-X invoice is a PDF/A-3 with the invoice XML attached as a file, usually `factur-x.xml` (ZUGFeRD 2.1 and later) or `zugferd-invoice.xml` (ZUGFeRD 2.0). For the legal invoice, the XML counts, not the picture.

Pass the PDF bytes to `validateInvoice` and Summand validates the embedded XML:

```ts
const result = validateInvoice(await readFile("invoice.pdf"));
result.source; // { type: "pdf", attachmentName: "factur-x.xml", pdfConformanceLevel: "EN 16931" }
```

## Extracting the XML

```ts
import { extractInvoiceXml, readPdf } from "@sweberdev/summand";

const found = extractInvoiceXml(bytes);
found?.xml;  // the invoice XML
found?.name; // "factur-x.xml"

readPdf(bytes).files; // all embedded files with name, MIME type and data
```

Summand looks at all embedded files and takes the one with a known invoice file name, otherwise the first one that is a UBL or CII invoice. Compressed object streams and cross-reference streams are supported.

## What is checked about the PDF

- Whether it contains an invoice at all (`SUM-PDF` if not: a plain PDF is not an e-invoice).
- Whether the profile in the XMP metadata (`fx:ConformanceLevel`) matches the XML (`SUM-PDF-LEVEL` warning).
- Encrypted PDFs are not supported.

PDF/A-3 conformance itself (fonts, colour profiles, metadata schema) is not checked. Use veraPDF for that if you create PDFs.
