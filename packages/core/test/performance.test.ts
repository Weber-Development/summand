import { describe, expect, it } from "vitest";
import { generateInvoice } from "../bench/generate";
import { validateInvoice } from "../src/validate";

// A regression guard, not a benchmark: 1,000 lines take about one second on a developer machine.
// Before the document index and the memoised absolute paths they took 5 to 30 seconds, so a
// budget of 10 seconds is far above normal variation and still fails if that quadratic work
// comes back. Real numbers: `pnpm bench` and docs/guides/performance.md.
describe("large invoices", () => {
  for (const syntax of ["ubl", "cii"] as const) {
    it(`validates 1,000 ${syntax.toUpperCase()} lines within the time budget`, () => {
      const xml = generateInvoice(syntax, "xrechnung", 1000);
      const started = performance.now();
      const result = validateInvoice(xml);
      const elapsed = performance.now() - started;
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
      expect(result.summary?.lineCount).toBe(1000);
      expect(elapsed).toBeLessThan(10_000);
    });
  }
});
