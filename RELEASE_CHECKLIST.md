# Release checklist (package-launch)

| Item | Status |
|---|---|
| Repo `Weber-Development/summand` | created by the Werkbank workflow `new-package` (secret `NPM_TOKEN` set there); make public before the first npm release (provenance) |
| npm `@sweberdev/summand` | 1.0.0 via the major changeset `.changeset/summand-1-0-0.md` (published versions 0.1.0 to 0.9.0 are the lead-up) |
| packages.sweber.dev | entry, docs and live demo at packages.sweber.dev/summand (portfoliov3 PR) |
| Docs | Markdown in `docs/` with `nav.json`; Pro pages under `docs/pro/` |
| Pro | `@weber-development/summand-{read,view,inbox}` in `Weber-Development/summand-pro`, customers via `summand-pro-dist` |
| Prices | Freelancer 19 CHF/month or 190/year, Agency 59/590, Lifetime 1'990 CHF (Seya, 2026-10-05) |
| Polar | config in Werkbank `packages/summand.json`; benefit "Summand Pro" to be created by Seya |
| Blog post | `content/blog/summand-1-0-0-released.md` in portfoliov3, after 1.0.0 is on npm: exit code change first, then the stability policy (package-launch: major update) |
| Trademark check "Summand" | open (Seya) |
| Licence review | open (Seya): bundled rule sets are EUPL-1.2 (CEN) and Apache-2.0 (KoSIT), see `packages/core/NOTICE.md` |

## Updating the rule sets

1. Replace the files in `packages/core/rules-src/` with the new release (keep the licence files).
2. `pnpm rules`, then `pnpm test` (CEN unit tests and KoSIT test suite fixtures should be updated too).
3. Update the versions in `packages/core/rules-src/sources.json` (the single record; `pnpm rules` writes them to `src/rules/info.json` and checks them against the vendored files and `NOTICE.md`), then `NOTICE.md` and `docs/reference/rule-sets.md`; changeset (minor).

## Updating the XML Schemas

1. Replace the XSD files in `packages/core/schemas-src/` (keep the `LICENSE.md` files, update their source notes).
2. `pnpm schemas` (fails loudly on XSD constructs the compiler does not support), then `pnpm test`.
3. Update `src/schemas/index.ts`, `NOTICE.md` and `docs/reference/rule-sets.md`; changeset (minor).

## Changing the public API

The API snapshots in `packages/core/test/api/` fail CI on any change to an export, its type, the CLI help or the exit codes. After an intended change: `pnpm --filter @sweberdev/summand exec vitest run -u test/api.test.ts`, review the diff of `test/api/`, update `docs/reference/api.md` (a test checks it lists exactly the exports) and describe the change in the changeset. A new `SUM-` code needs an entry in `docs/reference/error-codes.md` (also tested). Removing or renaming a stable export is a major change; deprecate first (`@deprecated Use ... Removed in N.0.0.`).
