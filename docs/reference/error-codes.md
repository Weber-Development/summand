---
title: Error codes
description: Every SUM- code Summand reports, with severity, meaning, cause and fix, plus the exit codes of the summand command.
---

Every message of a validation has an `id`. Ids that look like `BR-CO-10`, `BR-DE-15` or `UBL-CR-646` are rules of the bundled rule sets, see [Rule sets](rule-sets.md). Ids that start with `SUM-` are Summand's own checks and are listed here. They are part of the [stable API](../guides/migration-1.0.md#stability-policy): a code is never renamed or reused for something else within a major version, and new codes only appear in minor releases.

The same codes are reported in English and German (`lang: "de"`); only the `message` text changes. Match on `id`, never on the text.

| Code | Severity | Raised when |
|---|---|---|
| [`SUM-XML`](#sum-xml) | error | The XML is not well-formed |
| [`SUM-FORMAT`](#sum-format) | error | Not a UBL or CII invoice, or ZUGFeRD 1.0 |
| [`SUM-PDF`](#sum-pdf) | error | The PDF cannot be read or has no embedded invoice |
| [`SUM-XSD`](#sum-xsd) | error | The XML does not match the UBL or CII XML Schema |
| [`SUM-PROFILE`](#sum-profile) | error or warning | MINIMUM or BASIC WL profile (error), unknown or missing specification identifier (warning) |
| [`SUM-EXTENDED`](#sum-extended) | info | EXTENDED violations were reported as warnings |
| [`SUM-LEITWEG`](#sum-leitweg) | warning | The Leitweg-ID has wrong check digits |
| [`SUM-PDF-LEVEL`](#sum-pdf-level) | warning | The PDF metadata declares a different profile than the XML |
| [`SUM-RULESET`](#sum-ruleset) | error | `ruleSets` names a rule set or version that is not bundled |
| [`SUM-DEPRECATED`](#sum-deprecated) | info | A deprecated option was used |
| [`SUM-BATCH`](#sum-batch) | error | `validateMany` could not process an input (not a verdict about the invoice) |

When validation stops early (`SUM-XML`, `SUM-FORMAT`, `SUM-PDF`, `SUM-RULESET`), the result has that one error and no `syntax`, `profile`, `summary` or `schemas`. `SUM-RULESET` does not depend on the document: it is reported for every input, before the document is read.

### SUM-XML

Severity: error. Fields: `line` of the problem; no `location`. Validation stops.

**Meaning.** The input is not well-formed XML, so nothing else can be checked.

**Causes.** A truncated or corrupted file; an unescaped `&` or `<` in text; a tag that is not closed or closed in the wrong order; more than one root element; text before the XML declaration; a file saved in an encoding other than the one the declaration states. A PDF handed over as a string (not as bytes) also ends up here, because strings are always treated as XML.

**Fix.** Open the file at the reported `line`. Escape `&` as `&amp;`, close every tag, and make the `encoding` of the XML declaration match the file. Pass PDFs as `Uint8Array` or `ArrayBuffer`, not as text.

### SUM-FORMAT

Severity: error. No `line`, no `location`. Validation stops.

**Meaning.** The XML is well-formed but is not an invoice Summand can validate: the root element is none of UBL `Invoice`, UBL `CreditNote` or UN/CEFACT `CrossIndustryInvoice` (in the right namespace), or it is ZUGFeRD 1.0 (`urn:ferd:CrossIndustryDocument:invoice:1p0`), which is not supported and does not comply with EN 16931.

**Causes.** Another document type (order, despatch advice, application response), an XML wrapper around the invoice, a wrong or missing namespace, or an invoice in the ZUGFeRD 1.0 format.

**Fix.** Pass the invoice document itself. For UBL use the `Invoice-2` or `CreditNote-2` namespace, for CII the `CrossIndustryInvoice:100` namespace. Re-issue ZUGFeRD 1.0 invoices as ZUGFeRD 2.x / Factur-X or XRechnung.

### SUM-PDF

Severity: error. No `line`, no `location`. Validation stops.

**Meaning.** The bytes are a PDF, but no invoice XML could be taken from it: it contains no embedded invoice XML (the usual case), or the PDF could not be read at all.

**Causes.** A plain PDF that is a rendering of an invoice only; a PDF/A-3 without the associated file; an encrypted PDF or one whose embedded file uses a stream encoding Summand does not read (`readPdf().encrypted` tells the first); a damaged file.

**Fix.** Create the PDF with an e-invoice tool that embeds the XML as `factur-x.xml` (or `zugferd-invoice.xml`, `xrechnung.xml`), or send the XML itself. Check with `summand extract invoice.pdf`.

### SUM-XSD

Severity: error. Fields: `location` (XPath) and `line`. Validation continues, so the Schematron rules run as well and schema errors come first in `errors`.

**Meaning.** The XML does not match the XML Schema of its syntax (OASIS UBL 2.1, or UN/CEFACT CII D16B). The message names the element or attribute. The kind of violation is one of `SchemaFindingKind` (visible with `validateSchema`):

| Kind | Meaning |
|---|---|
| `unexpected-element` | An element that is not allowed at this place (also an undeclared root element) |
| `missing-element` | A required element is missing |
| `element-order` | Elements are in the wrong order |
| `too-many` | An element occurs more often than allowed |
| `content` | Text or child elements where the type allows none, or the reverse |
| `missing-attribute` | A required attribute is missing |
| `unknown-attribute` | An attribute that is not declared |
| `attribute-value` | An attribute value is invalid or differs from the fixed value |
| `value` | The text does not match its type or facets (date, decimal, length, pattern, code) |

**Causes.** Elements in the wrong order (the schemas are strict about sequence), a date that is not `YYYY-MM-DD`, an amount with a thousands separator or comma, a missing `currencyID`, an element from another syntax, or a text value that is too long.

**Fix.** Correct the element at `location`. Fix order and format problems first; many Schematron errors are follow-on effects of a broken structure. Do not switch the schema check off to hide them (`schema: false` / `--no-schema`): the KoSIT validator reports them too.

### SUM-PROFILE

Severity: error (MINIMUM, BASIC WL) or warning (unknown or missing identifier). No `line`, no `location`.

**Meaning, error.** The invoice declares the ZUGFeRD / Factur-X MINIMUM or BASIC WL profile. They omit information EN 16931 requires (for example invoice lines), so they are not e-invoices under EN 16931 and, in Germany, not under § 14 UStG. No rule sets run for them in `"auto"` mode.

**Meaning, warning.** The specification identifier (BT-24) is missing or not one Summand knows. The invoice is validated against EN 16931 only, so XRechnung-specific rules (`BR-DE-*`) are not applied.

**Causes.** An invoice created with a reduced profile, an invoice generator that does not write BT-24, or a typo in the identifier.

**Fix.** Issue the invoice in the EN 16931 (COMFORT), BASIC, EXTENDED or XRechnung profile. For the warning, set BT-24 (`cbc:CustomizationID` in UBL, `ram:GuidelineSpecifiedDocumentContextParameter/ram:ID` in CII) to the identifier of the profile you intend, for example `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`. To apply the XRechnung rules to an invoice that does not declare XRechnung, use `ruleSets: ["en16931", "xrechnung"]` / `--rule-sets en16931,xrechnung`. See [Profiles](../guides/profiles.md).

### SUM-EXTENDED

Severity: info. No `line`, no `location`.

**Meaning.** The invoice is ZUGFeRD / Factur-X EXTENDED, which may contain information beyond EN 16931. In the default `extended: "lenient"` mode, violations of EN 16931 rules are reported as warnings instead of errors, and this message tells you so. It is not a problem with the invoice.

**Fix.** Nothing to fix. To treat EN 16931 violations as errors, use `extended: "strict"` / `--strict-extended`; the info is then not reported.

### SUM-LEITWEG

Severity: warning. No `line`, no `location`. Only reported when the option `leitwegId` is not `false` (CLI: without `--no-leitweg`).

**Meaning.** The buyer reference (BT-10) has the shape of a Leitweg-ID (for example `04011000-1234512345-06`) but its two check digits are wrong. German public buyers reject invoices with an unknown Leitweg-ID.

**Causes.** A typo, a Leitweg-ID copied without its check digits, or a made-up value in a test invoice.

**Fix.** Use the Leitweg-ID the buyer published, exactly. `summand leitweg <id>` prints the correct check digits for the address part. If BT-10 is a purchase order number that merely looks like a Leitweg-ID, set `leitwegId: false`.

### SUM-PDF-LEVEL

Severity: warning. No `line`, no `location`.

**Meaning.** The conformance level in the PDF's XMP metadata (for example `EN 16931`) differs from the profile of the embedded XML (for example BASIC). Readers that trust the metadata will treat the invoice differently than the XML says.

**Causes.** The XML was replaced or regenerated without updating the PDF metadata, or the metadata was written for another profile.

**Fix.** Regenerate the PDF so the XMP `ConformanceLevel` matches the profile in the XML (BT-24).

### SUM-RULESET

Severity: error. No `line`, no `location`. Validation stops before the document is read.

**Meaning.** An entry of the `ruleSets` option (CLI: `--rule-sets`) is not a bundled rule set, or names a version that is not bundled. The message lists what is known. No rule set ran, so the result says nothing about the invoice.

**Causes.** A typo ("xrechung"), a version that was never bundled or was removed ("xrechnung@2.4.0"), a version of another rule set ("en16931@2.6.0"), an empty version ("xrechnung@"), or a config file written for a newer Summand version than the installed one.

**Fix.** Use `en16931` or `xrechnung`, optionally with `@` and one of the versions `ruleSetInfo({ versions: "all" })` (CLI: `summand rules`) lists. See [Rule sets and versions](../guides/rule-sets.md#selecting-rule-sets-and-versions). The CLI treats the same mistake as a usage error (exit code 2) before it reads any file.

### SUM-DEPRECATED

Severity: info. No `line`, no `location`. Validation is not affected.

**Meaning.** You used an option that is deprecated and will be removed in 2.0.0. The message names the replacement. Today this is the boolean option `xrechnung`, replaced by `ruleSets`. The result is the same as without the note; it is an info, so it neither makes an invoice invalid nor turns into an exit code with `--warnings-as-errors`. The library prints nothing to the console; the note is in `result.infos`.

**Causes.** `validateInvoice(xml, { xrechnung: true })` or `{ xrechnung: false }`, or the CLI flag `--xrechnung` (the flag also prints one line to stderr).

**Fix.** Replace `xrechnung: true` with `ruleSets: ["en16931", "xrechnung"]` and drop `xrechnung: false` (the default is `ruleSets: "auto"`); replace `--xrechnung` with `--rule-sets en16931,xrechnung`. See [What changed in 1.1.0](../guides/migration-1.0.md#what-changed-in-110).

### SUM-BATCH

Severity: error. Appears as `BatchResult.error` (`{ code, message }`), not inside a `ValidationResult`, because there is no result.

**Meaning.** `validateMany` could not process one input: the file could not be read, the input could not be sent to the worker thread, or the worker thread failed. This is different from an invalid invoice, which is a normal result with `valid: false`. The other inputs of the batch are not affected.

**Causes.** A path that does not exist or is a directory, no permission, a `data` value that is not text or bytes, a worker that ran out of memory or exited, or a batch that was stopped.

**Fix.** Read `error.message` (it carries the operating system error for files). Check paths and permissions. For very large invoices, validate them with `concurrency: 1` or a smaller batch. A failed input never stops the batch; collect the entries with `error` and report them like the CLI does for unreadable files (exit code 2).

## The evaluationError field

A message from a rule set can have `evaluationError`: the rule could not be evaluated, for example because an amount is not a number. The rule then counts as failed. This is not a `SUM-` code. Usually a `SUM-XSD` error for the same element tells you what is wrong.

## Exit codes of the summand command

| Code | Meaning |
|---|---|
| 0 | Success. Every invoice given to `validate` is valid (warnings do not count unless `--warnings-as-errors`), or the command did what was asked (`extract`, `leitweg`, `rules`, `--help`, `--version`). `rules --check` without `--fail-on-outdated` also exits 0 when newer releases exist or the sources cannot be reached. |
| 1 | Findings. At least one invoice is invalid, or has warnings with `--warnings-as-errors`; this includes input that is not an invoice at all (`SUM-FORMAT`, `SUM-XML`). Also `leitweg` with an invalid ID. |
| 2 | The command could not run: unknown command or flag, missing arguments, a file that cannot be read, `extract` on a file that is not a PDF or has no embedded XML, no command at all (help is printed), or an internal failure. No verdict was produced for the files that were not read. |
| 3 | `summand rules --check --fail-on-outdated` found a newer upstream release of a bundled rule set. |

The split is the same as in ESLint: 1 means the check ran and found problems, 2 means it could not run. With several files, `validate` still validates the readable ones when one path fails; the exit code is then 2, even if another file was invalid. A script that only needs pass or fail can test for non-zero; to tell the two apart, test for 1 and 2, or use `--json` and read `valid`.

With `--json`, `validate` prints one line per file: the object `{ "file": "<path>", ...ValidationResult }`. The fields are part of the stable API.
