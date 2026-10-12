---
title: Rule sets and versions
description: Select rule sets and bundled versions with the ruleSets option, see which versions are bundled, count their rules and check whether newer releases exist.
---

Summand bundles the official rule sets: the CEN EN 16931 validation artefacts and the KoSIT XRechnung Schematron, each for UBL and for CII. They are fixed per Summand release, so the same invoice gives the same result with the same Summand version. Since 1.1.0 you can also choose which rule sets run and, where more than one version is bundled, which version.

## Selecting rule sets and versions

The `ruleSets` option of `validateInvoice` (CLI: `--rule-sets`) takes `"auto"` or a list of rule set names.

```ts
import { validateInvoice } from "@sweberdev/summand";

validateInvoice(xml);                                   // same as ruleSets: "auto" (the default)
validateInvoice(xml, { ruleSets: ["en16931"] });        // EN 16931 only, even for XRechnung invoices
validateInvoice(xml, { ruleSets: ["en16931", "xrechnung"] });   // both, even if the invoice does not declare XRechnung
validateInvoice(xml, { ruleSets: ["en16931", "xrechnung@2.5.0"] }); // an older bundled XRechnung release
```

```bash
summand validate --rule-sets en16931,xrechnung@2.5.0 invoice.xml
```

| Value | Meaning |
|---|---|
| `"auto"` (default) | What Summand always did: EN 16931 for the detected syntax, plus the XRechnung rules when the invoice declares XRechnung (see [Profiles](profiles.md)). No rule set for profiles that are not EN 16931 compliant (MINIMUM, BASIC WL), which are reported with `SUM-PROFILE`. |
| `"en16931"`, `"xrechnung"` | The rule set for the syntax of the document: the UBL rule set for UBL, the CII rule set for CII. |
| `"en16931-ubl"`, `"en16931-cii"`, `"xrechnung-ubl"`, `"xrechnung-cii"` | One syntax-specific rule set, applied as named. These are the ids that appear in `result.ruleSets` and in each message's `ruleSet`. They worked before 1.1.0 and are not deprecated. |
| `"<name>@<version>"` | A bundled version of that rule set, e.g. `"xrechnung@2.5.0"`; `"xrechnung@v2.5.0"` (the upstream release name) is accepted too. Without `@` the default version applies. |

