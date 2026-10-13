# Summand

Validate XRechnung, ZUGFeRD and Factur-X e-invoices against EN 16931 in TypeScript. Like the KoSIT validator, Summand checks the UBL or CII XML Schema first and then runs the official CEN and KoSIT Schematron rules with its own XPath 2.0 engine, in Node.js and in the browser. No Java, no service, no dependencies.

```bash
pnpm add @sweberdev/summand   # Node.js 22 or newer
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
- Choose rule sets and versions with `ruleSets: ["en16931", "xrechnung@2.5.0"]` (CLI `--rule-sets`); XRechnung Schematron 2.5.0 is bundled next to 2.6.0
- `summand rules` lists the bundled rule sets with version, source, licence and rule count; `summand rules --check` asks whether newer releases exist (downloads nothing)
- Large invoices: 1,000 lines validate in under a second in Node on our test machine (see the performance guide for numbers and method)
- `validateMany` (`@sweberdev/summand/batch`, Node.js): validate folders of invoices with a bounded pool of worker threads, results streamed in input order
- XML Schema (XSD) validation against UBL 2.1 and UN/CEFACT CII D16B: unknown, missing, misplaced or repeated elements, attributes, dates and numbers (`SUM-XSD`, switch off with `schema: false`)
- UBL Invoice, UBL Credit Note and UN/CEFACT CII
- ZUGFeRD / Factur-X PDFs: embedded XML is found and validated, XMP profile compared
- Profiles: XRechnung (standard, extension, CVD), EN 16931, Factur-X BASIC, EXTENDED, BASIC WL, MINIMUM, Peppol BIS (recognised; the Peppol and Factur-X EXTENDED Schematron rules are not included, those invoices are checked against EN 16931)
- A stable `id` (rule id such as `BR-DE-15`, or a `SUM-` code), `severity` and `ruleSet` for every message, plus XPath, line and an invoice summary
- Messages in English or German (`lang: "de"`, CLI `--lang de`) for every rule
- Leitweg-ID check digits
- CLI with JSON output and ESLint-style exit codes (0 valid, 1 invalid, 2 error running the command)
- Schematron and XPath 2.0 engine usable for your own rules
- About 137 KB gzipped with all rule sets, schemas and both languages

## Conformance

Tested on every change with the CEN EN 16931 unit tests (1,142 expectations, all pass) and the KoSIT XRechnung test suite (all reference invoices valid against schema and rules). The schema validation was compared with Xerces (the XML Schema validator of the KoSIT validator) on the test material and on about 2,800 modified invoices, with the same verdict for every document.

## Upgrading from 1.x

2.0.0 removes the deprecated `xrechnung` option and `--xrechnung` flag (use `ruleSets` / `--rule-sets`), the `CheckOptions` alias and `SUM-DEPRECATED`, and requires Node.js 22. See [Migrating to 2.0](https://github.com/Weber-Development/summand/blob/main/docs/guides/migration-2.0.md).

## Docs

https://packages.sweber.dev/summand/docs · Demo: https://packages.sweber.dev/summand/demo

## Pro

Summand Pro builds on this validator for teams that process invoices every day: read any invoice into a typed object, write XRechnung and ZUGFeRD in all profiles, validate and watch whole inboxes, an approval workflow and a tamper-evident archive (beta), webhooks and mail notifications (beta), and a validation service you run as a Docker container with a REST API for stacks that are not Node.js. Details and prices: https://packages.sweber.dev/summand

## Licence

MIT for Summand's code. The bundled rule sets and schemas keep their licences (EN 16931 artefacts: EUPL-1.2, XRechnung Schematron: Apache-2.0, UBL schemas: OASIS, CII schemas: UN/CEFACT), see [NOTICE.md](NOTICE.md).

<!-- pro-promo -->
## Summand Pro

Need more than the free package? **Summand Pro** adds:

- Read: XRechnung, ZUGFeRD and Factur-X into one typed Invoice object
- Write: generate valid XRechnung and ZUGFeRD / Factur-X in all profiles, credit notes, partial and final invoices, checked before it returns
- View, inbox and match: readable HTML / PDF, mailbox watching with DATEV export, approval workflow and archive, purchase-order matching
- Validation service: a Docker image with a REST API, for PHP, Java, .NET, Python and every other stack

Subscriptions from CHF 19 per month, or a one-time lifetime licence. [See what is included](https://packages.sweber.dev/summand?utm_source=npm&utm_medium=readme&utm_campaign=pro)
