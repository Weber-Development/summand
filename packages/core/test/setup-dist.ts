/**
 * Vitest global setup: the batch tests start real worker threads, which load the built
 * `dist/batch-worker.js`. CI builds before testing; locally this builds when `dist` is missing or
 * older than the sources, so that `pnpm test` works in a fresh checkout.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function newest(dir: string): number {
  return readdirSync(dir).reduce((latest, name) => {
    const path = join(dir, name);
    const stat = statSync(path);
    return Math.max(latest, stat.isDirectory() ? newest(path) : stat.mtimeMs);
  }, 0);
}

export default function setup(): void {
  const worker = join(root, "dist/batch-worker.js");
  if (existsSync(worker) && statSync(worker).mtimeMs >= newest(join(root, "src"))) return;
  const build = spawnSync("pnpm", ["exec", "tsup"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) throw new Error("Building dist for the batch tests failed (pnpm build)");
}
