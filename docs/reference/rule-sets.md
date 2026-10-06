---
title: Rule sets
description: The bundled official rule sets and XML Schemas, their versions, sources and licences.
---

| Id | Rule set | Version | Source | Licence |
|---|---|---|---|---|
| `en16931-ubl` | EN 16931 validation artefacts, UBL binding (model, syntax and code list rules; 979 assertions) | 1.3.16 | [ConnectingEurope/eInvoicing-EN16931](https://github.com/ConnectingEurope/eInvoicing-EN16931) | EUPL-1.2 |
| `en16931-cii` | EN 16931 validation artefacts, CII binding (806 assertions) | 1.3.16 | same | EUPL-1.2 |
| `xrechnung-ubl` | XRechnung Schematron for XRechnung 3.0, UBL (56 assertions) | 2.6.0 | [itplr-kosit/xrechnung-schematron](https://github.com/itplr-kosit/xrechnung-schematron) | Apache-2.0 |
| `xrechnung-cii` | XRechnung Schematron for XRechnung 3.0, CII (52 assertions) | 2.6.0 | same | Apache-2.0 |

The Schematron files are included unchanged in the repository (`packages/core/rules-src/`) and compiled to JSON at build time (`src/rules/`). The compiled rule sets keep their original licences; Summand's own code is MIT. See `NOTICE.md` in the package.

The severity changes of the KoSIT validator configuration for XRechnung ([itplr-kosit/validator-configuration-xrechnung](https://github.com/itplr-kosit/validator-configuration-xrechnung), Apache-2.0) are applied when the XRechnung rules run.

## XML Schemas

| Id | Schema | Version | Source | Licence |
|---|---|---|---|---|
| `ubl-2.1` | OASIS UBL 2.1 Invoice and CreditNote (maindoc and common modules) | 2.1 OS | [docs.oasis-open.org/ubl/os-UBL-2.1](https://docs.oasis-open.org/ubl/os-UBL-2.1/) | OASIS copyright notice |
| `cii-d16b` | UN/CEFACT Cross Industry Invoice, SCRDM subset, uncoupled code lists | 100.D16B | [ConnectingEurope/eInvoicing-EN16931](https://github.com/ConnectingEurope/eInvoicing-EN16931) 1.3.16 | UN/CEFACT copyright notice |

These are the schemas EN 16931 1.3.16 and the KoSIT validator configuration for XRechnung 3.0 use. The XSD files are included unchanged in the repository (`packages/core/schemas-src/`) and compiled at build time (`pnpm schemas`) into compact JSON models (`src/schemas/`) that contain only what the Invoice, CreditNote and CrossIndustryInvoice root elements can reach.

## Updates

New releases of the rule sets come out a few times a year. Summand publishes a minor version for each, with the change in the changelog. `summand rules` lists the bundled versions and `summand rules --check` asks whether newer releases exist, see [Rule sets and updates](../guides/rule-sets.md).
