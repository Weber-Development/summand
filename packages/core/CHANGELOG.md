# @sweberdev/summand

## 1.0.0

### Major Changes

- 53fa5bc: Summand 1.0.0 is the first stable release.

  **Breaking: the `summand` command now uses ESLint-style exit codes.** Exit code 1 used to mean both "an invoice is invalid" and "the command could not run". Now:

  - `0`: every invoice is valid, or the command did what was asked.
  - `1`: an invoice is invalid (also warnings with `--warnings-as-errors`, and input that is not an invoice at all).
  - `2`: the command could not run: unknown command or flag, missing arguments, a file that cannot be read, `extract` on a file without embedded XML.
  - `3`: unchanged, `rules --check --fail-on-outdated` found a newer rule set release.

  Scripts that only test for "not 0" keep working. Scripts that test for exactly `1` to detect invalid invoices no longer treat a mistyped path as an invalid invoice; handle `2` explicitly, see the [migration guide](https://github.com/Weber-Development/summand/blob/main/docs/guides/migration-1.0.md). `summand validate` also keeps validating the remaining files when one file cannot be read (exit code 2). `--json` output is unchanged.

  **1.0 promises a stable API.** From 1.0.0 the package follows Semantic Versioning as described in the stability policy: exports, the `ValidationResult` shape, `SUM-` codes, the CLI flags and exit codes and the package entry points change only in a major release, deprecations stay for the rest of the major version, and rule set updates ship as minor releases with a documented list of verdict changes. The advanced exports marked `@beta` (compiled rule and schema formats, XML node tree, `@sweberdev/summand/xpath`) are excluded and may change in a minor release.

## 0.9.0

### Minor Changes

- 0dbd3c6: Release candidate for 1.0: the API is reviewed, documented and now guarded by tests. From 1.0.0 the package follows Semantic Versioning, and 0.9 is the API 1.0.0 will have. Nothing was removed or changed in behaviour, so upgrading from 0.4 needs no code changes.

  - **Error code catalogue.** Every `SUM-` code (`SUM-XML`, `SUM-FORMAT`, `SUM-PDF`, `SUM-XSD`, `SUM-PROFILE`, `SUM-EXTENDED`, `SUM-LEITWEG`, `SUM-PDF-LEVEL`) is documented with severity, meaning, cause and fix, together with the exit codes of the CLI (0, 1 and 3): new page "Error codes" in the reference. A test fails when the package can emit a code that is not in the catalogue.
  - **Stability policy and migration notes.** The new guide "Migration and stability" explains what SemVer covers from 1.0 (exports, result shapes, `--json` output, `SUM-` codes, commands, flags and exit codes), what it does not (advanced exports, message wording, message order), how deprecations work, and how rule set updates are released: always as a minor version, with the old and new versions and the verdict changes we know of in the changelog. It also lists what changed from 0.1 to 0.9.
  - **Advanced API marked.** The compiled rule and schema formats (`compileSchematron`, `runSchematron`, `ruleSet`, `SchemaModel`), the XML node tree (`parseXml`, `XNode`, `XmlError`, `stringValue`, `nodePath`) and the whole `@sweberdev/summand/xpath` entry point are tagged `@beta` in TSDoc and listed separately in the API reference: they may change in a minor release. All other exports are stable.
  - **TSDoc on every export**, and an API reference that lists exactly the exports of each entry point (checked by a test).
  - **Renamed:** `CheckOptions` of `@sweberdev/summand/rules-check` is now `RuleSetCheckOptions`. The old name still works as a deprecated alias and is removed in 2.0.0.
  - **Added:** the type `DetectionError` (what `detect` returns for documents that are not invoices), `summand --version`, and `summand validate --no-leitweg` (the CLI counterpart of the `leitwegId: false` option).
  - `RuleSetCheck.id` is typed as `RuleSetId` instead of `string`.

## 0.4.0

### Minor Changes

- 3b9a0a5: See which rule sets are bundled, check whether newer ones exist, and validate large invoices much faster.

  - `ruleSetInfo()` (and `RULE_SETS`) list every bundled rule set with its name, version, upstream release, publisher, source URL, licence and number of rules. The same data is in `result.ruleSets` of every validation. The data has no build date, so builds stay reproducible.
  - New CLI command `summand rules` prints this as a table, or as JSON with `--json`.
  - `summand rules --check` asks the public GitHub release lists whether the CEN EN 16931 and KoSIT XRechnung projects have newer releases than the ones bundled, and prints `up to date`, `newer release available: <tag>` or `could not check: <reason>` for each rule set. It downloads and installs nothing and sends nothing about your invoices. With `--fail-on-outdated` the exit code is 3 when a newer release exists. The same check is available in code as `checkRuleSets({ fetch })` from `@sweberdev/summand/rules-check`, which is not part of the main entry point, so browser bundles do not grow.
  - Large invoices validate faster. With 1,000 lines the whole validation went from about 5.5 to 30 seconds to about 0.4 to 0.7 seconds on our test machine (9 to 72 times faster, depending on syntax), and invoices with 5,000 lines, which used to fail with a stack overflow, now validate in 2 to 5 seconds. Results and messages are unchanged. Typical invoices with a few lines were not slow before and change little. Numbers and method: the new performance guide.
  - New `pnpm bench` script in the repository for measuring this.

## 0.3.0

### Minor Changes

- a19472c: XML Schema (XSD) validation. `validateInvoice` now checks every invoice against the official XML Schema of its syntax before the Schematron rules, like the KoSIT validator: OASIS UBL 2.1 for Invoice and CreditNote, UN/CEFACT CII D16B (SCRDM subset, uncoupled code lists) for CrossIndustryInvoice, the versions EN 16931 1.3.16 and XRechnung 3.0 use.

  - Reports unexpected, missing, misplaced and repeated elements, missing and unknown attributes, fixed attribute values, and values that do not match their type or facets (for example `xs:date`, `xs:decimal`, `maxLength`), each as an error with the id `SUM-XSD`, the XPath and the line.
  - The Schematron rules still run when the schema check fails, so both kinds of errors are reported together.
  - New option `schema` (default `true`) and CLI flag `--no-schema` to skip the check; the result has a new `schemas` field listing the schemas used.
  - Schema messages follow the `lang` option (English or German, CLI `--lang de`); element names, values and locations are unchanged.
  - New export `validateSchema(doc, "ubl-2.1" | "cii-d16b", { lang })` and `SCHEMAS` for using the schema check on its own.
  - The XSD files are vendored unchanged and compiled at build time into compact JSON models (about 14 KB gzipped for both); the schema check takes well under a millisecond for a typical invoice.

## 0.2.0

### Minor Changes

- a365ad1: German messages: `validateInvoice(input, { lang: "de" })` and `summand validate --lang de` report every EN 16931 rule and Summand's own checks in German (the XRechnung rules are German in the original). Rule ids, locations and lines stay the same in both languages.

## 0.1.0

### Minor Changes

- 3e3ac42: First release: validate XRechnung, ZUGFeRD and Factur-X invoices (UBL, CII, PDF) against the official EN 16931 1.3.16 and XRechnung 2.6.0 Schematron rules, with profile detection, Leitweg-ID check and CLI.
