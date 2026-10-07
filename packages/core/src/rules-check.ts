/**
 * Asks the public GitHub API whether the upstream projects of the bundled rule sets have newer
 * releases. Nothing is downloaded or installed, and nothing about an invoice is sent: each
 * request is a plain GET of a public release list. This module is a separate entry point
 * (`@sweberdev/summand/rules-check`) so that the main bundle does not carry it.
 */

import type { RuleSetId } from "./rules/index";
import info from "./rules/info.json";

/**
 * Result of checking one rule set: "up-to-date", "outdated" (a newer upstream release exists) or
 * "unknown" (the check failed).
 */
export type RuleSetCheckStatus = "up-to-date" | "outdated" | "unknown";

/** The outcome of checking one bundled rule set against its upstream project. */
export interface RuleSetCheck {
  /** Id of the rule set, as in `RuleSetInfo.id`. */
  id: RuleSetId;
  /** Version bundled with this Summand release. */
  version: string;
  /** Whether the bundled version is current. */
  status: RuleSetCheckStatus;
  /** The newest release tag found upstream (set when `status` is "outdated"). */
  latest?: string;
  /** Why the check failed (set when `status` is "unknown"). */
  reason?: string;
}

/**
 * The part of the fetch API {@link checkRuleSets} needs: a function from URL to a response with
 * `ok`, `status` and `json()`. Pass your own to run offline or behind a proxy.
 */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Options of {@link checkRuleSets}. All are optional. */
export interface RuleSetCheckOptions {
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Per request, in milliseconds. Default 10000. */
  timeoutMs?: number;
  /** Optional GitHub token to raise the API rate limit. It is only sent to api.github.com. */
  token?: string;
}

/**
 * Former name of {@link RuleSetCheckOptions}.
 *
 * @deprecated Use `RuleSetCheckOptions`. The alias will be removed in 2.0.0.
 */
export type CheckOptions = RuleSetCheckOptions;

// Release tags that name a rule set version. Others (for example tags of other artefacts in the
// same repository) are ignored.
const TAGS: Record<string, RegExp> = {
  "ConnectingEurope/eInvoicing-EN16931": /^(?:validation-)?v?(\d+\.\d+\.\d+)$/,
  "itplr-kosit/xrechnung-schematron": /^(?:release-)?v?(\d+\.\d+\.\d+)$/,
};

function compareVersions(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

interface Latest {
  tag: string;
  version: string;
}

async function getJson(
  fetchFn: FetchLike,
  url: string,
  options: RuleSetCheckOptions,
): Promise<unknown[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetchFn(url, {
    headers,
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 403 || response.status === 429
        ? `HTTP ${response.status} (GitHub API rate limit?)`
        : `HTTP ${response.status}`,
    );
  }
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error("unexpected response");
  return body;
}

function newest(entries: unknown[], field: string, pattern: RegExp): Latest | undefined {
  let best: Latest | undefined;
  for (const entry of entries) {
    const e = entry as Record<string, unknown>;
    if (e.draft === true || e.prerelease === true) continue;
    const tag = e[field];
    if (typeof tag !== "string") continue;
    const version = pattern.exec(tag)?.[1];
    if (version && (!best || compareVersions(version, best.version) > 0)) best = { tag, version };
  }
  return best;
}

async function latestRelease(
  fetchFn: FetchLike,
  repository: string,
  options: RuleSetCheckOptions,
): Promise<Latest> {
  const pattern = TAGS[repository] as RegExp;
  const base = `https://api.github.com/repos/${repository}`;
  const releases = await getJson(fetchFn, `${base}/releases?per_page=30`, options);
  const fromReleases = newest(releases, "tag_name", pattern);
  if (fromReleases) return fromReleases;
  // Some projects only push tags.
  const tags = await getJson(fetchFn, `${base}/tags?per_page=30`, options);
  const fromTags = newest(tags, "name", pattern);
  if (fromTags) return fromTags;
  throw new Error("no release tag recognised");
}

/**
 * Checks every bundled rule set against the newest upstream release. Never throws for network
 * problems: a failed check is reported as `status: "unknown"` with a reason.
 */
export async function checkRuleSets(options: RuleSetCheckOptions = {}): Promise<RuleSetCheck[]> {
  const fetchFn: FetchLike | undefined =
    options.fetch ?? (typeof fetch === "function" ? (fetch as unknown as FetchLike) : undefined);
  const sets = Object.values(info) as Array<{
    id: RuleSetId;
    version: string;
    source: string;
  }>;
  const repositories = [...new Set(sets.map((s) => s.source.replace("https://github.com/", "")))];
  const results = new Map<string, Latest | Error>();
  await Promise.all(
    repositories.map(async (repository) => {
      try {
        if (!fetchFn || !TAGS[repository]) throw new Error("no fetch available");
        results.set(repository, await latestRelease(fetchFn, repository, options));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.set(
          repository,
          new Error(/abort|timeout/i.test(message) ? "request timed out" : message),
        );
      }
    }),
  );
  return sets.map((s) => {
    const found = results.get(s.source.replace("https://github.com/", "")) as Latest | Error;
    if (found instanceof Error)
      return { id: s.id, version: s.version, status: "unknown", reason: found.message };
    return compareVersions(found.version, s.version) > 0
      ? { id: s.id, version: s.version, status: "outdated", latest: found.tag }
      : { id: s.id, version: s.version, status: "up-to-date" };
  });
}
