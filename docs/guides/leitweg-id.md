---
title: Leitweg-ID
description: Check the routing identifier German public buyers require in XRechnung invoices.
---

Public buyers in Germany identify the receiving office with a Leitweg-ID, sent as buyer reference (BT-10). An invoice with a wrong Leitweg-ID is rejected by the receiving platform, often only days later.

The format is: coarse address (2 to 12 digits), optionally a fine address (up to 30 letters or digits), and two check digits, separated by hyphens, e.g. `04011000-1234512345-06`. The check digits follow ISO/IEC 7064 MOD 97-10.

```ts
import { isValidLeitwegId, leitwegCheckDigits, parseLeitwegId } from "@sweberdev/summand";

isValidLeitwegId("04011000-1234512345-06"); // true
leitwegCheckDigits("04011000", "1234512345"); // "06"
parseLeitwegId("991-33333TEST-33"); // { coarse: "991", fine: "33333TEST", checkDigits: "33" }
```

`validateInvoice` checks the buyer reference automatically when it looks like a Leitweg-ID and reports a warning `SUM-LEITWEG` if the check digits are wrong. A correct check digit does not mean the ID exists: only the buyer can confirm that.
