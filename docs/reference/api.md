---
title: API
description: All exports of @sweberdev/summand, @sweberdev/summand/xpath, @sweberdev/summand/rules-check, @sweberdev/summand/batch and @sweberdev/summand/cli, with their stability and deprecations.
---

Every export is documented with TSDoc in the package, so your editor shows the same text. A test checks that this page lists exactly the exports of the package.

## Stability

Exports are either **stable** or **advanced**. Stable exports follow SemVer: a breaking change needs a new major version. Advanced exports are marked `@beta` in TSDoc and in the tables below: they expose internals (the compiled rule and schema formats, the XML node tree, the XPath engine) and may change in a minor release, with a note in the changelog. Deprecated exports keep working until the next major version. The details are in the [stability policy](../guides/migration-1.0.md#stability-policy).

## @sweberdev/summand

### Functions and constants

| Export | Description |
|---|---|
| `validateInvoice(input, options?)` | Validates XML (string or bytes) or a ZUGFeRD / Factur-X PDF. Synchronous, never throws for bad input. Returns a `ValidationResult`. See [Validating invoices](../guides/validate.md). |
| `ruleSetsFor(detection, options?)` | The rule sets `"auto"` would apply |
| `detect(doc)` | Syntax and profile of a parsed document, or `"not-an-invoice"` / `"zugferd-1"` |
| `profileFor(specificationId)` | Profile for a BT-24 value |
| `summarize(doc, syntax)` | `InvoiceSummary` of a parsed invoice |
| `decodeXml(bytes)` | Decodes XML bytes by BOM or XML declaration |
| `extractInvoiceXml(bytes)` | `{ xml, name, info }` of the invoice embedded in a PDF, or `undefined`. Throws `PdfError` for unreadable PDFs. |
| `readPdf(bytes)` | Embedded files and XMP information of a PDF. Throws `PdfError`. |
| `isPdf(bytes)` | Whether bytes are a PDF |
| `PdfError` | Error class of `readPdf` and `extractInvoiceXml` |
| `isValidLeitwegId(id)`, `parseLeitwegId(id)`, `leitwegCheckDigits(coarse, fine?)` | Leitweg-ID helpers |
| `RULE_SETS`, `ruleSetInfo(id?)` | Default version of each bundled rule set: metadata (version, release, publisher, source, licence, rule count). `ruleSetInfo(id, version)` returns one bundled version (or `undefined`), `ruleSetInfo({ versions: "all" })` lists every bundled version. See [Rule sets and versions](../guides/rule-sets.md). |
| `validateSchema(doc, schema, { lang? })` | Validates a parsed document against `"ubl-2.1"`, `"cii-d16b"` or a compiled `SchemaModel`; `lang: "de"` for German messages. Returns `SchemaFinding[]`. |
| `SCHEMAS` | Bundled XML Schemas (metadata) |

### Types

| Export | Description |
|---|---|
| `ValidationResult`, `ValidationMessage`, `ValidateOptions`, `Severity`, `InvoiceInput` | Input, options and result of `validateInvoice` |
| `Profile`, `ProfileId`, `Syntax`, `Detection`, `DetectionError` | Result of `detect` and `profileFor` |
| `InvoiceSummary` | Key facts of an invoice |
| `PdfInfo`, `EmbeddedFile` | Result of `readPdf` |
| `LeitwegId` | Result of `parseLeitwegId` |
| `RuleSetId`, `RuleSetInfo`, `RuleSetInfoOptions` | Bundled rule sets and the options of `ruleSetInfo` |
| `RuleSetFamily`, `RuleSetSelector` | What the `ruleSets` option accepts: `"en16931"`, `"xrechnung"`, a syntax-specific id, each optionally with `@version` |
| `SchemaId`, `SchemaInfo`, `SchemaFinding`, `SchemaFindingKind`, `ValidateSchemaOptions` | XML Schema validation |

### Deprecated options

Options are not exports, so they are listed here. A deprecated option keeps working until the next major version and is documented in TSDoc with its replacement.

| Option | Replacement |
|---|---|
| `ValidateOptions.xrechnung` | `ruleSets: ["en16931", "xrechnung"]` (or leave `ruleSets` at `"auto"` for `xrechnung: false`). Deprecated in 1.1.0; every result validated with it has an info `SUM-DEPRECATED`. Removed in 2.0.0. |
| CLI flag `--xrechnung` | `--rule-sets en16931,xrechnung`. Deprecated in 1.1.0; prints a note to stderr. Removed in 2.0.0. |

### Advanced (`@beta`)

For custom Schematron rules and your own tooling on the parsed XML. These may change in a minor release.

| Export | Description |
|---|---|
| `compileSchematron(source, { id, includes? })` | Compiles a Schematron schema to a JSON rule set |
| `runSchematron(set, doc, options?)` | Runs a rule set against a parsed document |
| `ruleSet(id, version?)` | The compiled rules of a bundled rule set (default version unless `version` is given) |
| `parseXml(text)`, `stringValue(node)`, `nodePath(node)`, `XmlError` | The XML parser and helpers for its node tree |
| `CompiledRuleSet`, `RunOptions`, `SchematronFinding`, `Flag` | Types of the Schematron engine |
| `SchemaModel` | Compiled XML Schema |
| `XNode` | Node of a parsed XML document |

## @sweberdev/summand/xpath

The XPath 2.0 engine for Schematron. Everything here is advanced (`@beta`).

| Export | Description |
|---|---|
| `select(expression, node, namespaces?, variables?)` | Evaluates an XPath 2.0 expression |
| `parseXPath(expression, namespaces)`, `evaluate(ast, env)` | Lower-level parse and evaluate |
| `builtinFunctions`, `xpathRegex(pattern, flags)` | Function library and XSD regex translation |
| `atomize(sequence)`, `stringOf(item)`, `ebv(sequence)`, `isNode(item)` | Value helpers |
| `Decimal`, `Untyped`, `XDate`, `XPathError`, `XPathSyntaxError` | Values and errors |
| `Ast`, `Atomic`, `Env`, `Item`, `Sequence`, `XPathFunction` | Types |

## @sweberdev/summand/rules-check

| Export | Description |
|---|---|
| `checkRuleSets({ fetch?, timeoutMs?, token? })` | Asks the public GitHub release lists whether newer releases of the bundled rule sets exist. Resolves to one `RuleSetCheck` (`id`, `version`, `status`, `latest?`, `reason?`) per rule set and never throws for network errors. |
| `RuleSetCheck`, `RuleSetCheckStatus`, `RuleSetCheckOptions`, `FetchLike` | Types |

Not part of the main entry point, so browser bundles do not include it.

### Deprecated

| Export | Replacement |
|---|---|
| `CheckOptions` | `RuleSetCheckOptions`. Same type, renamed in 0.9.0 because the old name was too generic for the package namespace. Removed in 2.0.0. |

## @sweberdev/summand/batch

Node.js only (worker threads and the file system). Browsers call `validateInvoice` per file, see [Validating many invoices](../guides/batch.md).

| Export | Description |
|---|---|
| `validateMany(inputs, options?)` | Validates many invoices with a bounded worker pool. Returns a `BatchRun`: an async iterable of results in input order, plus `toArray()`. Never throws per input. Options: all `ValidateOptions`, `concurrency` (default `min(4, cores)`), `signal`. |
| `BatchInput`, `BatchResult`, `BatchError`, `BatchRun`, `ValidateManyOptions` | Types |

## @sweberdev/summand/cli

| Export | Description |
|---|---|
| `runCli(argv, io?, { fetch? })` | Runs the CLI and resolves to the exit code. `fetch` is only used by `rules --check`. See [CLI](../guides/cli.md) and the [exit codes](error-codes.md#exit-codes-of-the-summand-command). |
| `CliIo` | The `{ out, err }` functions `runCli` writes to |

## Command line

| Item | Description |
|---|---|
| `summand validate <files...>` | Options `--json`, `--rule-sets <list>`, `--xrechnung` (deprecated), `--strict-extended`, `--no-schema`, `--no-leitweg`, `--warnings-as-errors`, `--quiet`, `--lang <en\|de>` |
| `summand extract <file.pdf>` | Option `--out <file.xml>` (`-o`) |
| `summand leitweg <id>` | |
| `summand rules` | Options `--json`, `--check`, `--fail-on-outdated` |
| `summand --version` | Prints the version |
| Exit codes | 0, 1, 2 and 3, see [Error codes](error-codes.md#exit-codes-of-the-summand-command) |
