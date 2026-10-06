---
title: Rule sets and updates
description: See which rule set versions are bundled, count their rules and check whether newer releases exist.
---

Summand bundles four official rule sets: the CEN EN 16931 validation artefacts and the KoSIT XRechnung Schematron, each for UBL and for CII. They are fixed per Summand release, so the same invoice gives the same result with the same Summand version.

## Which versions are bundled

```bash
npx @sweberdev/summand rules
```

```
Rule set       Version  Rules  Licence     Publisher                                       Source
en16931-ubl    1.3.16   979    EUPL-1.2    CEN/TC 434 (ConnectingEurope)                   https://github.com/ConnectingEurope/eInvoicing-EN16931
en16931-cii    1.3.16   806    EUPL-1.2    CEN/TC 434 (ConnectingEurope)                   https://github.com/ConnectingEurope/eInvoicing-EN16931
xrechnung-ubl  v2.6.0   56     Apache-2.0  Koordinierungsstelle für IT-Standards (KoSIT)   https://github.com/itplr-kosit/xrechnung-schematron
xrechnung-cii  v2.6.0   52     Apache-2.0  Koordinierungsstelle für IT-Standards (KoSIT)   https://github.com/itplr-kosit/xrechnung-schematron
```

`--json` prints the same information for scripts. In code:

```ts
import { ruleSetInfo } from "@sweberdev/summand";

for (const set of ruleSetInfo()) console.log(set.id, set.version, set.rules);
ruleSetInfo("xrechnung-ubl"); // one rule set
```

Each entry has `id`, `name`, `version`, `release` (the upstream release the files come from), `publisher`, `source` (URL), `license` (SPDX) and `rules`. A rule is one Schematron assertion, the checks that carry a rule id such as `BR-CO-10`. The list holds no build date, so builds stay reproducible. `RULE_SETS` is the same data keyed by id, and every `validateInvoice` result lists the rule sets it applied (`result.ruleSets`) with these fields.

The data comes from `packages/core/rules-src/sources.json`. `pnpm rules` writes it into `src/rules/info.json` together with the rule counts and fails when the version stated in the vendored EN 16931 files or in `NOTICE.md` does not match.

## Checking for newer releases

```bash
npx @sweberdev/summand rules --check
```

```
Rule set       Version  Rules  Licence     Publisher  Source  Update
en16931-ubl    1.3.16   979    EUPL-1.2    ...                up to date
xrechnung-ubl  v2.6.0   56     Apache-2.0  ...                newer release available: v2.7.0
```

For each rule set it prints `up to date`, `newer release available: <tag>` or `could not check: <reason>`. It reads the public release list of the two upstream GitHub repositories and compares it with the bundled version. It never downloads or installs anything and sends nothing about your invoices; the only requests are `GET https://api.github.com/repos/<owner>/<repo>/releases`.

| Exit code | Meaning |
|---|---|
| 0 | Everything is up to date, or the sources could not be reached |
| 3 | With `--fail-on-outdated`: a newer release exists |

A newer upstream release is not installed by this command. Rule sets change with a new Summand version, which is the only way the results of your validations change. Without a token the GitHub API allows 60 requests per hour and IP address; set `SUMMAND_GITHUB_TOKEN` to send a token (to api.github.com only) when you run the check from a busy CI network.

### In code

The check is a separate entry point, so it is not part of the browser bundle:

```ts
import { checkRuleSets } from "@sweberdev/summand/rules-check";

const results = await checkRuleSets();
// [{ id: "en16931-ubl", version: "1.3.16", status: "up-to-date" }, ...]
// status: "up-to-date" | "outdated" (with `latest`) | "unknown" (with `reason`)
```

`checkRuleSets({ fetch, timeoutMs, token })` takes your own `fetch` (a function from URL to `{ ok, status, json() }`), which is how the tests run offline. It never throws for network errors: they become `unknown`.

### Weekly check in the repository

The Summand repository runs this check every Monday (`.github/workflows/rules-check.yml`) and opens or updates one issue per upstream project when a newer release exists. It uses only the default `GITHUB_TOKEN` with `issues: write`.
