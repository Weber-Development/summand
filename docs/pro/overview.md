---
title: Summand Pro
description: Read invoices into typed objects, show them as readable HTML with the validation report, and validate whole inboxes with reports, duplicates and an audit trail.
---

Summand Pro builds on the free validator for teams that process incoming invoices: accounting software, ERP and SaaS products, agencies building invoice portals.

| Package | What it does |
|---|---|
| `@weber-development/summand-read` | Reads XRechnung, ZUGFeRD and Factur-X (UBL or CII, XML or PDF) into one typed `Invoice` object with the EN 16931 business terms: parties, addresses, lines, VAT breakdown, allowances and charges, payment details, references, attachments. One code path for every format. |
| `@weber-development/summand-view` | Renders an invoice as readable, printable HTML in German or English, with the validation report. The XML is unreadable for people; this is what your users look at before they approve an invoice. |
| `@weber-development/summand-inbox` | Validates whole folders or batches: JSON, CSV, JUnit and HTML reports, duplicate detection (same seller, invoice number and date), and an audit log with a SHA-256 hash, time and result for each invoice. As API and CLI for CI and cron jobs. |

## Licence and installation

Pro is sold per person through Polar: Freelancer (1 person), Agency (up to 10 people) and Lifetime. After the purchase you get read access to the private repository `Weber-Development/summand-pro-dist`, and installing the packages works with a GitHub token from GitHub Packages. The installation guide is in that repository.

Every version you received keeps working after you cancel. No licence key, no phone-home.

Prices and checkout: [packages.sweber.dev/summand](https://packages.sweber.dev/summand).
