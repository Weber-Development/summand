---
"@sweberdev/summand": minor
---

See which rule sets are bundled, check whether newer ones exist, and validate large invoices much faster.

- `ruleSetInfo()` (and `RULE_SETS`) list every bundled rule set with its name, version, upstream release, publisher, source URL, licence and number of rules. The same data is in `result.ruleSets` of every validation. The data has no build date, so builds stay reproducible.
- New CLI command `summand rules` prints this as a table, or as JSON with `--json`.
- `summand rules --check` asks the public GitHub release lists whether the CEN EN 16931 and KoSIT XRechnung projects have newer releases than the ones bundled, and prints `up to date`, `newer release available: <tag>` or `could not check: <reason>` for each rule set. It downloads and installs nothing and sends nothing about your invoices. With `--fail-on-outdated` the exit code is 3 when a newer release exists. The same check is available in code as `checkRuleSets({ fetch })` from `@sweberdev/summand/rules-check`, which is not part of the main entry point, so browser bundles do not grow.
- Large invoices validate faster. With 1,000 lines the whole validation went from about 5.5 to 30 seconds to about 0.4 to 0.7 seconds on our test machine (9 to 72 times faster, depending on syntax), and invoices with 5,000 lines, which used to fail with a stack overflow, now validate in 2 to 5 seconds. Results and messages are unchanged. Typical invoices with a few lines were not slow before and change little. Numbers and method: the new performance guide.
- New `pnpm bench` script in the repository for measuring this.
