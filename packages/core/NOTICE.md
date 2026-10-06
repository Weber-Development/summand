# Notices

Summand's own source code is licensed under the MIT licence (see LICENSE).

The package includes rule sets compiled from third-party Schematron files and schema models
compiled from third-party XML Schema files. The compiled files in `src/rules/` and `src/schemas/`
and the bundled code derived from them keep the licences of their sources:

## EN 16931 validation artefacts

- Files: `src/rules/en16931-ubl.json`, `src/rules/en16931-cii.json`
- Source: https://github.com/ConnectingEurope/eInvoicing-EN16931, release 1.3.16
  (`ubl/schematron/preprocessed/EN16931-UBL-validation-preprocessed.sch`,
  `cii/schematron/preprocessed/EN16931-CII-validation-preprocessed.sch`)
- Copyright: CEN/TC 434 and contributors
- Licence: European Union Public Licence (EUPL) version 1.2, https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12
- Change: converted from Schematron XML to JSON (contexts, tests and messages unchanged; the
  leading "[rule id]-" of each message removed because the id is reported separately); German
  translations of the messages added (`rules-src/i18n/de.json`, made for Summand and licensed
  under EUPL-1.2 like the messages they translate)

## XRechnung Schematron

- Files: `src/rules/xrechnung-ubl.json`, `src/rules/xrechnung-cii.json`
- Source: https://github.com/itplr-kosit/xrechnung-schematron, release v2.6.0
- Copyright: Koordinierungsstelle für IT-Standards (KoSIT)
- Licence: Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0
- Change: converted from Schematron XML to JSON as above

## KoSIT validator configuration for XRechnung

- The severity changes in `src/validate.ts` follow `scenarios.xml` of
  https://github.com/itplr-kosit/validator-configuration-xrechnung (Apache License 2.0).

## OASIS UBL 2.1 schemas

- File: `src/schemas/ubl.json`
- Source: OASIS Universal Business Language (UBL) 2.1 OS, https://docs.oasis-open.org/ubl/os-UBL-2.1/
  (`xsdrt/maindoc/UBL-Invoice-2.1.xsd`, `xsdrt/maindoc/UBL-CreditNote-2.1.xsd` and the modules
  of `xsdrt/common/` they import, including the UN/CEFACT `CCTS_CCT_SchemaModule-2.1.xsd`)
- Change: the declarations reachable from Invoice and CreditNote converted from XML Schema to JSON
  (structure, occurrences, attributes and data types unchanged; documentation removed)

Copyright (c) OASIS Open 2013. All Rights Reserved.

This document and translations of it may be copied and furnished to others, and derivative works
that comment on or otherwise explain it or assist in its implementation may be prepared, copied,
published and distributed, in whole or in part, without restriction of any kind, provided that
the above copyright notice and this paragraph are included on all such copies and derivative
works. However, this document itself may not be modified in any way, such as by removing the
copyright notice or references to OASIS, except as needed for the purpose of developing OASIS
specifications, in which case the procedures for copyrights defined in the OASIS Intellectual
Property Rights document must be followed, or as required to translate it into languages other
than English.

The limited permissions granted above are perpetual and will not be revoked by OASIS or its
successors or assigns.

This document and the information contained herein is provided on an "AS IS" basis and OASIS
DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTY THAT THE
USE OF THE INFORMATION HEREIN WILL NOT INFRINGE ANY RIGHTS OR ANY IMPLIED WARRANTIES OF
MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.

## UN/CEFACT Cross Industry Invoice D16B schemas

- File: `src/schemas/cii.json` (and the Core Component Types in `src/schemas/ubl.json`)
- Source: UN/CEFACT CrossIndustryInvoice 100.D16B, SCRDM subset with uncoupled code lists, as
  distributed with https://github.com/ConnectingEurope/eInvoicing-EN16931 release 1.3.16
  (`cii/schema/D16B SCRDM (Subset)/uncoupled clm/CII/uncefact/data/standard/`)
- Change: the declarations reachable from CrossIndustryInvoice converted from XML Schema to JSON
  as above

Copyright (C) UN/CEFACT (2016). All Rights Reserved.

This document and translations of it may be copied and furnished to others, and derivative works
that comment on or otherwise explain it or assist in its implementation may be prepared, copied,
published and distributed, in whole or in part, without restriction of any kind, provided that
the above copyright notice and this paragraph are included on all such copies and derivative
works. However, this document itself may not be modified in any way, such as by removing the
copyright notice or references to UN/CEFACT, except as needed for the purpose of developing
UN/CEFACT specifications, in which case the procedures for copyrights defined in the UN/CEFACT
Intellectual Property Rights document must be followed, or as required to translate it into
languages other than English.

The limited permissions granted above are perpetual and will not be revoked by UN/CEFACT or its
successors or assigns.

This document and the information contained herein is provided on an "AS IS" basis and UN/CEFACT
DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTY THAT THE
USE OF THE INFORMATION HEREIN WILL NOT INFRINGE ANY RIGHTS OR ANY IMPLIED WARRANTIES OF
MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.

## Inflate

- `src/inflate.ts` follows the structure of tinf by Jørgen Ibsen (zlib licence).
