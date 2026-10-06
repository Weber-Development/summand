---
title: Introduction
description: What Summand is, which e-invoices it checks, how close it is to the official validator, and what it does not do.
---

Summand checks incoming e-invoices in TypeScript. It reads XRechnung, ZUGFeRD and Factur-X invoices, as UBL or UN/CEFACT CII XML or as a PDF with the XML embedded, and validates them against EN 16931 and the German XRechnung rules. It runs in Node.js, in serverless functions and in the browser. No Java, no external service, nothing leaves your machine.

Since 1 January 2025 every business in Germany has to be able to receive e-invoices, and creating them is a solved problem (libraries such as node-zugferd do it well). Checking what arrives is not: the reference validator of KoSIT is a Java application with Xerces, Saxon and XSLT. Summand brings the same checks to JavaScript: the XML Schema first, then the Schematron rules.

## What you get

- **The official rules, not a re-implementation.** Summand ships the Schematron rules published by CEN/TC 434 (EN 16931 validation artefacts 1.3.16) and by KoSIT (XRechnung Schematron 2.6.0 for XRechnung 3.0) and runs them with its own XPath 2.0 and Schematron engine.
- **XML Schema validation**: the document is checked against the official UBL 2.1 or UN/CEFACT CII D16B schema first, as the KoSIT validator does. Misspelt, missing, misplaced or repeated elements, unknown attributes and malformed dates or numbers are reported with the id `SUM-XSD`. See [XML Schema](guides/schema.md).
- **UBL and CII**: UBL 2.1 Invoice and CreditNote, UN/CEFACT Cross Industry Invoice D16B.
- **PDF**: extracts `factur-x.xml`, `zugferd-invoice.xml` or `xrechnung.xml` from a ZUGFeRD / Factur-X PDF and compares the profile with the PDF's XMP metadata.
- **Profiles**: recognises XRechnung 3.0 (standard, extension, CVD), EN 16931, Factur-X BASIC, EXTENDED, BASIC WL and MINIMUM, Peppol BIS Billing 3.0, and picks the right rules. The severity changes of the KoSIT configuration for XRechnung are applied as well.
- **Clear results**: every message has the rule id (`BR-CO-10`, `BR-DE-15`), the severity, the XPath and the line in the XML, plus a summary of the invoice (number, date, parties, totals).
- **Leitweg-ID check** for invoices to German public buyers.
- **CLI** for scripts and CI: `summand validate invoices/*.pdf`.
- **No dependencies.** About 115 KB gzipped including all rule sets and schemas.

## How close is it to the official validator?

The test suite runs the official test material on every change:

| Test material | Result |
|---|---|
| CEN EN 16931 unit tests (1,142 expectations for UBL Invoice, UBL Credit Note and CII) | all pass |
| KoSIT XRechnung test suite (reference invoices, UBL and CII, standard, extension, CVD) | all valid (schema and rules) |
| XML Schema check compared with Xerces (the schema validator the KoSIT validator uses) on the test material and about 2,800 modified invoices | same verdict for every document |
| CEN example invoices (UBL and CII) | all valid |

## What Summand does not do

Be clear about this when you build on it:

- **Signatures and extension content.** The content of UBL extensions (`ext:ExtensionContent`) is validated laxly, as the schema says, but the UBL signature schemas are not bundled, so a `sig:UBLDocumentSignatures` block is not checked. See [XML Schema](guides/schema.md) for the details.
- **Not the reference implementation.** For disputes, the KoSIT validator with the official configuration is authoritative. Summand aims to give the same result and is tested against the same material, but it is not certified.
- **No Peppol BIS rules** (PEPPOL-EN16931-R…) and no dedicated Factur-X EXTENDED rules yet. EXTENDED invoices are checked against EN 16931, with violations reported as warnings by default.
- **No PDF/A check.** Summand reads the embedded XML; whether the PDF itself is valid PDF/A-3 is not checked.
- **No legal advice.** A valid invoice under EN 16931 can still be wrong in content (wrong VAT rate, wrong buyer).

## Pro

[Summand Pro](pro/overview.md) adds a readable invoice view with the validation report for inboxes and accounting, and batch validation with reports, duplicate detection and an audit trail.
