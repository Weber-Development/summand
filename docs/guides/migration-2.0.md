---
title: Migrating to 2.0
description: What 2.0.0 removes and how to upgrade from 1.x - the xrechnung option and --xrechnung, the CheckOptions alias, SUM-DEPRECATED, Node.js 22 as the minimum - and the message contract of results.
---

2.0.0 is a clean-up release. It removes everything that 1.1 and 1.0 deprecated, raises the minimum Node.js version and writes down the shape of a validation message as a contract. **It adds no rules and changes no rule set: the same invoice gives the same verdict as with 1.1.0 and the same options.** If you already use `ruleSets` and no deprecated exports, the only thing to check is your Node.js version.

## Breaking changes

| Change | Affects you if | Replacement |
|---|---|---|
| Node.js 22 or newer is required (`engines.node` is `>=22`; 1.x said `>=20`) | you run Node.js 20 or older | Upgrade Node.js. Browsers, Deno, Bun and edge runtimes are not affected by this line. |
| `ValidateOptions.xrechnung` removed | you pass `xrechnung: true` or `false` to `validateInvoice` or `validateMany` | `ruleSets: ["en16931", "xrechnung"]`; just drop `xrechnung: false` |
| CLI flag `--xrechnung` removed | a script runs `summand validate --xrechnung` | `--rule-sets en16931,xrechnung` |
| Info `SUM-DEPRECATED` removed | you filter or assert on this id | Nothing: no result contains it any more |
| Type `CheckOptions` removed from `@sweberdev/summand/rules-check` | you import `CheckOptions` | `RuleSetCheckOptions` (the same type) |
| `ruleSetsFor(detection)` takes no second argument | you called `ruleSetsFor(detection, { xrechnung })` | Pass the rule sets you want to `ruleSets` instead |

There is nothing else in this list. In particular the `SUM-` codes other than `SUM-DEPRECATED`, the names of the fields of results, the exit codes and the `--json` output are unchanged.

## Upgrading steps

1. **Check Node.js.** `node --version` must print v22 or newer, locally, in CI and in your deployment image. Set `"engines": { "node": ">=22" }` in your own package if it depends on Summand.
2. **Move to 1.1.0 first if you are not there yet**, and fix what the deprecation notes (`SUM-DEPRECATED` in `result.infos`, the line on stderr) point at. With 1.1.0 and no `SUM-DEPRECATED` in your results you are done with steps 3 and 4.
3. **Install 2.0.0:** `npm install @sweberdev/summand@2`.
4. **Run your tests and your type check.** TypeScript reports every removed option and type. JavaScript does not, see the first removal below.

## Removed: the `xrechnung` option and `--xrechnung`

`xrechnung: true` forced the XRechnung rules on top of EN 16931 for an invoice that does not declare XRechnung. `ruleSets` does the same and also lets you pick a version.

```ts
// 1.x
validateInvoice(xml, { xrechnung: true });
validateInvoice(xml, { xrechnung: false }); // the default

// 2.0
validateInvoice(xml, { ruleSets: ["en16931", "xrechnung"] });
validateInvoice(xml); // ruleSets: "auto" is the default
```

```bash
# 1.x
summand validate --xrechnung invoice.xml

# 2.0
summand validate --rule-sets en16931,xrechnung invoice.xml
```

A test in 1.1 showed that both forms give identical results, including for profiles that are not EN 16931 compliant (MINIMUM, BASIC WL), where neither form applies a rule set.

**JavaScript callers.** The library checks the removed option at run time: `validateInvoice` returns the error `SUM-RULESET` ("The option xrechnung was removed in 2.0.0") instead of running with fewer rules, so a forgotten `xrechnung: true` cannot silently weaken a check. TypeScript users get a compile error. The CLI treats `--xrechnung` as a usage error with exit code 2 and nothing is validated.

## Removed: `SUM-DEPRECATED`

The info was emitted only for the `xrechnung` option, so it goes with it. If your code deep-equals `result.infos` or counts infos, nothing special is needed any more; the extra entry that you had to filter out in 1.1 is gone. The id will not be reused for anything else.

```ts
// 1.x
const infos = result.infos.filter((i) => i.id !== "SUM-DEPRECATED");

// 2.0
const infos = result.infos;
```

## Removed: `CheckOptions`

```ts
// 1.x
import { checkRuleSets, type CheckOptions } from "@sweberdev/summand/rules-check";
const options: CheckOptions = { timeoutMs: 5000 };

// 2.0
import { checkRuleSets, type RuleSetCheckOptions } from "@sweberdev/summand/rules-check";
const options: RuleSetCheckOptions = { timeoutMs: 5000 };
```

It was a type alias, so only the name changes.

## Changed: Node.js 22 or newer

Summand 1.x supported Node.js 20. 2.0 requires Node.js 22 or newer: `engines` is `>=22`, and CI runs the full suite on Node.js 22 and 24. Package managers that enforce `engines` (pnpm with `engine-strict`, npm with `engine-strict=true`) refuse to install on older versions; others print a warning. The browser build is not tied to a Node.js version: the compiled code targets ES2022.

Versions older than 22 are not tested any more. If 2.0 happens to run there, that is not supported.

## The message contract

Result messages (`errors`, `warnings`, `infos`) already had `id`, `severity` and `ruleSet` in 1.x. 2.0 states them as the contract and the test suite checks it on real results. **No field was renamed or added**; in particular the code is still called `id`, not `code`, so no code that reads results needs to change.

| Field | Contract in 2.0 |
|---|---|
| `id` | The stable code. A rule id of a bundled rule set (`BR-CO-10`, `BR-DE-15`, `UBL-CR-646`) or a `SUM-` code. `SUM-` codes are never renamed or reused. |
| `severity` | `"error"`, `"warning"` or `"info"`, always equal to the list the message is in. |
| `ruleSet` | `"en16931-ubl"`, `"en16931-cii"`, `"xrechnung-ubl"`, `"xrechnung-cii"` or `"summand"`. `"summand"` if and only if the `id` starts with `SUM-`. |

Details and the full code list: [Error codes](../reference/error-codes.md#the-shape-of-a-message-20-contract). What did change in the catalogue: `SUM-DEPRECATED` is gone. The other codes (`SUM-XML`, `SUM-FORMAT`, `SUM-PDF`, `SUM-XSD`, `SUM-PROFILE`, `SUM-EXTENDED`, `SUM-LEITWEG`, `SUM-PDF-LEVEL`, `SUM-RULESET`, `SUM-BATCH`) keep their ids, severities and meanings.

## What 2.0 does not include

Be clear about this before you rely on it:

- **No Peppol Schematron.** The Peppol BIS Billing 3.0 rules (`PEPPOL-EN16931-R...`) are not bundled. Peppol invoices are recognised as a profile and checked against EN 16931 only. Selecting `peppol` in `ruleSets` is an error (`SUM-RULESET`). The 1.1 notes announced Peppol rule sets as planned; they are not part of 2.0.
- **No Factur-X EXTENDED Schematron.** EXTENDED invoices are checked against EN 16931, with violations as warnings by default and errors with `extended: "strict"`. The EXTENDED-specific rules are not checked. The reason is unchanged: we cannot confirm the licence of the FNFE-MPE files, see [Rule sets](rule-sets.md#not-included-factur-x-extended-schematron).

## Support

Corrections for 1.x are planned for 12 months after the release of 2.0.0, as announced with 1.1.0.