A list applies exactly the rule sets named, in that order; it does not add the rule sets `"auto"` would add. Family names (`"en16931"`, `"xrechnung"`) follow the same profile guard as `"auto"`: for MINIMUM and BASIC WL no rule set runs. An unknown name or version is not guessed: the result has the error `SUM-RULESET` (see the [error codes](../reference/error-codes.md#sum-ruleset)), lists the versions that are bundled and no rule set runs. The CLI reports it as a usage error (exit code 2) before it reads any file.

`result.ruleSets` always lists the rule sets and versions that really ran, so a stored verdict says which versions produced it.

### Pinning a version only for XRechnung invoices

A list is fixed: `["en16931", "xrechnung@2.5.0"]` applies the XRechnung rules to every invoice. If you want "XRechnung 2.5.0 when the invoice declares XRechnung, nothing more otherwise", decide per document:

```ts
import { detect, parseXml, validateInvoice } from "@sweberdev/summand";

const detection = detect(parseXml(xml));
const declaresXRechnung = typeof detection !== "string" && detection.profile.id.startsWith("xrechnung");
validateInvoice(xml, { ruleSets: declaresXRechnung ? ["en16931", "xrechnung@2.5.0"] : ["en16931"] });
```

### The deprecated option `xrechnung`

`xrechnung: true` is an alias for `ruleSets: ["en16931", "xrechnung"]` and gives identical results (a test checks this, including profiles without rule sets). It is deprecated since 1.1.0 and will be removed in 2.0.0. While you use it, `result.infos` contains one message with the id `SUM-DEPRECATED` that names the replacement. It is an info on purpose: it does not change `valid`, does not add a warning and so does not change the exit code with `--warnings-as-errors`. Nothing is written to the console by the library; the CLI flag `--xrechnung` prints one line to stderr. See [What changed in 1.1.0](migration-1.0.md#what-changed-in-110).

## What is bundled

| Rule set | Default version | Also bundled |
|---|---|---|
| `en16931` (UBL, CII) | 1.3.16 | none |
| `xrechnung` (UBL, CII) | 2.6.0 (XRechnung 3.0) | 2.5.0 (XRechnung 3.0.x, released 2026-01-31) |

Only these. Other releases of the two upstream projects are not bundled, and `ruleSets: ["en16931@1.3.15"]` is an error. Each additional version adds to the package size and to the browser bundle (the older XRechnung release is about 60 KB of JSON, 15 KB gzipped), so versions are added deliberately, not for every upstream release.

What the older XRechnung release means in practice:

- It is an XRechnung Schematron release; the **EN 16931 rules stay at 1.3.16** whichever XRechnung version you pick. KoSIT's own configuration for 2.5.0 paired it with EN 16931 1.3.15, which is not bundled, so `xrechnung@2.5.0` is not a reproduction of the KoSIT validator of January 2026, only of its XRechnung rules.
- The KoSIT severity changes (for example `BR-CL-21` as a warning) are applied in the version of the validator configuration that matches 2.6.0 for both XRechnung versions, because they are tied to the EN 16931 rules, which are the same.
- Differences between 2.5.0 and 2.6.0 that we found by comparing the compiled rules: `BR-TMP-2` is an error in 2.6.0 and was a warning in 2.5.0; `BR-TMP-6` (UBL dates must be `YYYY-MM-DD`) and `BR-TMP-4`, `BR-TMP-5`, `BR-TMP-7` (CII) exist only in 2.6.0; the text of `BR-DE-19` and `BR-DE-20` changed (IBAN check moved into a function); the lists of identifier scheme codes (ICD, EAS) gained codes in 2.6.0. The 54 invoices of the KoSIT test suite and the 349 instances of the 2.5.0 release give the same verdicts with both versions; the differences show on invoices that hit these rules.
- The Schematron of the older release is vendored unchanged in `packages/core/rules-src/xrechnung-2.5.0/` under the same Apache-2.0 licence as 2.6.0 (see `NOTICE.md`).

Use an older version to reproduce a verdict that was given under it, or to validate an invoice against the rules in force when it was issued. For new invoices use the default. A removal of a bundled version is a [deprecation](migration-1.0.md#deprecations) first.

## Not included: Factur-X EXTENDED Schematron

The FNFE-MPE Schematron for Factur-X EXTENDED is **not** bundled. We checked when preparing 1.1.0: the FNFE-MPE site (fnfe-mpe.org) and its GitHub organisation could not be fetched from our build environment, and the copies of these files that we could reach (inside the Mustang project) carry no licence statement of their own; Mustang's Apache-2.0 licence covers Mustang, it does not state the terms of FNFE-MPE's files. We do not redistribute files whose licence we cannot confirm from the publisher. The files also use code lists loaded at run time from separate XML files, which the engine does not support yet.

So the behaviour is unchanged: EXTENDED invoices are checked against EN 16931, whose violations are warnings by default because EXTENDED may go beyond EN 16931, and errors with `extended: "strict"` (CLI `--strict-extended`). Summand does not check the EXTENDED-specific rules. If the publisher confirms in writing that the files may be redistributed (or publishes them under a clear open licence), they can be added as a further rule set in a minor release.

## Which versions are bundled

## Which versions are bundled

```bash
npx @sweberdev/summand rules
```

```
Rule set       Version  Rules  Licence     Publisher                      Source                  Used
en16931-ubl    1.3.16   979    EUPL-1.2    CEN/TC 434 (ConnectingEurope)  https://github.com/...  default
en16931-cii    1.3.16   806    EUPL-1.2    CEN/TC 434 (ConnectingEurope)  https://github.com/...  default
xrechnung-ubl  v2.6.0   56     Apache-2.0  Koordinierungsstelle für ...   https://github.com/...  default
xrechnung-cii  v2.6.0   52     Apache-2.0  Koordinierungsstelle für ...   https://github.com/...  default
xrechnung-ubl  v2.5.0   55     Apache-2.0  Koordinierungsstelle für ...   https://github.com/...  on request (@2.5.0)
xrechnung-cii  v2.5.0   49     Apache-2.0  Koordinierungsstelle für ...   https://github.com/...  on request (@2.5.0)
```

(Abbreviated here; the command prints the full publisher and URL.) The "Used" column says which version applies without a `@version`.

`--json` prints the same information for scripts. In code:

```ts
import { ruleSetInfo } from "@sweberdev/summand";

for (const set of ruleSetInfo()) console.log(set.id, set.version, set.rules); // the defaults
ruleSetInfo("xrechnung-ubl");                  // the default version of one rule set
ruleSetInfo({ versions: "all" });              // every bundled version, defaults first
ruleSetInfo("xrechnung-ubl", "2.5.0");         // one bundled version, or undefined
```

Each entry has `id`, `name`, `version`, `release` (the upstream release the files come from), `publisher`, `source` (URL), `license` (SPDX) and `rules`. A rule is one Schematron assertion, the checks that carry a rule id such as `BR-CO-10`. The list holds no build date, so builds stay reproducible. `RULE_SETS` is the default versions keyed by id, and every `validateInvoice` result lists the rule sets it applied (`result.ruleSets`) with these fields.

The data comes from `packages/core/rules-src/sources.json`. `pnpm rules` writes it into `src/rules/info.json` together with the rule counts and fails when the version stated in the vendored EN 16931 files or in `NOTICE.md` does not match.

## Checking for newer releases

```bash
npx @sweberdev/summand rules --check
```

```
Rule set       Version  Rules  Licence     Publisher  Source  Used     Update
en16931-ubl    1.3.16   979    EUPL-1.2    ...                default  up to date
xrechnung-ubl  v2.6.0   56     Apache-2.0  ...                default  newer release available: v2.7.0
xrechnung-ubl  v2.5.0   55     Apache-2.0  ...                on request (@2.5.0)  older version, not compared
```

For each default version it prints `up to date`, `newer release available: <tag>` or `could not check: <reason>`; bundled older versions are listed as `older version, not compared` and never make `--fail-on-outdated` exit with 3. It reads the public release list of the two upstream GitHub repositories and compares it with the bundled version. It never downloads or installs anything and sends nothing about your invoices; the only requests are `GET https://api.github.com/repos/<owner>/<repo>/releases`.

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
// [{ id: "en16931-ubl", version: "1.3.16", status: "up-to-date" }, ...] (the default versions)
// status: "up-to-date" | "outdated" (with `latest`) | "unknown" (with `reason`)
```

`checkRuleSets({ fetch, timeoutMs, token })` takes your own `fetch` (a function from URL to `{ ok, status, json() }`), which is how the tests run offline. It never throws for network errors: they become `unknown`.

### Weekly check in the repository

The Summand repository runs this check every Monday (`.github/workflows/rules-check.yml`) and opens or updates one issue per upstream project when a newer release exists. It uses only the default `GITHUB_TOKEN` with `issues: write`.
