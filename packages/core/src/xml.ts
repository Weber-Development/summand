/**
 * A small namespace-aware XML parser that builds the node tree the XPath engine works on.
 * It covers what invoices and Schematron files use: elements, attributes, text, CDATA,
 * comments, processing instructions and the predefined and numeric entities. DTDs are skipped
 * and never resolved, so external entities cannot be loaded.
 */

export type XNodeKind = "document" | "element" | "attribute" | "text" | "comment" | "pi";

/**
 * A node of a parsed XML document (document, element, attribute, text, comment or processing
 * instruction). Read the fields `kind`, `ns`, `local`, `prefix`, `value`, `parent`, `children`,
 * `attributes` and `line`; `order` and `namespaces` are used by the XPath engine and may change.
 *
 * @beta
 */
export interface XNode {
  kind: XNodeKind;
  /** Namespace URI (elements and attributes). */
  ns: string;
  /** Local name (elements, attributes) or target (processing instructions). */
  local: string;
  /** Prefix as written in the source. */
  prefix: string;
  /** Text of text, comment, attribute and processing-instruction nodes. */
  value: string;
  parent: XNode | null;
  children: XNode[];
  attributes: XNode[];
  /** In-scope namespace declarations of an element (prefix → URI, "" is the default). */
  namespaces: Map<string, string> | null;
  /** Position in document order, unique within one document. */
  order: number;
  /** 1-based line of the start tag or text. */
  line: number;
}

/**
 * Thrown by {@link parseXml} for malformed XML.
 *
 * @beta
 */
export class XmlError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "XmlError";
  }
}

const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

function node(kind: XNodeKind, parent: XNode | null, line: number): XNode {
  return {
    kind,
    ns: "",
    local: "",
    prefix: "",
    value: "",
    parent,
    children: [],
    attributes: [],
    namespaces: null,
    order: 0,
    line,
  };
}

const ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

const NAME_START = /[A-Za-z_:À-￿]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-·À-￿]/;

/**
 * Parses an XML document into the node tree the XPath engine works on. DTDs are skipped and never
 * resolved, so external entities cannot be loaded.
 *
 * @throws {@link XmlError} for malformed input.
 * @beta
 */
