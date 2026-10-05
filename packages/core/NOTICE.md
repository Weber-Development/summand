# Notices

Summand's own source code is licensed under the MIT licence (see LICENSE).

The package includes rule sets compiled from third-party Schematron files. The compiled files in
`src/rules/` and the bundled code derived from them keep the licences of their sources:

## EN 16931 validation artefacts

- Files: `src/rules/en16931-ubl.json`, `src/rules/en16931-cii.json`
- Source: https://github.com/ConnectingEurope/eInvoicing-EN16931, release 1.3.16
  (`ubl/schematron/preprocessed/EN16931-UBL-validation-preprocessed.sch`,
  `cii/schematron/preprocessed/EN16931-CII-validation-preprocessed.sch`)
- Copyright: CEN/TC 434 and contributors
- Licence: European Union Public Licence (EUPL) version 1.2, https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12
- Change: converted from Schematron XML to JSON (contexts, tests and messages unchanged; the
  leading "[rule id]-" of each message removed because the id is reported separately)

## XRechnung Schematron

- Files: `src/rules/xrechnung-ubl.json`, `src/rules/xrechnung-cii.json`
- Source: https://github.com/itplr-kosit/xrechnung-schematron, release v2.6.0
- Copyright: Koordinierungsstelle für IT-Standards (KoSIT)
- Licence: Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0
- Change: converted from Schematron XML to JSON as above

## KoSIT validator configuration for XRechnung

- The severity changes in `src/validate.ts` follow `scenarios.xml` of
  https://github.com/itplr-kosit/validator-configuration-xrechnung (Apache License 2.0).

## Inflate

- `src/inflate.ts` follows the structure of tinf by Jørgen Ibsen (zlib licence).
