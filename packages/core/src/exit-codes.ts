/**
 * Exit codes of the `summand` command, the same split as ESLint. Documented in
 * docs/reference/error-codes.md; a test checks that every code is listed there.
 */
export const EXIT_CODES = {
  /** Success: every invoice is valid, or the command did what was asked. */
  ok: 0,
  /** Findings: an invoice is invalid (or has warnings with `--warnings-as-errors`), or `leitweg` got an invalid ID. */
  invalid: 1,
  /** The command could not run: usage error, unknown command or flag, unreadable file, `extract` without embedded XML, internal failure. */
  error: 2,
  /** `summand rules --check --fail-on-outdated`: a newer upstream release exists. */
  outdated: 3,
} as const;
