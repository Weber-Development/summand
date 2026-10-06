---
title: XML Schema
description: How Summand checks invoices against the UBL 2.1 and UN/CEFACT CII D16B XML Schemas before the Schematron rules, what it reports and what it does not check.
---

The KoSIT validator checks an invoice in two steps: first against the XML Schema (XSD) of its syntax, then against the Schematron rules. Summand does the same. The schema check catches what no business rule looks at: a misspelt element, an element in the wrong place, a date written as `04.04.2016`, an amount with a comma.

```ts
import { validateInvoice } from "@sweberdev/summand";

const result = validateInvoice(xml);
result.schemas;   // [{ id: "ubl-2.1", name: "OASIS UBL 2.1 Invoice and CreditNote schema", … }]
result.errors[0]; // { id: "SUM-XSD", severity: "error", ruleSet: "summand",
                  //   message: 'Value "04.04.2016" of cbc:IssueDate is not a valid xs:date (expected a date YYYY-MM-DD).',
                  //   location: "/ubl:Invoice/cbc:IssueDate", line: 8 }
```

## Schemas

| Syntax | Schema |
|---|---|
| UBL Invoice, UBL CreditNote | OASIS UBL 2.1 (`ubl-2.1`) |
| UN/CEFACT CrossIndustryInvoice (XRechnung CII, ZUGFeRD, Factur-X) | UN/CEFACT CII 100.D16B, SCRDM subset with uncoupled code lists (`cii-d16b`) |

These are the schemas EN 16931 1.3.16 and the KoSIT configuration for XRechnung 3.0 use. Code lists are not part of them; codes are checked by the Schematron rules. The schema is picked from the root element, independent of the profile, so ZUGFeRD / Factur-X invoices of every profile are checked against CII D16B.

## What is reported

Every violation is an error with the id `SUM-XSD`, the XPath of the element or attribute and its line:

| Problem | Example message |
|---|---|
| Unknown element | `cbc:Colour is not allowed in ubl:Invoice (expected cbc:IssueTime, cbc:DueDate, …, cac:AccountingSupplierParty).` |
| Missing required element | `Required element cbc:ID is missing in ubl:Invoice (expected before cbc:IssueDate).` |
| Wrong order | `cbc:ID is in the wrong position in ubl:Invoice: it must come before cbc:IssueDate.` |
| Too many occurrences | `cbc:IssueDate occurs too often in ubl:Invoice (at most 1 allowed).` |
| Missing required attribute | `Required attribute currencyID is missing on cbc:LineExtensionAmount.` |
| Unknown attribute | `Attribute currency is not allowed on cbc:LineExtensionAmount.` |
| Fixed attribute value | `Attribute listID on ram:TypeCode must have the fixed value "1001", found "UNTDID 1001".` |
| Value format | `Value "314,86" of cbc:LineExtensionAmount is not a valid xs:decimal (expected a decimal number such as 123.45).` |
| Text or child elements where they do not belong | `cac:AccountingSupplierParty must not contain text, only child elements (found "oops").` |

The built-in types the schemas use are checked as XML Schema defines them: `xs:decimal`, `xs:date` (including the number of days in the month and the time zone), `xs:time`, `xs:dateTime`, `xs:boolean`, `xs:base64Binary` (including padding), `xs:language` and the string types; facets (`minLength`, `maxLength` and the others) are checked as well.

The Schematron rules still run when the schema check fails, so you see every problem at once. Turn the schema check off with `validateInvoice(xml, { schema: false })` or `summand validate --no-schema`.

## Using the schema check on its own

```ts
import { parseXml, validateSchema } from "@sweberdev/summand";

const findings = validateSchema(parseXml(xml), "cii-d16b");
// [{ kind: "missing-element", message: "…", location: "/rsm:CrossIndustryInvoice/…", line: 17 }]
```

`kind` is one of `unexpected-element`, `missing-element`, `element-order`, `too-many`, `content`, `missing-attribute`, `unknown-attribute`, `attribute-value` and `value`.

## Differences to the KoSIT validator

The verdict (valid or not) was compared with Xerces, the schema validator the KoSIT validator uses, on all test invoices and on about 2,800 modified ones, with the same result for every document. The messages differ: Xerces stops checking an element's content at the first problem, Summand reports each problem it finds, with a readable text instead of `cvc-complex-type.2.4.a`. A few things are not checked:

- **UBL signatures.** `ext:ExtensionContent` is validated laxly as the schema says (elements with a declaration in the bundled schema are checked, anything else is accepted), but the UBL signature schemas (`sig:`, `sac:`, `sbc:`, XML Signature, XAdES) are not bundled, so signature content is not checked. Lax validation also only knows the UBL declarations an Invoice or CreditNote can contain.
- **`xsi:type`.** An element that replaces its type with `xsi:type` is not checked further. Invoices do not use it.
- **`xs:anyURI`** is accepted as written, like Xerces does for nearly every value.
