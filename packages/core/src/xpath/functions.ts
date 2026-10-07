import { stringValue, type XNode } from "../xml";
import { Decimal } from "./decimal";
import {
  type Atomic,
  atomize,
  castTo,
  type Env,
  ebv,
  type Item,
  isNode,
  isNumeric,
  type Sequence,
  stringOf,
  toDouble,
  Untyped,
  XPathError,
  type XPathFunction,
} from "./eval";

const one = (seq: Sequence | undefined): Item | undefined => {
  if (!seq || seq.length === 0) return undefined;
  if (seq.length > 1) throw new XPathError("XPTY0004", "Expected at most one item");
  return seq[0];
};

const str = (seq: Sequence | undefined): string => {
  const v = one(seq);
  return v === undefined ? "" : stringOf(v);
};

const contextString = (env: Env, args: Sequence[]): string => {
  if (args.length > 0) return str(args[0]);
  if (env.item === undefined) throw new XPathError("XPDY0002", "No context item");
  return stringOf(env.item);
};

const contextNodeOf = (env: Env, args: Sequence[]): XNode | undefined => {
  const v = args.length > 0 ? one(args[0]) : env.item;
  if (v === undefined) return undefined;
  if (!isNode(v)) throw new XPathError("XPTY0004", "Expected a node");
  return v;
};

const num = (seq: Sequence | undefined): Atomic | undefined => {
  const v = one(seq);
  if (v === undefined) return undefined;
  const a = isNode(v) ? new Untyped(stringValue(v)) : v;
  return a instanceof Untyped ? toDouble(a) : a;
};

/**
 * Translates an XML Schema / XPath regular expression to a JavaScript RegExp.
 *
 * @beta
 */
export function xpathRegex(pattern: string, flags = "", global = false): RegExp {
  let source = pattern;
  if (flags.includes("x")) source = source.replace(/\s+/g, "");
  // XML Schema name character classes.
  source = source
    .replace(/\\i/g, "[A-Za-z_:\\u00C0-\\uFFFF]")
    .replace(/\\c/g, "[A-Za-z0-9_:.\\-\\u00B7\\u00C0-\\uFFFF]")
    .replace(/\\I/g, "[^A-Za-z_:\\u00C0-\\uFFFF]")
    .replace(/\\C/g, "[^A-Za-z0-9_:.\\-\\u00B7\\u00C0-\\uFFFF]");
  let jsFlags = global ? "g" : "";
  if (flags.includes("i")) jsFlags += "i";
  if (flags.includes("m")) jsFlags += "m";
  if (flags.includes("s")) jsFlags += "s";
  try {
    return new RegExp(source, `${jsFlags}u`);
  } catch {
    try {
      return new RegExp(source, jsFlags);
    } catch (e) {
      throw new XPathError(
        "FORX0002",
        `Invalid regular expression ${pattern}: ${(e as Error).message}`,
      );
    }
  }
}

const regexCache = new Map<string, RegExp>();
function cachedRegex(pattern: string, flags: string, global: boolean): RegExp {
  const key = `${global ? "g" : ""}${flags}\u0000${pattern}`;
  let r = regexCache.get(key);
  if (!r) {
    r = xpathRegex(pattern, flags, global);
    regexCache.set(key, r);
  }
  r.lastIndex = 0;
  return r;
}

function round(v: Atomic | undefined, precision = 0): Sequence {
  if (v === undefined) return [];
  if (v instanceof Decimal) return [v.round(precision)];
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return [v];
    const f = 10 ** precision;
    return [Math.floor(v * f + 0.5) / f];
  }
  throw new XPathError("XPTY0004", "round() expects a number");
}

function sum(values: Atomic[]): Atomic {
  let acc: Atomic = Decimal.ZERO;
  for (const raw of values) {
    const v = raw instanceof Untyped ? toDouble(raw) : raw;
    if (!isNumeric(v)) throw new XPathError("FORG0006", "sum() of non-numeric values");
    if (acc instanceof Decimal && v instanceof Decimal) acc = acc.add(v);
    else acc = toDouble(acc) + toDouble(v);
  }
  return acc;
}

