---
title: API
description: All exports of @sweberdev/summand, @sweberdev/summand/xpath, @sweberdev/summand/rules-check and @sweberdev/summand/cli, with their stability.
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
| `RULE_SETS`, `ruleSetInfo(id?)` | Bundled rule sets: metadata (version, release, publisher, source, licence, rule count). See [Rule sets and updates](../guides/rule-sets.md). |
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
| `RuleSetId`, `RuleSetInfo` | Bundled rule sets |
| `SchemaId`, `SchemaInfo`, `SchemaFinding`, `SchemaFindingKind`, `ValidateSchemaOptions` | XML Schema validation |

### Advanced (`@beta`)

For custom Schematron rules and your own tooling on the parsed XML. These may change in a minor release.

| Export | Description |
|---|---|
| `compileSchematron(source, { id, includes? })` | Compiles a Schematron schema to a JSON rule set |
| `runSchematron(set, doc, options?)` | Runs a rule set against a parsed document |
| `ruleSet(id)` | The compiled rules of a bundled rule set |
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

## @sweberdev/summand/cli

| Export | Description |
|---|---|
| `runCli(argv, io?, { fetch? })` | Runs the CLI and resolves to the exit code. `fetch` is only used by `rules --check`. See [CLI](../guides/cli.md) and the [exit codes](error-codes.md#exit-codes-of-the-summand-command). |
| `CliIo` | The `{ out, err }` functions `runCli` writes to |

## Command line

| Item | Description |
|---|---|
| `summand validate <files...>` | Options `--json`, `--xrechnung`, `--strict-extended`, `--no-schema`, `--no-leitweg`, `--warnings-as-errors`, `--quiet`, `--lang <en\|de>` |
| `summand extract <file.pdf>` | Option `--out <file.xml>` (`-o`) |
| `summand leitweg <id>` | |
| `summand rules` | Options `--json`, `--check`, `--fail-on-outdated` |
| `summand --version` | Prints the version |
| Exit codes | 0, 1, 2 and 3, see [Error codes](error-codes.md#exit-codes-of-the-summand-command) |
