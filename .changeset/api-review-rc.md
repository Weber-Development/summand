---
"@sweberdev/summand": minor
---

Release candidate for 1.0: the API is reviewed, documented and now guarded by tests. From 1.0.0 the package follows Semantic Versioning, and 0.9 is the API 1.0.0 will have. Nothing was removed or changed in behaviour, so upgrading from 0.4 needs no code changes.

- **Error code catalogue.** Every `SUM-` code (`SUM-XML`, `SUM-FORMAT`, `SUM-PDF`, `SUM-XSD`, `SUM-PROFILE`, `SUM-EXTENDED`, `SUM-LEITWEG`, `SUM-PDF-LEVEL`) is documented with severity, meaning, cause and fix, together with the exit codes of the CLI (0, 1 and 3): new page "Error codes" in the reference. A test fails when the package can emit a code that is not in the catalogue.
- **Stability policy and migration notes.** The new guide "Migration and stability" explains what SemVer covers from 1.0 (exports, result shapes, `--json` output, `SUM-` codes, commands, flags and exit codes), what it does not (advanced exports, message wording, message order), how deprecations work, and how rule set updates are released: always as a minor version, with the old and new versions and the verdict changes we know of in the changelog. It also lists what changed from 0.1 to 0.9.
- **Advanced API marked.** The compiled rule and schema formats (`compileSchematron`, `runSchematron`, `ruleSet`, `SchemaModel`), the XML node tree (`parseXml`, `XNode`, `XmlError`, `stringValue`, `nodePath`) and the whole `@sweberdev/summand/xpath` entry point are tagged `@beta` in TSDoc and listed separately in the API reference: they may change in a minor release. All other exports are stable.
- **TSDoc on every export**, and an API reference that lists exactly the exports of each entry point (checked by a test).
- **Renamed:** `CheckOptions` of `@sweberdev/summand/rules-check` is now `RuleSetCheckOptions`. The old name still works as a deprecated alias and is removed in 2.0.0.
- **Added:** the type `DetectionError` (what `detect` returns for documents that are not invoices), `summand --version`, and `summand validate --no-leitweg` (the CLI counterpart of the `leitwegId: false` option).
- `RuleSetCheck.id` is typed as `RuleSetId` instead of `string`.