export function parseXml(source: string): XNode {
  let text = source;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let pos = 0;
  let line = 1;
  let lineStart = 0;

  const fail = (message: string): never => {
    throw new XmlError(message, line, pos - lineStart + 1);
  };

  const advanceTo = (end: number) => {
    for (let i = pos; i < end; i++) {
      if (text.charCodeAt(i) === 10) {
        line++;
        lineStart = i + 1;
      }
    }
    pos = end;
  };

  const decode = (raw: string): string => {
    if (raw.indexOf("&") === -1) return raw.indexOf("\r") === -1 ? raw : normalizeNewlines(raw);
    return normalizeNewlines(raw).replace(
      /&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][\w.-]*);/g,
      (m, ref) => {
        if (ref[0] === "#") {
          const code =
            ref[1] === "x" ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
          if (!Number.isFinite(code) || code > 0x10ffff) fail(`Invalid character reference ${m}`);
          return String.fromCodePoint(code);
        }
        const value = ENTITIES[ref];
        if (value === undefined) fail(`Unknown entity ${m}`);
        return value as string;
      },
    );
  };

  const readName = (): string => {
    const start = pos;
    if (!NAME_START.test(text[pos] ?? "")) fail("Expected a name");
    pos++;
    while (pos < text.length && NAME_CHAR.test(text[pos] as string)) pos++;
    return text.slice(start, pos);
  };

  const skipSpace = () => {
    let p = pos;
    while (p < text.length) {
      const c = text.charCodeAt(p);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13) break;
      p++;
    }
    advanceTo(p);
  };

  const doc = node("document", null, 1);
  let current = doc;
  const elementStack: XNode[] = [];
  // Raw prefixed names of the open elements, to check end tags.
  const nameStack: string[] = [];

  const resolve = (el: XNode, prefix: string, isAttribute: boolean): string => {
    if (prefix === "xml") return XML_NS;
    if (prefix === "xmlns") return XMLNS_NS;
    if (prefix === "" && isAttribute) return "";
    for (let n: XNode | null = el; n; n = n.parent) {
      const uri = n.namespaces?.get(prefix);
      if (uri !== undefined) return uri;
    }
    if (prefix === "") return "";
    return fail(`Undeclared namespace prefix "${prefix}"`);
  };

  const appendText = (value: string, at: number) => {
    if (value === "") return;
    if (current === doc) {
      if (value.trim() !== "") fail("Text outside the root element");
      return;
    }
    const last = current.children[current.children.length - 1];
    if (last && last.kind === "text") {
      last.value += value;
      return;
    }
    const t = node("text", current, at);
    t.value = value;
    current.children.push(t);
  };

  let sawRoot = false;
  while (pos < text.length) {
    const lt = text.indexOf("<", pos);
    if (lt === -1) {
      const rest = text.slice(pos);
      const at = line;
      advanceTo(text.length);
      appendText(decode(rest), at);
      break;
    }
    if (lt > pos) {
      const raw = text.slice(pos, lt);
      const at = line;
      advanceTo(lt);
      appendText(decode(raw), at);
    }
    if (text.startsWith("<!--", pos)) {
      const end = text.indexOf("-->", pos + 4);
      if (end === -1) fail("Unterminated comment");
      const c = node("comment", current, line);
      c.value = text.slice(pos + 4, end);
      current.children.push(c);
      advanceTo(end + 3);
      continue;
    }
    if (text.startsWith("<![CDATA[", pos)) {
      const end = text.indexOf("]]>", pos + 9);
      if (end === -1) fail("Unterminated CDATA section");
      const at = line;
      const value = normalizeNewlines(text.slice(pos + 9, end));
      advanceTo(end + 3);
      if (current === doc) fail("CDATA outside the root element");
      appendText(value, at);
      continue;
    }
    if (text.startsWith("<!DOCTYPE", pos)) {
      // Skip the DTD including an internal subset; entities declared there are not supported.
      let p = pos + 9;
      let depth = 0;
      while (p < text.length) {
        const ch = text[p];
        if (ch === "[") depth++;
        else if (ch === "]") depth--;
        else if (ch === ">" && depth <= 0) break;
        p++;
      }
      advanceTo(p + 1);
      continue;
    }
    if (text.startsWith("<?", pos)) {
      const end = text.indexOf("?>", pos + 2);
      if (end === -1) fail("Unterminated processing instruction");
      const body = text.slice(pos + 2, end);
      const target = /^[^\s?]+/.exec(body)?.[0] ?? "";
      if (target.toLowerCase() !== "xml") {
        const pi = node("pi", current, line);
        pi.local = target;
        pi.value = body.slice(target.length).replace(/^\s+/, "");
        current.children.push(pi);
      }
      advanceTo(end + 2);
      continue;
    }
    if (text.startsWith("</", pos)) {
      advanceTo(pos + 2);
      const name = readName();
      skipSpace();
      if (text[pos] !== ">") fail("Expected > in end tag");
      advanceTo(pos + 1);
      const open = nameStack.pop();
      if (open !== name) fail(`End tag </${name}> does not match <${open ?? ""}>`);
      elementStack.pop();
      current = elementStack[elementStack.length - 1] ?? doc;
      continue;
    }
    // Start tag
    if (current === doc && sawRoot) fail("More than one root element");
    const startLine = line;
    advanceTo(pos + 1);
    const qname = readName();
    const el = node("element", current, startLine);
    const rawAttributes: Array<{ name: string; value: string }> = [];
    let selfClosing = false;
    for (;;) {
      skipSpace();
      const ch = text[pos];
      if (ch === undefined) fail("Unterminated start tag");
      if (ch === ">") {
        advanceTo(pos + 1);
        break;
      }
      if (ch === "/" && text[pos + 1] === ">") {
        advanceTo(pos + 2);
        selfClosing = true;
        break;
      }
      const name = readName();
      skipSpace();
      if (text[pos] !== "=") fail(`Expected = after attribute ${name}`);
      advanceTo(pos + 1);
      skipSpace();
      const quote = text[pos];
      if (quote !== '"' && quote !== "'") fail("Expected a quoted attribute value");
      const end = text.indexOf(quote as string, pos + 1);
      if (end === -1) fail("Unterminated attribute value");
      const raw = text.slice(pos + 1, end);
      if (raw.includes("<")) fail("< in attribute value");
      advanceTo(end + 1);
      // Attribute value normalisation: whitespace characters become spaces.
      const value = decode(raw.replace(/[\t\n\r]/g, " "));
      if (rawAttributes.some((a) => a.name === name)) fail(`Duplicate attribute ${name}`);
      rawAttributes.push({ name, value });
    }
    for (const a of rawAttributes) {
      if (a.name === "xmlns") {
        el.namespaces ??= new Map();
        el.namespaces.set("", a.value);
      } else if (a.name.startsWith("xmlns:")) {
        el.namespaces ??= new Map();
        el.namespaces.set(a.name.slice(6), a.value);
      }
    }
    const [prefix, local] = splitQName(qname);
    el.prefix = prefix;
    el.local = local;
    el.ns = resolve(el, prefix, false);
    for (const a of rawAttributes) {
      if (a.name === "xmlns" || a.name.startsWith("xmlns:")) continue;
      const [ap, al] = splitQName(a.name);
      const attr = node("attribute", el, startLine);
      attr.prefix = ap;
      attr.local = al;
      attr.ns = resolve(el, ap, true);
      attr.value = a.value;
      el.attributes.push(attr);
    }
    current.children.push(el);
    if (current === doc) sawRoot = true;
    if (!selfClosing) {
      elementStack.push(el);
      nameStack.push(qname);
      current = el;
    }
  }
  if (nameStack.length > 0) fail(`Unclosed element <${nameStack[nameStack.length - 1]}>`);
  if (!sawRoot) fail("No root element");
  numberNodes(doc);
  return doc;
}

