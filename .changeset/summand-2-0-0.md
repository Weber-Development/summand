---
"@sweberdev/summand": major
---

Summand 2.0.0 removes what 1.x deprecated and requires Node.js 22. It adds no rules and changes no rule set: the same invoice gives the same verdict as with 1.1.0 and the same options. If you already use `ruleSets`, no deprecated exports and Node.js 22 or newer, there is nothing to change. The upgrade steps with before and after code are in the [migration guide](https://github.com/Weber-Development/summand/blob/main/docs/guides/migration-2.0.md).

**Breaking changes**

- **Node.js 22 or newer is required** (`engines.node` is `>=22`; 1.x supported 20). CI runs the full suite on Node.js 22 and 24.
- **Removed: the option `xrechnung` and the CLI flag `--xrechnung`.** Use `ruleSets: ["en16931", "xrechnung"]` and `--rule-sets en16931,xrechnung`; the results are identical. `summand validate --xrechnung` is now a usage error (exit code 2). Careful in plain JavaScript: an `xrechnung: true` that is still in your code is ignored without a message and the invoice is then validated with the `"auto"` rule sets, which are fewer rules for an invoice that does not declare XRechnung. TypeScript reports it at compile time.
- **Removed: the info `SUM-DEPRECATED`.** Nothing emits it any more, so `result.infos` no longer carries the extra entry. The id is not reused.
- **Removed: the type `CheckOptions`** of `@sweberdev/summand/rules-check`. Use `RuleSetCheckOptions`, the same type.
- **Changed: `ruleSetsFor(detection)` takes only the detection** (the second argument existed for `xrechnung`).

**Result messages: the contract.** Every message in `errors`, `warnings` and `infos` has a stable `id` (a rule id such as `BR-DE-15`, or a `SUM-` code that is never renamed or reused), a `severity` that always equals the list it is in, and a `ruleSet` (`en16931-ubl`, `en16931-cii`, `xrechnung-ubl`, `xrechnung-cii`, or `summand` exactly for the `SUM-` codes). These fields already existed; 2.0 documents them as the contract, checks them with a test, and renames nothing. The code field is still called `id`.

**Not included, as before.** The Peppol BIS Billing 3.0 Schematron rules are not bundled: Peppol invoices are recognised and checked against EN 16931 only, and `peppol` in `ruleSets` is an error (`SUM-RULESET`). The Factur-X EXTENDED Schematron is not bundled either (we cannot confirm the licence of the FNFE-MPE files); EXTENDED invoices are checked against EN 16931, with violations as warnings by default. The 1.1 notes announced Peppol rule sets as planned; they are not part of 2.0.
