/**
 * Translates XML Schema regular expressions (XSD 1.0 Part 2, Appendix F) into JavaScript.
 *
 * XSD patterns are implicitly anchored, have no ^ / $ anchors (both are ordinary characters), and
 * add the escapes \i \I \c \C (XML name characters) and character class subtraction
 * ([a-z-[aeiou]]). The result uses the "u" flag. Subtraction becomes a negative lookahead.
 * Constructs JavaScript cannot express (Unicode block escapes such as \p{IsBasicLatin}, and the
 * negated multi-character escapes \S \I \C \w inside a character class) make the translation
 * return null; callers then treat the facet as unsupported.
 */

const NAME_START =
  ":A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const NAME_CHAR = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;

/** Escapes outside a class: positive form usable inside a JS class, and a standalone form. */
const MULTI: Record<string, { inClass: string | null; atom: string }> = {
  s: { inClass: " \\t\\n\\r", atom: "[ \\t\\n\\r]" },
  S: { inClass: null, atom: "[^ \\t\\n\\r]" },
  i: { inClass: NAME_START, atom: `[${NAME_START}]` },
  I: { inClass: null, atom: `[^${NAME_START}]` },
  c: { inClass: NAME_CHAR, atom: `[${NAME_CHAR}]` },
  C: { inClass: null, atom: `[^${NAME_CHAR}]` },
  d: { inClass: "\\p{Nd}", atom: "\\p{Nd}" },
  D: { inClass: "\\P{Nd}", atom: "\\P{Nd}" },
  w: { inClass: null, atom: "[^\\p{P}\\p{Z}\\p{C}]" },
  W: { inClass: "\\p{P}\\p{Z}\\p{C}", atom: "[\\p{P}\\p{Z}\\p{C}]" },
};

const SINGLE: Record<string, string> = { n: "\n", r: "\r", t: "\t" };
const ESCAPABLE = "\\|.-^?*+{}()[]";

class Unsupported extends Error {}

function literal(ch: string, inClass: boolean): string {
  if (ch === "\n") return "\\n";
  if (ch === "\r") return "\\r";
  if (ch === "\t") return "\\t";
  const special = inClass ? "\\]-[^" : "\\^$.|?*+()[]{}/";
  return special.includes(ch) ? `\\${ch}` : ch;
}

