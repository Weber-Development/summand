---
"@sweberdev/summand": minor
---

XML Schema (XSD) validation. `validateInvoice` now checks every invoice against the official XML Schema of its syntax before the Schematron rules, like the KoSIT validator: OASIS UBL 2.1 for Invoice and CreditNote, UN/CEFACT CII D16B (SCRDM subset, uncoupled code lists) for CrossIndustryInvoice, the versions EN 16931 1.3.16 and XRechnung 3.0 use.

- Reports unexpected, missing, misplaced and repeated elements, missing and unknown attributes, fixed attribute values, and values that do not match their type or facets (for example `xs:date`, `xs:decimal`, `maxLength`), each as an error with the id `SUM-XSD`, the XPath and the line.
- The Schematron rules still run when the schema check fails, so both kinds of errors are reported together.
- New option `schema` (default `true`) and CLI flag `--no-schema` to skip the check; the result has a new `schemas` field listing the schemas used.
- New export `validateSchema(doc, "ubl-2.1" | "cii-d16b")` and `SCHEMAS` for using the schema check on its own.
- The XSD files are vendored unchanged and compiled at build time into compact JSON models (about 14 KB gzipped for both); the schema check takes well under a millisecond for a typical invoice.
