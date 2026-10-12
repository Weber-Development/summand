# @sweberdev/summand

## 2.0.0

### Major Changes

- e5c7e2c: Summand 2.0.0 removes what 1.x deprecated and requires Node.js 22. It adds no rules and changes no rule set: the same invoice gives the same verdict as with 1.1.0 and the same options. If you already use `ruleSets`, no deprecated exports and Node.js 22 or newer, there is nothing to change. The upgrade steps with before and after code are in the [migration guide](https://github.com/Weber-Development/summand/blob/main/docs/guides/migration-2.0.md).

  **Breaking changes**

  - **Node.js 22 or newer is required** (`engines.node` is `>=22`; 1.x supported 20). CI runs the full suite on Node.js 22 and 24.
  - **Removed: the option `xrechnung` and the CLI flag `--xrechnung`.** Use `ruleSets: ["en16931", "xrechnung"]` and `--rule-sets en16931,xrechnung`; the results are identical. `summand validate --xrechnung` is now a usage error (exit code 2). In plain JavaScript a leftover `xrechnung` option makes `validateInvoice` return the error `SUM-RULESET` instead of validating with fewer rules; TypeScript reports it at compile time.
  - **Removed: the info `SUM-DEPRECATED`.** Nothing emits it any more, so `result.infos` no longer carries the extra entry. The id is not reused.
  - **Removed: the type `CheckOptions`** of `@sweberdev/summand/rules-check`. Use `RuleSetCheckOptions`, the same type.
  - **Changed: `ruleSetsFor(detection)` takes only the detection** (the second argument existed for `xrechnung`).

  **Result messages: the contract.** Every message in `errors`, `warnings` and `infos` has a stable `id` (a rule id such as `BR-DE-15`, or a `SUM-` code that is never renamed or reused), a `severity` that always equals the list it is in, and a `ruleSet` (`en16931-ubl`, `en16931-cii`, `xrechnung-ubl`, `xrechnung-cii`, or `summand` exactly for the `SUM-` codes). These fields already existed; 2.0 documents them as the contract, checks them with a test, and renames nothing. The code field is still called `id`.

  **Not included, as before.** The Peppol BIS Billing 3.0 Schematron rules are not bundled: Peppol invoices are recognised and checked against EN 16931 only, and `peppol` in `ruleSets` is an error (`SUM-RULESET`). The Factur-X EXTENDED Schematron is not bundled either (we cannot confirm the licence of the FNFE-MPE files); EXTENDED invoices are checked against EN 16931, with violations as warnings by default. The 1.1 notes announced Peppol rule sets as planned; they are not part of 2.0.

## 2.0.0-next.0

### Major Changes

- e5c7e2c: Summand 2.0.0 removes what 1.x deprecated and requires Node.js 22. It adds no rules and changes no rule set: the same invoice gives the same verdict as with 1.1.0 and the same options. If you already use `ruleSets`, no deprecated exports and Node.js 22 or newer, there is nothing to change. The upgrade steps with before and after code are in the [migration guide](https://github.com/Weber-Development/summand/blob/main/docs/guides/migration-2.0.md).

  **Breaking changes**

  - **Node.js 22 or newer is required** (`engines.node` is `>=22`; 1.x supported 20). CI runs the full suite on Node.js 22 and 24.
  - **Removed: the option `xrechnung` and the CLI flag `--xrechnung`.** Use `ruleSets: ["en16931", "xrechnung"]` and `--rule-sets en16931,xrechnung`; the results are identical. `summand validate --xrechnung` is now a usage error (exit code 2). In plain JavaScript a leftover `xrechnung` option makes `validateInvoice` return the error `SUM-RULESET` instead of validating with fewer rules; TypeScript reports it at compile time.
  - **Removed: the info `SUM-DEPRECATED`.** Nothing emits it any more, so `result.infos` no longer carries the extra entry. The id is not reused.
  - **Removed: the type `CheckOptions`** of `@sweberdev/summand/rules-check`. Use `RuleSetCheckOptions`, the same type.
  - **Changed: `ruleSetsFor(detection)` takes only the detection** (the second argument existed for `xrechnung`).

  **Result messages: the contract.** Every message in `errors`, `warnings` and `infos` has a stable `id` (a rule id such as `BR-DE-15`, or a `SUM-` code that is never renamed or reused), a `severity` that always equals the list it is in, and a `ruleSet` (`en16931-ubl`, `en16931-cii`, `xrechnung-ubl`, `xrechnung-cii`, or `summand` exactly for the `SUM-` codes). These fields already existed; 2.0 documents them as the contract, checks them with a test, and renames nothing. The code field is still called `id`.

  **Not included, as before.** The Peppol BIS Billing 3.0 Schematron rules are not bundled: Peppol invoices are recognised and checked against EN 16931 only, and `peppol` in `ruleSets` is an error (`SUM-RULESET`). The Factur-X EXTENDED Schematron is not bundled either (we cannot confirm the licence of the FNFE-MPE files); EXTENDED invoices are checked against EN 16931, with violations as warnings by default. The 1.1 notes announced Peppol rule sets as planned; they are not part of 2.0.

## 1.1.0

### Minor Changes

- 620a81c: Summand 1.1.0: choose rule sets and versions with one option, validate many invoices with a worker pool, and the first deprecation on the way to 2.0. Nothing was removed, the defaults are unchanged, and the verdict of no invoice changes.

  - **One option for rule sets: `ruleSets`.** It accepts `"auto"` (default, what 1.0 did) or a list of `"en16931"`, `"xrechnung"` (resolved to the UBL or CII rule set of the document) or a syntax-specific id (`"xrechnung-ubl"`), each optionally with a bundled version: `ruleSets: ["en16931", "xrechnung@2.5.0"]`. CLI: `summand validate --rule-sets en16931,xrechnung@2.5.0`. An unknown name or version gives the new error `SUM-RULESET` (the CLI exits with 2 before reading any file).
  - **Deprecated: the option `xrechnung` and the flag `--xrechnung`.** `xrechnung: true` is now an alias for `ruleSets: ["en16931", "xrechnung"]` and gives identical results. Results validated with it carry one info message with the new id `SUM-DEPRECATED` that names the replacement; the CLI flag prints one line to stderr. It is an info, not a warning, so `valid`, `warnings` and `--warnings-as-errors` exit codes do not change, and the library writes nothing to the console. Removed in 2.0.0.
  - **Rule set version selection: XRechnung Schematron 2.5.0 is bundled next to 2.6.0** (Apache-2.0, taken from the upstream release v2.5.0, see `NOTICE.md`). 2.6.0 stays the default. `ruleSetInfo({ versions: "all" })` and `summand rules` list every bundled version; `ruleSetInfo(id, version)` returns one; `ruleSet(id, version?)` returns the compiled rules. EN 16931 stays at 1.3.16 only, so `xrechnung@2.5.0` pairs the older XRechnung rules with EN 16931 1.3.16 (KoSIT paired 2.5.0 with 1.3.15, which is not bundled). Known differences of the older release: `BR-TMP-2` is a warning instead of an error, `BR-TMP-4`/`5`/`6`/`7` do not exist, and the identifier scheme code lists lack the codes added in 2.6.0. The package grows by about 60 KB (15 KB gzipped). `summand rules --json` now lists six rows instead of four.
  - **`validateMany(inputs, options)` in the new entry point `@sweberdev/summand/batch`** (Node.js only): validates files or in-memory data with a bounded pool of worker threads (`concurrency`, default `min(4, cores)`), streams results as an async iterator in input order (or `.toArray()`), reports an unreadable file as `error` with the new code `SUM-BATCH` instead of throwing, supports `AbortSignal`, and stops the workers when you leave the loop. See the new guide "Validating many invoices". Measured speed-ups and the method are in the performance guide; on a 4-core cloud container the gain for 1,000-line invoices was 1.5x, limited by memory bandwidth, and a pool does not pay off for a few small files. Browsers keep using `validateInvoice` per file.
  - **Not included: Factur-X EXTENDED Schematron.** We looked at the FNFE-MPE validation files for ZUGFeRD / Factur-X EXTENDED. We could not fetch them from FNFE-MPE (the site and its GitHub organisation were unreachable from our build environment), and the copies we could reach inside a third-party project carry no licence statement of their own. Without a confirmed licence from the publisher we do not redistribute them. EXTENDED keeps being checked against EN 16931 only (violations are warnings by default, errors with `extended: "strict"` / `--strict-extended`), as before. Details are in the Rule sets guide.

  New API: `RuleSetFamily`, `RuleSetSelector`, `RuleSetInfoOptions`, the overloads of `ruleSetInfo`, the optional `version` parameter of `ruleSet`, and from `@sweberdev/summand/batch`: `validateMany`, `BatchInput`, `BatchResult`, `BatchError`, `BatchRun`, `ValidateManyOptions`. `ValidateOptions.ruleSets` accepts the new selectors in addition to the old ids. See "What changed in 1.1.0" in the migration guide, which also lists what 2.0 plans to remove.

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
