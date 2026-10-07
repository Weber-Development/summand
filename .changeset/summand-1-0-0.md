---
"@sweberdev/summand": major
---

Summand 1.0.0 is the first stable release.

**Breaking: the `summand` command now uses ESLint-style exit codes.** Exit code 1 used to mean both "an invoice is invalid" and "the command could not run". Now:

- `0`: every invoice is valid, or the command did what was asked.
- `1`: an invoice is invalid (also warnings with `--warnings-as-errors`, and input that is not an invoice at all).
- `2`: the command could not run: unknown command or flag, missing arguments, a file that cannot be read, `extract` on a file without embedded XML.
- `3`: unchanged, `rules --check --fail-on-outdated` found a newer rule set release.

Scripts that only test for "not 0" keep working. Scripts that test for exactly `1` to detect invalid invoices no longer treat a mistyped path as an invalid invoice; handle `2` explicitly, see the [migration guide](https://github.com/Weber-Development/summand/blob/main/docs/guides/migration-1.0.md). `summand validate` also keeps validating the remaining files when one file cannot be read (exit code 2). `--json` output is unchanged.

**1.0 promises a stable API.** From 1.0.0 the package follows Semantic Versioning as described in the stability policy: exports, the `ValidationResult` shape, `SUM-` codes, the CLI flags and exit codes and the package entry points change only in a major release, deprecations stay for the rest of the major version, and rule set updates ship as minor releases with a documented list of verdict changes. The advanced exports marked `@beta` (compiled rule and schema formats, XML node tree, `@sweberdev/summand/xpath`) are excluded and may change in a minor release.
