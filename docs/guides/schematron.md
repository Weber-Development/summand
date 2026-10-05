---
title: Schematron and XPath
description: Use Summand's XPath 2.0 and Schematron engine for your own rules, e.g. company-specific invoice checks.
---

The engine behind `validateInvoice` is available on its own. You can compile your own Schematron (ISO Schematron with the XSLT 2 query binding, as used for e-invoices) and run it against parsed documents.

```ts
import { compileSchematron, parseXml, runSchematron } from "@sweberdev/summand";

const rules = compileSchematron(
  `<schema xmlns="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">
     <ns prefix="cbc" uri="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"/>
     <pattern>
       <rule context="/*">
         <assert id="ACME-1" flag="fatal" test="starts-with(cbc:ID, 'ACME-')">
           Invoice numbers must start with ACME-, found <value-of select="cbc:ID"/>.
         </assert>
       </rule>
     </pattern>
   </schema>`,
  { id: "acme" },
);

const findings = runSchematron(rules, parseXml(xml));
```

Compile once and keep the result: it is plain JSON and can be stored or bundled.

## XPath

```ts
import { select } from "@sweberdev/summand/xpath";

const doc = parseXml(xml);
select("sum(//cac:InvoiceLine/xs:decimal(cbc:LineExtensionAmount))", doc, {
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
});
```

Supported: all axes, predicates, `for`, `some`, `every`, `if`, general and value comparisons, exact `xs:decimal` arithmetic, `xs:date`, regular expressions (`matches`, `replace`, `tokenize`) and the usual string, number and sequence functions. `xsl:function` declarations in a Schematron file are supported when they consist of parameters, variables and one `xsl:sequence`. Not supported: XSLT templates, `document()`, schema-aware types.
