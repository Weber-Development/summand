import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/xpath.ts",
    "src/rules-check.ts",
    "src/batch.ts",
    "src/batch-worker.ts",
    "src/cli.ts",
    "src/bin.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  // batch.ts locates its worker with import.meta.url, which the CommonJS build needs shimmed.
  shims: true,
});
