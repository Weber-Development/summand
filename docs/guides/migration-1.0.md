---
title: Migration and stability
description: Upgrade notes up to 1.0, the one breaking change in 1.0.0 (CLI exit codes) and the stability policy of the 1.x versions - what SemVer covers, how rule set updates and verdict changes are released.
---

Summand 1.0.0 is the first stable release. From here on the stability policy below applies. The API is the one 0.9 had; the only breaking change is in the exit codes of the `summand` command.

## Breaking change in 1.0.0: exit codes

The CLI now splits exit codes like ESLint. Before, exit code 1 meant both "an invoice is invalid" and "the command could not run". Now:

| Situation | Before 1.0 | 1.0 |
|---|---|---|
| Every invoice valid | 0 | 0 |
| An invoice is invalid, warnings with `--warnings-as-errors`, or the input is not an invoice (`SUM-FORMAT`, `SUM-XML`, `SUM-PDF`) | 1 | 1 |
| `leitweg` with an invalid ID | 1 | 1 |
| Unknown command or flag, missing arguments (including `--lang fr`), no command at all | 1 | **2** |
| A file that cannot be read (does not exist, no permission) | 1 | **2** |
| `extract` on a file that is not a PDF or has no embedded XML | 1 | **2** |
| `rules --check --fail-on-outdated` and a newer release exists | 3 | 3 |

Also, `validate` no longer stops at the first unreadable file: it validates the other files, reports the unreadable one on stderr and exits with 2 (an error wins over findings).

**What to do with your scripts.**

- `summand validate ... || exit 1` or `if ! summand validate ...`: nothing to change; any non-zero code still fails.
- `[ $? -eq 1 ]` or `if [ "$code" == 1 ]` to detect "invoice invalid": that now matches only real findings. A typo in a path used to look like an invalid invoice; it is now 2. Decide what 2 should mean in your pipeline (usually: fail the build and fix the script), and handle it explicitly:

```bash
summand validate invoices/*.xml
case $? in
  0) echo "all valid" ;;
  1) echo "invalid invoices found"; exit 1 ;;
  *) echo "summand could not run"; exit 2 ;;
esac
```

- Code that calls `runCli` receives the same numbers. `EXIT_CODES` is internal; do not import it.
- Code that treated "not 0" as "invalid invoice" and showed that to users should now tell exit 2 apart, or read `valid` from `--json` output as before. `--json` output itself is unchanged.

## Upgrading to 1.0 from older versions

