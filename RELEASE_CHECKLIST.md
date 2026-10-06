# Release checklist (package-launch)

| Item | Status |
|---|---|
| Repo `Weber-Development/summand` | created by the Werkbank workflow `new-package` (secret `NPM_TOKEN` set there); make public before the first npm release (provenance) |
| npm `@sweberdev/summand` | 0.1.0 via the first changeset |
| packages.sweber.dev | entry, docs and live demo at packages.sweber.dev/summand (portfoliov3 PR) |
| Docs | Markdown in `docs/` with `nav.json`; Pro pages under `docs/pro/` |
| Pro | `@weber-development/summand-{read,view,inbox}` in `Weber-Development/summand-pro`, customers via `summand-pro-dist` |
| Prices | Freelancer 19 CHF/month or 190/year, Agency 59/590, Lifetime 1'990 CHF (Seya, 2026-10-05) |
| Polar | config in Werkbank `packages/summand.json`; benefit "Summand Pro" to be created by Seya |
| Blog post | `content/blog/summand-0-1-0-released.md` in portfoliov3, after 0.1.0 is on npm |
| Trademark check "Summand" | open (Seya) |
| Licence review | open (Seya): bundled rule sets are EUPL-1.2 (CEN) and Apache-2.0 (KoSIT), see `packages/core/NOTICE.md` |

## Updating the rule sets

1. Replace the files in `packages/core/rules-src/` with the new release (keep the licence files).
2. `pnpm rules`, then `pnpm test` (CEN unit tests and KoSIT test suite fixtures should be updated too).
3. Update versions in `src/rules/index.ts`, `NOTICE.md` and `docs/reference/rule-sets.md`; changeset (minor).

## Updating the XML Schemas

1. Replace the XSD files in `packages/core/schemas-src/` (keep the `LICENSE.md` files, update their source notes).
2. `pnpm schemas` (fails loudly on XSD constructs the compiler does not support), then `pnpm test`.
3. Update `src/schemas/index.ts`, `NOTICE.md` and `docs/reference/rule-sets.md`; changeset (minor).
