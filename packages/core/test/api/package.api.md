# Package surface

## exports
- .
- ./xpath
- ./rules-check
- ./batch
- ./cli
- ./package.json

## bin
- summand

## exit codes
- 0 ok
- 1 invalid
- 2 error
- 3 outdated

## summand --help

```
summand: validate XRechnung and ZUGFeRD / Factur-X e-invoices against EN 16931

Usage
  summand validate <files...> [options]
  summand extract <invoice.pdf> [--out <file.xml>]
  summand leitweg <leitweg-id>
  summand rules [--json] [--check [--fail-on-outdated]]
  summand --version


validate options
  --json                one JSON result per file (JSON Lines)
  --rule-sets <list>    rule sets to apply, comma-separated, each optionally with a version:
                        en16931,xrechnung@2.5.0 (default: auto, see "summand rules")
  --xrechnung           deprecated, use --rule-sets en16931,xrechnung (removed in 2.0.0)
  --strict-extended     treat EN 16931 violations in ZUGFeRD EXTENDED as errors
  --no-schema           skip the XML Schema (XSD) validation
  --no-leitweg          do not check the Leitweg-ID in the buyer reference
  --warnings-as-errors  exit 1 when there are warnings
  --quiet               only print a summary line per file
  --lang <en|de>        language of the messages (default en)

Files can be UBL or CII XML (XRechnung, ZUGFeRD, Factur-X, Peppol) or ZUGFeRD / Factur-X PDFs.

Exit codes
  0  success: every invoice is valid
  1  an invoice is invalid (or has warnings with --warnings-as-errors)
  2  the command could not run: usage error, unknown flag, unreadable file
  3  rules --check --fail-on-outdated: a newer release exists

rules options
  --json                machine-readable output
  --check               ask GitHub whether newer releases of the rule sets exist (sends nothing
                        about your invoices, downloads nothing)
  --fail-on-outdated    with --check: exit code 3 when a newer release exists
```