**From 0.4 to 0.9:** no code changes needed. One name is deprecated, see [What changed in 0.9.0](#what-changed-in-090). Then read the exit code change above if you use the CLI in scripts.

**From 0.3 or older:** also read the 0.4 notes; there is nothing to change either.

**From 0.2 or 0.1:** invoices that validated without errors can now have `SUM-XSD` errors, see the 0.3 row below.

| If you are on | What changed since | What to do |
|---|---|---|
| 0.1.0 | 0.2.0: `lang` option and `--lang` flag for German messages. Additive. | Nothing. |
| 0.2.x | 0.3.0: `validateInvoice` checks the XML Schema of the syntax before the rules, like the KoSIT validator. Invoices that broke the schema but passed the rules (a date as `04.04.2016`, elements in the wrong order) now have errors with the id `SUM-XSD`. New `schemas` field in the result, new option `schema`, flag `--no-schema`, new export `validateSchema`. | Fix the invoices. Only if you must keep the old verdict for now, pass `schema: false` / `--no-schema`. Handle `SUM-XSD` in code that switches on message ids. |
| 0.3.x | 0.4.0: `ruleSetInfo()`, `RULE_SETS`, `summand rules`, `rules --check` and `@sweberdev/summand/rules-check`; much faster validation of large invoices. Additive; results and messages are unchanged. | Nothing. |
| 0.4.x to 0.9.x | 0.9.0: see below. No removals. | Rename `CheckOptions` to `RuleSetCheckOptions` if you import it. |
| 0.9.x | 1.0.0: CLI exit code 2 for errors running the command, see above. No API changes. | Check scripts that test for exit code 1. |

Check an upgrade by running your invoices before and after and comparing `result.ruleSets` (the rule set versions are part of every result) and the ids in `errors` and `warnings`.

## What changed in 0.9.0

No export, option, field, flag, message id or exit code was removed or changed its meaning.

| Change | Kind | Detail |
|---|---|---|
| `CheckOptions` renamed to `RuleSetCheckOptions` (`@sweberdev/summand/rules-check`) | Deprecation | The old name is a type alias of the new one and stays until 2.0.0. TypeScript marks it as deprecated in your editor. The name was too generic next to the other exports. |
| `DetectionError` exported | Addition | The type of the strings `detect` returns instead of a `Detection` (`"not-an-invoice"`, `"zugferd-1"`). It was not nameable before. |
| `RuleSetCheck.id` is a `RuleSetId` instead of `string` | Narrower type | Every value was one of the four ids already. Code that reads the field keeps compiling. |
| `summand --version` (`-v`) | Addition | Prints the version. |
| `summand validate --no-leitweg` | Addition | The CLI counterpart of `leitwegId: false`, which had no flag. |
| Advanced exports marked `@beta` | Documentation | The compiled rule and schema formats, the XML node tree and the XPath entry point expose internals. They are listed as [advanced](../reference/api.md#advanced-beta) and may change in a minor release. Everything else is stable. |
| [Error codes](../reference/error-codes.md) | Documentation | All `SUM-` codes with severity, meaning, cause and fix, and the exit codes (0, 1, 2, 3) of the CLI. A test fails when a code is missing there. |
| TSDoc on every export | Documentation | Hover text and docs match [the API reference](../reference/api.md), checked by a test. |
| API snapshot test | Internal | CI fails when the exports, their types, the CLI help or the exit codes change without the snapshot being updated on purpose. |

## Stability policy

From 1.0.0 Summand follows [Semantic Versioning](https://semver.org). `MAJOR.MINOR.PATCH`:

- **Major** (2.0.0): anything listed under *covered* below is removed, renamed or changes its meaning.
- **Minor** (1.1.0): additions, new `SUM-` codes, new rule set releases, deprecations.
- **Patch** (1.0.1): bug fixes, documentation, dependency updates, no new features.

### What SemVer covers

- Every export of `@sweberdev/summand`, `@sweberdev/summand/rules-check` and `@sweberdev/summand/cli` that is not marked `@beta`: names, parameters, return and option types, and the behaviour the TSDoc and these docs describe. Adding an optional option or a field to a result is a minor change, so do not treat results as closed objects; add `default` branches when you switch on `ProfileId`, `SchemaFindingKind` or `Syntax`.
- The `ValidationResult` and `ValidationMessage` shape, including the field names of the `--json` output (`{ file, ...result }`).
- The `SUM-` codes: their ids, their severities and what they mean. A code is never reused. New codes appear in minor releases, see below.
- The `summand` command: commands, flags and the exit codes 0, 1, 2 and 3. New commands and flags are minor; a flag never changes meaning.
- The package entry points (`exports` of `package.json`) and the `summand` binary.
- Node.js 20 and newer. Dropping a Node.js version is a major change.

### What it does not cover

- **Advanced exports** (`@beta`): the compiled rule and schema formats (`compileSchematron`, `runSchematron`, `ruleSet`, `SchemaModel`), the XML node tree (`parseXml`, `XNode`, ...) and the whole `@sweberdev/summand/xpath` entry point. They may change in a minor release, always with a note in the changelog, never in a patch.
- The wording of `message` texts in either language. Match on `id`, `severity` and `location`.
- The order of messages inside `errors`, `warnings` and `infos`, except that schema errors (`SUM-XSD`) come first.
- `durationMs`, the layout of the `dist` folder, and the compiled JSON files in `src`.
- The ids and wording of rules that come from the bundled rule sets (`BR-CO-15`, `BR-DE-15`, ...): they are the upstream's, see below.

### Deprecations

A deprecated export keeps working for at least the rest of the major version. Its TSDoc names the replacement and the version that removes it (`@deprecated Use ... Removed in 2.0.0.`), the changelog lists it, and the docs name it on the [API page](../reference/api.md). Deprecated exports are removed only in a major release.

### Rule set updates and verdict changes

The verdict for an invoice depends on the bundled rule sets (EN 16931 validation artefacts and XRechnung Schematron) and XML Schemas. They are fixed per Summand version: the same invoice gives the same result with the same Summand version, and `result.ruleSets` and `result.schemas` record the versions used, so you can store them next to a verdict.

A new upstream release of a rule set is released as a **minor** version of Summand, never as a patch and never inside a major version without a note. Upstream releases can add rules, remove rules, change a rule's text or change severity, so an invoice that was valid can become invalid and the reverse. This is the whole point of keeping up with the standard, so it is not a breaking change in the SemVer sense. It is always communicated:

1. The changelog entry of the release has the heading **Rule set update** with the old and new version of every rule set and a link to the upstream release notes.
2. It states the **verdict changes** we know of: rules added, removed or changed in severity, and which invoices are affected. We run the full test fixtures (CEN unit tests, KoSIT test suite) with the old and the new rule set and report the differences.
3. `summand rules` and `result.ruleSets` show the versions; `summand rules --check` tells you when upstream is ahead of your Summand version.

Any other release that can change the verdict of some invoice carries a **Verdict changes** section in its changelog entry:

| Release | Allowed to change verdicts? |
|---|---|
| Patch | Only to fix a deviation from the reference (the official rule set or the KoSIT validator): Summand was wrong. Listed under **Verdict changes**. |
| Minor | New rule set releases, new `SUM-` checks, new schema versions. Listed under **Rule set update** or **Verdict changes**. |
| Major | Anything, listed in the migration notes. |

If you need verdicts that never change, pin the exact version of `@sweberdev/summand` (`"@sweberdev/summand": "1.4.2"`, no `^`) and update on your schedule. If you want to be warned before a rule set update changes your results, run `summand rules --check --fail-on-outdated` in CI: it exits with code 3 as soon as upstream is ahead of the bundled version.
