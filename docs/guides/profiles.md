---
title: Profiles and rule sets
description: Which rules Summand applies for XRechnung, ZUGFeRD, Factur-X and Peppol invoices.
---

Summand reads the specification identifier (BT-24: `cbc:CustomizationID` in UBL, `GuidelineSpecifiedDocumentContextParameter/ram:ID` in CII) and picks the rule sets:

| Profile | Recognised by | Rule sets |
|---|---|---|
| XRechnung 3.0 | `…#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` | EN 16931 + XRechnung |
| XRechnung Extension | `…#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0` | EN 16931 + XRechnung, with KoSIT's relaxed levels |
| XRechnung CVD | `…#compliant#urn:xeinkauf.de:kosit:xrechnung:cvd_…` | EN 16931 + XRechnung |
| ZUGFeRD / Factur-X EN 16931 (COMFORT) | `urn:cen.eu:en16931:2017` | EN 16931 |
| ZUGFeRD / Factur-X BASIC | `…:factur-x.eu:1p0:basic` | EN 16931 |
| ZUGFeRD / Factur-X EXTENDED | `…:factur-x.eu:1p0:extended` | EN 16931, errors reported as warnings by default |
| Peppol BIS Billing 3.0 | `…peppol…` | EN 16931 (Peppol rules not included yet) |
| ZUGFeRD / Factur-X MINIMUM, BASIC WL | `…:minimum`, `…:basicwl` | none; reported as error `SUM-PROFILE` |
| anything else | | EN 16931, with warning `SUM-PROFILE` |

The EN 16931 rule set follows the syntax: `en16931-ubl` for UBL Invoice and Credit Note, `en16931-cii` for CII. The same goes for XRechnung.

## MINIMUM and BASIC WL

These two Factur-X profiles leave out the invoice lines and other information EN 16931 requires. They are booking aids, not e-invoices: in Germany they do not count as an e-invoice under § 14 UStG since 2025. Summand reports them as invalid without running the rules.

## XRechnung severity levels

The KoSIT validator configuration for XRechnung changes the severity of some EN 16931 rules, for example `BR-CL-21` (item classification code list) becomes a warning, and for the extension `BR-CO-16` becomes an information. Summand applies the same changes when the XRechnung rules run, so results match the KoSIT validator.

## Forcing rule sets

```ts
// German public buyer: always apply XRechnung
validateInvoice(xml, { xrechnung: true });

// only EN 16931 for UBL
validateInvoice(xml, { ruleSets: ["en16931-ubl"] });
```
