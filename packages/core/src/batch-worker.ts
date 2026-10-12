/**
 * Worker thread of `validateMany` (see batch.ts). Not an entry point of the package: it is loaded
 * by `@sweberdev/summand/batch` and receives `{ index, item }` messages.
 */
import { readFileSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import { validateInvoice } from "./validate";

const options = (workerData as { options: Parameters<typeof validateInvoice>[1] }).options;

parentPort?.on(
  "message",
  ({
    index,
    item,
  }: {
    index: number;
    item: string | { name: string; data: Parameters<typeof validateInvoice>[0] };
  }) => {
    try {
      const input = typeof item === "string" ? new Uint8Array(readFileSync(item)) : item.data;
      parentPort?.postMessage({ index, result: validateInvoice(input, options) });
    } catch (e) {
      parentPort?.postMessage({ index, error: e instanceof Error ? e.message : String(e) });
    }
  },
);