function splitQName(qname: string): [string, string] {
  const i = qname.indexOf(":");
  return i === -1 ? ["", qname] : [qname.slice(0, i), qname.slice(i + 1)];
}

function normalizeNewlines(s: string): string {
  return s.indexOf("\r") === -1 ? s : s.replace(/\r\n?/g, "\n");
}

function numberNodes(doc: XNode) {
  let order = 0;
  const visit = (n: XNode) => {
    n.order = order++;
    for (const a of n.attributes) a.order = order++;
    for (const c of n.children) visit(c);
  };
  visit(doc);
}

/** The root element of a document node. */
export function documentElement(doc: XNode): XNode | undefined {
  return doc.children.find((c) => c.kind === "element");
}

/**
 * String value of a node as defined by XPath.
 *
 * @beta
 */
export function stringValue(n: XNode): string {
  if (n.kind === "element" || n.kind === "document") {
    if (n.children.length === 1 && n.children[0]?.kind === "text") return n.children[0].value;
    let out = "";
    const walk = (x: XNode) => {
      for (const c of x.children) {
        if (c.kind === "text") out += c.value;
        else if (c.kind === "element") walk(c);
      }
    };
    walk(n);
    return out;
  }
  return n.value;
}

/** Child elements with the given namespace and local name. */
export function childElements(n: XNode, ns?: string, local?: string): XNode[] {
  return n.children.filter(
    (c) =>
      c.kind === "element" &&
      (ns === undefined || c.ns === ns) &&
      (local === undefined || c.local === local),
  );
}

/**
 * A readable XPath to a node, with prefixes as written in the document, e.g.
 * /Invoice/cac:InvoiceLine[2]/cbc:ID.
 *
 * @beta
 */
export function nodePath(n: XNode): string {
  const parts: string[] = [];
  for (let x: XNode | null = n; x && x.kind !== "document"; x = x.parent) {
    const name = x.prefix ? `${x.prefix}:${x.local}` : x.local;
    if (x.kind === "attribute") {
      parts.unshift(`@${name}`);
      continue;
    }
    if (x.kind === "text") {
      parts.unshift("text()");
      continue;
    }
    const parent: XNode | null = x.parent;
    let index = 0;
    let count = 0;
    if (parent) {
      for (const s of parent.children as XNode[]) {
        if (s.kind === "element" && s.ns === x.ns && s.local === x.local) {
          count++;
          if (s === x) index = count;
        }
      }
    }
    parts.unshift(count > 1 ? `${name}[${index}]` : name);
  }
  return `/${parts.join("/")}`;
}
