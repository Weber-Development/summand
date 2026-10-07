---
title: Validating invoices
description: validateInvoice in detail - input types, options, the result object and how to show errors to people.
---

```ts
import { validateInvoice } from "@sweberdev/summand";

const result = validateInvoice(input, options);
```

## Input

| Input | Treated as |
|---|---|
| `string` | Invoice XML |
| `Uint8Array` or `ArrayBuffer` starting with `%PDF-` | ZUGFeRD / Factur-X PDF; the embedded XML is validated |
| other `Uint8Array` or `ArrayBuffer` | XML, decoded by its BOM or the `encoding` of the XML declaration (UTF-8 by default) |

`validateInvoice` is synchronous and never throws for bad input: malformed XML, a PDF without invoice, or a document that is not an invoice come back as an error in the result.

## Options

| Option | Default | Effect |
|---|---|---|
| `ruleSets` | `"auto"` | Rule sets to apply, e.g. `["en16931-ubl"]`. `"auto"` picks them from the syntax and profile, see [Profiles](profiles.md). |
| `xrechnung` | `false` | Apply the XRechnung rules even if the invoice does not declare XRechnung. Useful when you receive invoices as a German public buyer. |
| `extended` | `"lenient"` | ZUGFeRD / Factur-X EXTENDED: report EN 16931 violations as warnings (`"lenient"`) or as errors (`"strict"`). |
| `schema` | `true` | Check the XML Schema (UBL 2.1 or CII D16B) before the Schematron rules. Violations are errors with the id `SUM-XSD`. See [XML Schema](schema.md). |
| `leitwegId` | `true` | Warn when the buyer reference looks like a Leitweg-ID but has wrong check digits. |
| `includeXml` | `false` | Return the validated XML in `result.xml` (handy for PDFs). |
| `lang` | `"en"` | Language of the messages: `"en"` or `"de"`. German covers every EN 16931 rule and Summand's own checks; the XRechnung rules are German in the original. Rule ids, locations and lines are the same in both languages. |

## The result

| Field | Content |
|---|---|
| `valid` | `true` when `errors` is empty |
| `syntax` | `"ubl-invoice"`, `"ubl-creditnote"` or `"cii"` |
| `profile` | `id`, `label`, the specification identifier (BT-24) and whether the profile is EN 16931 compliant |
| `source` | `type` (`"xml"` or `"pdf"`), the name of the embedded file and the conformance level from the PDF metadata |
| `ruleSets` | Applied rule sets with the same data as `ruleSetInfo()`: name, version, release, publisher, source, licence and rule count, see [Rule sets and updates](rule-sets.md) |
| `schemas` | XML Schemas the invoice was checked against (`ubl-2.1` or `cii-d16b`), with name, version, source and licence; empty with `schema: false` |
| `errors`, `warnings`, `infos` | Messages, see below |
| `summary` | Invoice number, type, dates, currency, buyer reference, seller and buyer (name, VAT ID, country), totals and the number of lines |
| `durationMs` | Time taken |

Each message has:

| Field | Example |
|---|---|
| `id` | `"BR-CO-15"`, `"BR-DE-15"`, `"UBL-CR-646"`, `"SUM-PDF"` |
| `severity` | `"error"`, `"warning"` or `"info"` |
| `message` | The rule's text as published (EN 16931 rules in English, XRechnung rules in German) |
| `location` | XPath of the element, e.g. `/Invoice/cac:InvoiceLine[2]/cac:Price` |
| `line` | Line in the XML |
| `ruleSet` | `"en16931-ubl"`, `"xrechnung-cii"`, … or `"summand"` |
| `evaluationError` | Set when the rule could not be evaluated, e.g. an amount that is not a number. The rule then counts as failed. |

Rule ids starting with `SUM-` are Summand's own checks. Each is described with cause and fix in the [error code catalogue](../reference/error-codes.md):

| Id | Meaning |
|---|---|
| `SUM-XML` | The XML is not well-formed |
| `SUM-XSD` | The XML does not match the UBL or CII XML Schema (unexpected, missing, misplaced or repeated element, attribute, or value format) |
| `SUM-FORMAT` | Not a UBL or CII invoice, or ZUGFeRD 1.0 |
| `SUM-PDF` | The PDF cannot be read or has no embedded invoice |
| `SUM-PROFILE` | MINIMUM or BASIC WL (error), or an unknown specification identifier (warning) |
| `SUM-EXTENDED` | Info that EXTENDED violations were reported as warnings |
| `SUM-PDF-LEVEL` | The PDF metadata declares a different profile than the XML |
| `SUM-LEITWEG` | The buyer reference looks like a Leitweg-ID but its check digits are wrong |

## Exit codes on the command line

`summand validate` reports the verdict in its exit code: 0 when every invoice is valid, 1 when at least one is invalid, which includes input that is not an invoice (`SUM-FORMAT`, `SUM-XML`, `SUM-PDF`), and 2 when the command could not run, for example because a file does not exist. See [CLI](cli.md#exit-codes).

## Showing errors to people

Rule texts are written for developers. For an upload form, a short summary and the first few messages usually work best:

```ts
const result = validateInvoice(bytes);
if (!result.valid) {
  return {
    title: `This ${result.profile?.label ?? "file"} is not a valid e-invoice`,
    details: result.errors.slice(0, 5).map((e) => `${e.id}: ${e.message}`),
  };
}
```

[Summand Pro](../pro/overview.md) renders the invoice and the report as a readable HTML page.

## Errors in rules and the engine

Schema errors and Schematron errors are reported together: like the KoSIT validator, Summand keeps running the rules when the schema check fails, so you see every problem at once. The schema errors come first in `errors`.

If a rule fires where you think it should not, compare with the KoSIT validator and open an issue with the invoice (anonymised). The bundled rule sets are listed in [Rule sets](../reference/rule-sets.md).
