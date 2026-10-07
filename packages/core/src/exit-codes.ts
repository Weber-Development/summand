/**
 * Exit codes of the `summand` command. Documented in docs/reference/error-codes.md; a test checks
 * that every code is listed there. Exit code 2 is reserved and not used.
 */
export const EXIT_CODES = {
  /** Success: every invoice is valid, or the command did what was asked. */
  ok: 0,
  /** An invoice is invalid, a warning counted with `--warnings-as-errors`, or the command failed (usage error, unreadable file). */
  failed: 1,
  /** `summand rules --check --fail-on-outdated`: a newer upstream release exists. */
  outdated: 3,
} as const;
