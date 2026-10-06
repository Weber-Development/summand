---
title: API
description: All exports of @sweberdev/summand, @sweberdev/summand/xpath and @sweberdev/summand/cli.
---

## @sweberdev/summand

| Export | Description |
|---|---|
| `validateInvoice(input, options?)` | Validates XML (string or bytes) or a ZUGFeRD / Factur-X PDF. Returns a `ValidationResult`. See [Validating invoices](../guides/validate.md). |
| `ruleSetsFor(detection, options?)` | The rule sets `"auto"` would apply |
| `detect(doc)` | Syntax and profile of a parsed document, or `"not-an-invoice"` / `"zugferd-1"` |
| `profileFor(specificationId)` | Profile for a BT-24 value |
| `summarize(doc, syntax)` | `InvoiceSummary` of a parsed invoice |
| `decodeXml(bytes)` | Decodes XML bytes by BOM or XML declaration |
| `extractInvoiceXml(bytes)` | `{ xml, name, info }` of the invoice embedded in a PDF, or `undefined` |
| `readPdf(bytes)` | Embedded files and XMP information of a PDF |
| `isPdf(bytes)` | Whether bytes are a PDF |
| `isValidLeitwegId(id)`, `parseLeitwegId(id)`, `leitwegCheckDigits(coarse, fine?)` | Leitweg-ID helpers |
| `RULE_SETS`, `ruleSet(id)` | Bundled rule sets (metadata and compiled rules) |
| `validateSchema(doc, schema, { lang? })` | Validates a parsed document against `"ubl-2.1"`, `"cii-d16b"` or a compiled `SchemaModel`; `lang: "de"` for German messages. Returns `SchemaFinding[]` (`kind`, `message`, `location`, `line`). |
| `SCHEMAS` | Bundled XML Schemas (metadata) |
| `compileSchematron(source, { id, includes? })` | Compiles a Schematron schema to a JSON rule set |
| `runSchematron(set, doc, options?)` | Runs a rule set against a parsed document |
| `parseXml(text)`, `stringValue(node)`, `nodePath(node)`, `XmlError` | XML parser |

Types: `ValidationResult`, `ValidationMessage`, `ValidateOptions`, `Severity`, `InvoiceInput`, `Profile`, `ProfileId`, `Syntax`, `Detection`, `InvoiceSummary`, `PdfInfo`, `EmbeddedFile`, `RuleSetId`, `RuleSetInfo`, `SchemaId`, `SchemaInfo`, `SchemaFinding`, `SchemaFindingKind`, `SchemaModel`, `ValidateSchemaOptions`, `CompiledRuleSet`, `SchematronFinding`, `Flag`, `RunOptions`, `XNode`, `LeitwegId`.

## @sweberdev/summand/xpath

| Export | Description |
|---|---|
| `select(expression, node, namespaces?, variables?)` | Evaluates an XPath 2.0 expression |
| `parseXPath(expression, namespaces)`, `evaluate(ast, env)` | Lower-level parse and evaluate |
| `builtinFunctions`, `xpathRegex(pattern, flags)` | Function library and XSD regex translation |
| `Decimal`, `Untyped`, `XDate`, `XPathError`, `XPathSyntaxError` | Values and errors |

## @sweberdev/summand/cli

`runCli(argv, io?)` runs the CLI and resolves to the exit code.
