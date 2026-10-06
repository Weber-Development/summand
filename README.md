# Summand

Validate XRechnung, ZUGFeRD and Factur-X e-invoices against EN 16931 in TypeScript. Like the KoSIT validator, Summand checks the UBL or CII XML Schema first and then runs the official CEN and KoSIT Schematron rules with its own XPath 2.0 engine, in Node.js and in the browser. No Java, no service, no dependencies.

```bash
pnpm add @sweberdev/summand
```

```ts
import { validateInvoice } from "@sweberdev/summand";

const result = validateInvoice(await readFile("invoice.pdf")); // XML string, XML bytes or ZUGFeRD PDF

result.valid;            // false
result.profile?.label;   // "XRechnung 3.0"
result.errors[0];        // { id: "BR-CO-15", severity: "error", message: "…", location: "/Invoice/cac:LegalMonetaryTotal", line: 214 }
result.schemas[0]?.id;   // "ubl-2.1" (XML Schema checked first, errors have the id "SUM-XSD")
result.summary?.number;  // "RE-2026-0042"
```

```bash
npx @sweberdev/summand validate invoices/*.xml invoices/*.pdf
```

## Features

- Official rule sets: EN 16931 validation artefacts 1.3.16 (UBL and CII) and XRechnung Schematron 2.6.0 (XRechnung 3.0), with the severity levels of the KoSIT validator configuration
- XML Schema (XSD) validation against UBL 2.1 and UN/CEFACT CII D16B: unknown, missing, misplaced or repeated elements, attributes, dates and numbers (`SUM-XSD`, switch off with `schema: false`)
- UBL Invoice, UBL Credit Note and UN/CEFACT CII
- ZUGFeRD / Factur-X PDFs: embedded XML is found and validated, XMP profile compared
- Profiles: XRechnung (standard, extension, CVD), EN 16931, Factur-X BASIC, EXTENDED, BASIC WL, MINIMUM, Peppol BIS
- Rule id, severity, XPath and line for every message, plus an invoice summary
- Messages in English or German (`lang: "de"`, CLI `--lang de`) for every rule
- Leitweg-ID check digits
- CLI with JSON output and exit codes
- Schematron and XPath 2.0 engine usable for your own rules
- About 135 KB gzipped with all rule sets, schemas and both languages

## Conformance

Tested on every change with the CEN EN 16931 unit tests (1,142 expectations, all pass) and the KoSIT XRechnung test suite (all reference invoices valid against schema and rules). The schema validation was compared with Xerces (the XML Schema validator of the KoSIT validator) on the test material and on about 2,800 modified invoices, with the same verdict for every document.

## Docs

https://packages.sweber.dev/summand/docs · Demo: https://packages.sweber.dev/summand/demo

## Pro

Summand Pro reads invoices into typed objects, renders them as readable HTML with the validation report, and validates whole inboxes with reports, duplicate detection and an audit trail: https://packages.sweber.dev/summand

## Licence

MIT for Summand's code. The bundled rule sets and schemas keep their licences (EN 16931 artefacts: EUPL-1.2, XRechnung Schematron: Apache-2.0, UBL schemas: OASIS, CII schemas: UN/CEFACT), see [NOTICE.md](packages/core/NOTICE.md).
