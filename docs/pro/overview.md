---
title: Summand Pro
description: Read invoices into typed objects, show them as readable HTML, write and match them, validate whole inboxes, run a validation service and a team workbench with four-eyes approval.
---

Summand Pro (six packages, 3.0 since November 2026) builds on the free validator for teams that process incoming invoices: accounting software, ERP and SaaS products, agencies building invoice portals.

| Package | What it does |
|---|---|
| `@weber-development/summand-read` | Reads XRechnung, ZUGFeRD and Factur-X (UBL or CII, XML or PDF) into one typed `Invoice` object with the EN 16931 business terms: parties, addresses, lines, VAT breakdown, allowances and charges, payment details, references, attachments. One code path for every format. |
| `@weber-development/summand-view` | Renders an invoice as readable, printable HTML in German or English, with the validation report. The XML is unreadable for people; this is what your users look at before they approve an invoice. |
| `@weber-development/summand-inbox` | Validates whole folders or batches: JSON, CSV, JUnit and HTML reports, duplicate detection (same seller, invoice number and date), and an audit log with a SHA-256 hash, time and result for each invoice. As API and CLI for CI and cron jobs. |
| `@weber-development/summand-write` | Writes an invoice from the typed `Invoice` object as XRechnung 3.0 or EN 16931 (UBL or CII) and always validates the result with the Summand validator. |
| `@weber-development/summand-match` | Checks an invoice against a purchase order and optionally a goods receipt, and reports every difference as a finding with a stable code. |
| `@weber-development/summand-server` | An HTTP service (Docker image or process) that validates e-invoices for stacks that are not Node.js. New in 3.0: the optional workbench, a browser page where named users register received invoices, check and approve them with the four-eyes rule and export them with an evidence bundle. |

## Licence and installation

Pro is sold per person through Polar: Freelancer (1 person), Agency (up to 10 people) and Lifetime. After the purchase you get read access to the private repository `Weber-Development/summand-pro-dist`, and installing the packages works with a GitHub token from GitHub Packages. The installation guide is in that repository.

The workbench is off unless you configure it, and is not a certified GoBD system. Every version you received keeps working after you cancel. No licence key, no phone-home.

Prices and checkout: [packages.sweber.dev/summand](https://packages.sweber.dev/summand).
