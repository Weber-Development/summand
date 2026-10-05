import { describe, expect, it } from "vitest";
import { parseXml } from "../src/xml";
import { select } from "../src/xpath";
import { Decimal } from "../src/xpath/decimal";
import { stringOf } from "../src/xpath/eval";

const doc = parseXml(`<inv xmlns:c="urn:c">
  <c:line id="1"><c:amt>0.1</c:amt><c:cat>S</c:cat></c:line>
  <c:line id="2"><c:amt>0.2</c:amt><c:cat>Z</c:cat></c:line>
  <c:line id="3"><c:amt>10.005</c:amt><c:cat>S</c:cat></c:line>
  <c:note>#SKONTO#TAGE=7#PROZENT=2.00#
</c:note>
  <flag>false</flag>
</inv>`);
const ns = { c: "urn:c" };
const value = (expr: string) => select(expr, doc, ns).map(stringOf);
const bool = (expr: string) => select(expr, doc, ns)[0];

describe("XPath", () => {
  it("sums decimals exactly", () => {
    expect(bool("sum(//c:line[position() < 3]/xs:decimal(c:amt)) = 0.3")).toBe(true);
    expect(value("round(xs:decimal('10.005') * 100) div 100")).toEqual(["10.01"]);
    expect(value("round(-2.5)")).toEqual(["-2"]);
    expect(value("10 div 4")).toEqual(["2.5"]);
    expect(value("7 idiv 2")).toEqual(["3"]);
  });

  it("compares untyped values like XPath 2.0", () => {
    expect(bool("//c:amt = 0.2")).toBe(true);
    expect(bool("//flag = false()")).toBe(true);
    expect(bool("//c:cat = ('Z', 'E')")).toBe(true);
    expect(bool("//c:line/@id = '3'")).toBe(true);
    expect(bool("count(//c:line[c:cat = 'S']) eq 2")).toBe(true);
  });

  it("supports for, some, every and if", () => {
    expect(value("for $l in //c:line return string($l/@id)")).toEqual(["1", "2", "3"]);
    expect(bool("every $l in //c:line satisfies $l/c:amt > 0")).toBe(true);
    expect(bool("some $l in //c:line satisfies $l/c:cat = 'E'")).toBe(false);
    expect(value("if (count(//c:line) > 2) then 'many' else 'few'")).toEqual(["many"]);
  });

  it("supports axes and positional predicates", () => {
    expect(value("//c:line[last()]/@id")).toEqual(["3"]);
    expect(value("//c:amt[. = '0.2']/../preceding-sibling::c:line[1]/@id")).toEqual(["1"]);
    expect(value("count(//c:cat/ancestor::*)")).toEqual(["4"]);
    expect(value("//c:line[2]/following-sibling::*[1]/@id")).toEqual(["3"]);
    expect(value("name(//c:line[1]/..)")).toEqual(["inv"]);
  });

  it("supports regular expressions and string functions", () => {
    expect(
      bool(
        "matches(normalize-space(//c:note), '^#SKONTO#TAGE=[0-9]+#PROZENT=[0-9]+\\.[0-9]{2}#$')",
      ),
    ).toBe(true);
    expect(value("tokenize('a,b,,c', ',')")).toEqual(["a", "b", "", "c"]);
    expect(value("replace('2026-10-05', '(\\d+)-(\\d+)-(\\d+)', '$3.$2.$1')")).toEqual([
      "05.10.2026",
    ]);
    expect(value("substring('12345', 2, 3)")).toEqual(["234"]);
    expect(value("upper-case(substring-after('de-ch', '-'))")).toEqual(["CH"]);
    expect(value("string-join(distinct-values(//c:cat), '|')")).toEqual(["S|Z"]);
  });

  it("checks an IBAN with integer arithmetic", () => {
    const iban = "DE02120300000000202051";
    const expr = `xs:integer(string-join(for $cp in string-to-codepoints(concat(substring('${iban}',5),upper-case(substring('${iban}',1,2)),substring('${iban}',3,2))) return (if($cp > 64) then string($cp - 55) else string($cp - 48)),'')) mod 97`;
    expect(value(expr)).toEqual(["1"]);
  });

  it("compares dates", () => {
    expect(bool("xs:date('2026-10-05') >= xs:date('2026-01-31')")).toBe(true);
    expect(() => select("xs:date('2026-02-30')", doc)).toThrow(/xs:date/);
  });
});

describe("Decimal", () => {
  it("parses and prints canonical values", () => {
    expect(Decimal.parse("0010.500")?.toString()).toBe("10.5");
    expect(Decimal.parse("-.5")?.toString()).toBe("-0.5");
    expect(Decimal.parse("1e3")).toBeNull();
    expect(Decimal.fromNumber(1e-7)?.toString()).toBe("0.0000001");
  });
});