/** Returns an anchored JavaScript regex source (to be used with the "u" flag), or null. */
export function translateXsdPattern(pattern: string): string | null {
  const chars = Array.from(pattern);
  let pos = 0;
  const peek = () => chars[pos];
  const fail = (message: string): never => {
    throw new SyntaxError(`Invalid XSD pattern ${JSON.stringify(pattern)}: ${message}`);
  };

  // \p{..} / \P{..}; the backslash and p/P are already consumed.
  const property = (negated: boolean): string => {
    if (peek() !== "{") fail("expected { after \\p");
    const end = chars.indexOf("}", pos);
    if (end === -1) fail("unterminated \\p{");
    const name = chars.slice(pos + 1, end).join("");
    pos = end + 1;
    if (name.startsWith("Is")) throw new Unsupported(`Unicode block ${name}`);
    if (!/^(?:[LMNPZSC][a-z]?)$/.test(name)) fail(`unknown category ${name}`);
    return `\\${negated ? "P" : "p"}{${name}}`;
  };

  // Escape inside a class: returns the JS fragment to put inside [...].
  const classEscape = (): string => {
    const c = chars[pos++];
    if (c === undefined) fail("trailing backslash");
    const ch = c as string;
    if (ch === "p" || ch === "P") return property(ch === "P");
    const multi = MULTI[ch];
    if (multi) {
      if (multi.inClass === null) throw new Unsupported(`\\${ch} inside a character class`);
      return multi.inClass;
    }
    if (SINGLE[ch]) return literal(SINGLE[ch] as string, true);
    if (ESCAPABLE.includes(ch)) return literal(ch, true);
    return fail(`unknown escape \\${ch}`);
  };

  // Single character of a range (literal or single-char escape); null if not a single char.
  const classChar = (): { js: string; single: boolean } => {
    const ch = chars[pos];
    if (ch === "\\") {
      pos++;
      const next = chars[pos];
      if (next !== undefined && (SINGLE[next] || ESCAPABLE.includes(next))) {
        pos++;
        return { js: literal(SINGLE[next] ?? next, true), single: true };
      }
      return { js: classEscape(), single: false };
    }
    if (ch === undefined) fail("unterminated character class");
    pos++;
    return { js: literal(ch as string, true), single: true };
  };

  // Parses a class after "[" up to and including "]". Returns a JS atom.
  const charClass = (): string => {
    let negated = false;
    if (peek() === "^") {
      negated = true;
      pos++;
    }
    let body = "";
    let first = true;
    for (;;) {
      const ch = peek();
      if (ch === undefined) fail("unterminated character class");
      if (ch === "]" && !first) {
        pos++;
        return `[${negated ? "^" : ""}${body}]`;
      }
      if (ch === "-" && chars[pos + 1] === "[" && !first) {
        // Subtraction: [base-[sub]]
        pos += 2;
        const sub = charClass();
        if (peek() !== "]") fail("subtraction must end the character class");
        pos++;
        return `(?:(?!${sub})[${negated ? "^" : ""}${body}])`;
      }
      first = false;
      const start = classChar();
      if (start.single && peek() === "-" && chars[pos + 1] !== "]" && chars[pos + 1] !== "[") {
        pos++;
        const end = classChar();
        if (!end.single) fail("invalid range");
        body += `${start.js}-${end.js}`;
      } else {
        body += start.js;
      }
    }
  };

  const atom = (): string => {
    const ch = chars[pos++] as string;
    if (ch === "(") {
      const inner = regExp();
      if (peek() !== ")") fail("missing )");
      pos++;
      return `(?:${inner})`;
    }
    if (ch === "[") return charClass();
    if (ch === ".") return "[^\\n\\r]";
    if (ch === "\\") {
      const e = chars[pos++];
      if (e === undefined) fail("trailing backslash");
      const esc = e as string;
      if (esc === "p" || esc === "P") return property(esc === "P");
      const multi = MULTI[esc];
      if (multi) return multi.atom;
      if (SINGLE[esc]) return literal(SINGLE[esc] as string, false);
      if (ESCAPABLE.includes(esc)) return literal(esc, false);
      return fail(`unknown escape \\${esc}`);
    }
    if ("?*+{}])|".includes(ch)) fail(`unexpected ${ch}`);
    return literal(ch, false);
  };

  const quantifier = (): string => {
    const ch = peek();
    if (ch === "?" || ch === "*" || ch === "+") {
      pos++;
      return ch;
    }
    if (ch === "{") {
      const end = chars.indexOf("}", pos);
      if (end === -1) fail("unterminated quantifier");
      const q = chars.slice(pos + 1, end).join("");
      if (!/^\d+(,\d*)?$/.test(q)) fail(`invalid quantifier {${q}}`);
      pos = end + 1;
      return `{${q}}`;
    }
    return "";
  };

  const branch = (): string => {
    let out = "";
    while (pos < chars.length && peek() !== "|" && peek() !== ")") {
      out += atom() + quantifier();
    }
    return out;
  };

  const regExp = (): string => {
    let out = branch();
    while (peek() === "|") {
      pos++;
      out += `|${branch()}`;
    }
    return out;
  };

  try {
    const body = regExp();
    if (pos < chars.length) fail(`unexpected ${chars[pos]}`);
    const source = `^(?:${body})$`;
    new RegExp(source, "u");
    return source;
  } catch (e) {
    if (e instanceof Unsupported) return null;
    throw e;
  }
}