function compareForMinMax(a: Atomic, b: Atomic): number {
  if (isNumeric(a) && isNumeric(b)) {
    if (a instanceof Decimal && b instanceof Decimal) return a.compare(b);
    return toDouble(a) - toDouble(b);
  }
  const x = stringOf(a);
  const y = stringOf(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function distinctKey(v: Atomic): string {
  if (v instanceof Decimal) return `n:${v.toString()}`;
  if (typeof v === "number") {
    const d = Decimal.fromNumber(v);
    return d ? `n:${d.toString()}` : `d:${v}`;
  }
  if (typeof v === "boolean") return `b:${v}`;
  return `s:${v.toString()}`;
}

const fns: Record<string, XPathFunction> = {
  "fn:true": () => [true],
  "fn:false": () => [false],
  "fn:not": (_e, [a]) => [!ebv(a ?? [])],
  "fn:boolean": (_e, [a]) => [ebv(a ?? [])],
  "fn:exists": (_e, [a]) => [(a ?? []).length > 0],
  "fn:empty": (_e, [a]) => [(a ?? []).length === 0],
  "fn:count": (_e, [a]) => [Decimal.fromInt((a ?? []).length)],
  "fn:sum": (_e, [a, zero]) => {
    const values = atomize(a ?? []);
    if (values.length === 0) return zero ?? [Decimal.ZERO];
    return [sum(values)];
  },
  "fn:avg": (_e, [a]) => {
    const values = atomize(a ?? []);
    if (values.length === 0) return [];
    const total = sum(values);
    return [
      total instanceof Decimal
        ? (total.div(Decimal.fromInt(values.length)) as Decimal)
        : toDouble(total) / values.length,
    ];
  },
  "fn:min": (_e, [a]) => {
    const values = atomize(a ?? []).map((v) => (v instanceof Untyped ? toDouble(v) : v));
    if (values.length === 0) return [];
    return [values.reduce((m, v) => (compareForMinMax(v, m) < 0 ? v : m))];
  },
  "fn:max": (_e, [a]) => {
    const values = atomize(a ?? []).map((v) => (v instanceof Untyped ? toDouble(v) : v));
    if (values.length === 0) return [];
    return [values.reduce((m, v) => (compareForMinMax(v, m) > 0 ? v : m))];
  },
  "fn:round": (_e, [a, p]) => round(num(a), p ? Number(toDouble(num(p) ?? 0)) : 0),
  "fn:round-half-to-even": (_e, [a, p]) => {
    const v = num(a);
    if (v === undefined) return [];
    const precision = p ? Number(toDouble(num(p) ?? 0)) : 0;
    if (v instanceof Decimal) return [v.roundHalfEven(precision)];
    const d = Decimal.fromNumber(toDouble(v));
    return d ? [d.roundHalfEven(precision).toNumber()] : [v];
  },
  "fn:abs": (_e, [a]) => {
    const v = num(a);
    if (v === undefined) return [];
    if (v instanceof Decimal) return [v.abs()];
    return [Math.abs(toDouble(v))];
  },
  "fn:floor": (_e, [a]) => {
    const v = num(a);
    if (v === undefined) return [];
    return [v instanceof Decimal ? v.floor() : Math.floor(toDouble(v))];
  },
  "fn:ceiling": (_e, [a]) => {
    const v = num(a);
    if (v === undefined) return [];
    return [v instanceof Decimal ? v.ceiling() : Math.ceil(toDouble(v))];
  },
  "fn:number": (env, args) => {
    const v = args.length ? one(args[0]) : env.item;
    if (v === undefined) return [Number.NaN];
    return [toDouble(isNode(v) ? new Untyped(stringValue(v)) : v)];
  },
  "fn:string": (env, args) => [contextString(env, args)],
  "fn:data": (_e, [a]) => atomize(a ?? []),
  "fn:string-length": (env, args) => [Decimal.fromInt([...contextString(env, args)].length)],
  "fn:normalize-space": (env, args) => [
    contextString(env, args)
      .replace(/[ \t\n\r]+/g, " ")
      .replace(/^ | $/g, ""),
  ],
  "fn:upper-case": (_e, [a]) => [str(a).toUpperCase()],
  "fn:lower-case": (_e, [a]) => [str(a).toLowerCase()],
  "fn:contains": (_e, [a, b]) => [str(a).includes(str(b))],
  "fn:starts-with": (_e, [a, b]) => [str(a).startsWith(str(b))],
  "fn:ends-with": (_e, [a, b]) => [str(a).endsWith(str(b))],
  "fn:substring-before": (_e, [a, b]) => {
    const s = str(a);
    const t = str(b);
    const i = s.indexOf(t);
    return [i === -1 || t === "" ? "" : s.slice(0, i)];
  },
  "fn:substring-after": (_e, [a, b]) => {
    const s = str(a);
    const t = str(b);
    if (t === "") return [s];
    const i = s.indexOf(t);
    return [i === -1 ? "" : s.slice(i + t.length)];
  },
  "fn:substring": (_e, [a, start, length]) => {
    const chars = [...str(a)];
    const s = toDouble(num(start) ?? Number.NaN);
    const rs = Math.floor(s + 0.5);
    if (Number.isNaN(rs)) return [""];
    let end = Number.POSITIVE_INFINITY;
    if (length) {
      const l = toDouble(num(length) ?? Number.NaN);
      if (Number.isNaN(l)) return [""];
      end = rs + Math.floor(l + 0.5);
    }
    let out = "";
    chars.forEach((c, i) => {
      const pos = i + 1;
      if (pos >= rs && pos < end) out += c;
    });
    return [out];
  },
  "fn:concat": (_e, args) => [args.map((a) => str(a)).join("")],
  "fn:string-join": (_e, [a, sep]) => [
    atomize(a ?? [])
      .map((v) => stringOf(v))
      .join(sep ? str(sep) : ""),
  ],
  "fn:translate": (_e, [a, from, to]) => {
    const f = [...str(from)];
    const t = [...str(to)];
    return [
      [...str(a)]
        .map((c) => {
          const i = f.indexOf(c);
          if (i === -1) return c;
          return t[i] ?? "";
        })
        .join(""),
    ];
  },
  "fn:matches": (_e, [a, pattern, flags]) => [
    cachedRegex(str(pattern), str(flags), false).test(str(a)),
  ],
  "fn:replace": (_e, [a, pattern, replacement, flags]) => {
    const re = cachedRegex(str(pattern), str(flags), true);
    const rep = str(replacement);
    return [
      str(a).replace(re, (...m: unknown[]) => {
        const tail = typeof m[m.length - 1] === "object" ? 3 : 2;
        const groups = m.slice(0, -tail) as Array<string | undefined>;
        let out = "";
        for (let i = 0; i < rep.length; i++) {
          const c = rep[i];
          if (c === "\\" && (rep[i + 1] === "$" || rep[i + 1] === "\\")) {
            i++;
            out += rep[i];
          } else if (c === "$") {
            let j = i + 1;
            while (j < rep.length && /[0-9]/.test(rep[j] as string)) j++;
            if (j === i + 1) throw new XPathError("FORX0004", "Invalid replacement string");
            out += groups[Number(rep.slice(i + 1, j))] ?? "";
            i = j - 1;
          } else out += c;
        }
        return out;
      }),
    ];
  },
  "fn:tokenize": (_e, [a, pattern, flags]) => {
    const s = str(a);
    if (s === "") return [];
    const re = cachedRegex(str(pattern), str(flags), true);
    const out: string[] = [];
    let last = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      if (m[0] === "") {
        re.lastIndex++;
        continue;
      }
      out.push(s.slice(last, m.index));
      last = m.index + m[0].length;
    }
    out.push(s.slice(last));
    return out;
  },
  "fn:distinct-values": (_e, [a]) => {
    const seen = new Set<string>();
    const out: Atomic[] = [];
    for (const raw of atomize(a ?? [])) {
      const v = raw instanceof Untyped ? raw.value : raw;
      const key = distinctKey(v);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(v);
      }
    }
    return out;
  },
  "fn:index-of": (_e, [a, b]) => {
    const target = str(b);
    const out: Sequence = [];
    atomize(a ?? []).forEach((v, i) => {
      if (stringOf(v) === target) out.push(Decimal.fromInt(i + 1));
    });
    return out;
  },
  "fn:reverse": (_e, [a]) => [...(a ?? [])].reverse(),
  "fn:subsequence": (_e, [a, start, length]) => {
    const s = Math.round(toDouble(num(start) ?? 1));
    const l = length ? Math.round(toDouble(num(length) ?? 0)) : Number.POSITIVE_INFINITY;
    return (a ?? []).filter((_v, i) => i + 1 >= s && i + 1 < s + l);
  },
  "fn:exactly-one": (_e, [a]) => {
    if ((a ?? []).length !== 1)
      throw new XPathError(
        "FORG0005",
        "exactly-one() called with a sequence that is not of length one",
      );
    return a as Sequence;
  },
  "fn:zero-or-one": (_e, [a]) => {
    if ((a ?? []).length > 1)
      throw new XPathError("FORG0003", "zero-or-one() called with more than one item");
    return a ?? [];
  },
  "fn:one-or-more": (_e, [a]) => {
    if ((a ?? []).length === 0)
      throw new XPathError("FORG0004", "one-or-more() called with an empty sequence");
    return a as Sequence;
  },
  "fn:position": (env) => [Decimal.fromInt(env.position)],
  "fn:last": (env) => [Decimal.fromInt(env.size)],
  "fn:current": (env) => (env.current === undefined ? [] : [env.current]),
  "fn:name": (env, args) => {
    const n = contextNodeOf(env, args);
    if (!n || (n.kind !== "element" && n.kind !== "attribute" && n.kind !== "pi")) return [""];
    return [n.prefix ? `${n.prefix}:${n.local}` : n.local];
  },
  "fn:local-name": (env, args) => {
    const n = contextNodeOf(env, args);
    return [
      n && (n.kind === "element" || n.kind === "attribute" || n.kind === "pi") ? n.local : "",
    ];
  },
  "fn:namespace-uri": (env, args) => {
    const n = contextNodeOf(env, args);
    return [n ? n.ns : ""];
  },
  "fn:root": (env, args) => {
    let n = contextNodeOf(env, args);
    if (!n) return [];
    while (n.parent) n = n.parent;
    return [n];
  },
  "fn:string-to-codepoints": (_e, [a]) =>
    [...str(a)].map((c) => Decimal.fromInt(c.codePointAt(0) as number)),
  "fn:codepoints-to-string": (_e, [a]) => [
    String.fromCodePoint(...atomize(a ?? []).map((v) => toDouble(v))),
  ],
  "fn:compare": (_e, [a, b]) => {
    if (!(a ?? []).length || !(b ?? []).length) return [];
    const x = str(a);
    const y = str(b);
    return [Decimal.fromInt(x < y ? -1 : x > y ? 1 : 0)];
  },
  "fn:deep-equal": (_e, [a, b]) => {
    const x = atomize(a ?? []).map(stringOf);
    const y = atomize(b ?? []).map(stringOf);
    return [x.length === y.length && x.every((v, i) => v === y[i])];
  },
  "fn:year-from-date": (_e, [a]) => {
    const v = one(a);
    if (v === undefined) return [];
    return [Decimal.fromInt(Number.parseInt(stringOf(v).slice(0, 4), 10))];
  },
  "fn:current-date": () => {
    const d = new Date().toISOString().slice(0, 10);
    return [castTo(d, "xs:date")];
  },
};

for (const type of [
  "decimal",
  "integer",
  "string",
  "double",
  "float",
  "boolean",
  "date",
  "dateTime",
  "anyURI",
  "token",
  "normalizedString",
  "untypedAtomic",
]) {
  fns[`xs:${type}`] = (_e, [a]) => {
    const v = atomize(a ?? []);
    if (v.length === 0) return [];
    return [castTo(v[0] as Atomic, `xs:${type}`)];
  };
}

/**
 * The built-in function library (fn: and xs: functions), keyed like "{uri}local#arity".
 *
 * @beta
 */
export const builtinFunctions: ReadonlyMap<string, XPathFunction> = new Map(Object.entries(fns));
