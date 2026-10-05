import { describe, expect, it } from "vitest";
import { nodePath, parseXml, stringValue, XmlError } from "../src/xml";

describe("parseXml", () => {
  it("resolves namespaces, entities and CDATA", () => {
    const doc = parseXml(
      '<?xml version="1.0"?>\n<a:root xmlns:a="urn:a" xmlns="urn:d" x="1 &amp; 2"><b>x &lt; y &#x41;<![CDATA[<raw>]]></b><a:c/></a:root>',
    );
    const root = doc.children[0];
    expect(root?.ns).toBe("urn:a");
    expect(root?.attributes[0]?.value).toBe("1 & 2");
    const b = root?.children[0];
    expect(b?.ns).toBe("urn:d");
    expect(stringValue(b as never)).toBe("x < y A<raw>");
    expect(root?.children[1]?.ns).toBe("urn:a");
  });

  it("tracks line numbers and paths", () => {
    const doc = parseXml("<r>\n  <x/>\n  <x>\n    <y/>\n  </x>\n</r>");
    const y = doc.children[0]?.children
      .filter((c) => c.kind === "element")[1]
      ?.children.find((c) => c.kind === "element");
    expect(y?.line).toBe(4);
    expect(nodePath(y as never)).toBe("/r/x[2]/y");
  });

  it("skips DTDs without resolving entities", () => {
    const doc = parseXml('<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>ok</r>');
    expect(stringValue(doc)).toBe("ok");
    expect(() => parseXml('<!DOCTYPE r [<!ENTITY x "y">]><r>&x;</r>')).toThrow(XmlError);
  });

  it("rejects malformed documents with a position", () => {
    expect(() => parseXml("<a><b></a>")).toThrow(/does not match/);
    expect(() => parseXml("<a>")).toThrow(/Unclosed/);
    expect(() => parseXml("<p:a/>")).toThrow(/Undeclared namespace prefix/);
    expect(() => parseXml("")).toThrow(/No root element/);
    try {
      parseXml("<a>\n<b x=1/></a>");
    } catch (e) {
      expect((e as XmlError).line).toBe(2);
    }
  });

  it("normalises line breaks and handles a BOM", () => {
    const doc = parseXml("﻿<a>1\r\n2</a>");
    expect(stringValue(doc)).toBe("1\n2");
  });
});
