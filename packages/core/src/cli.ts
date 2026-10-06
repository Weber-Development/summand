import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { rulesCommand } from "./cli-rules";
import { isValidLeitwegId, leitwegCheckDigits, parseLeitwegId } from "./leitweg";
import { extractInvoiceXml, isPdf } from "./pdf";
import type { FetchLike } from "./rules-check";
import { type ValidationMessage, type ValidationResult, validateInvoice } from "./validate";

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const HELP = `summand: validate XRechnung and ZUGFeRD / Factur-X e-invoices against EN 16931

Usage
  summand validate <files...> [options]
  summand extract <invoice.pdf> [--out <file.xml>]
  summand leitweg <leitweg-id>
  summand rules [--json] [--check [--fail-on-outdated]]

validate options
  --json                one JSON result per file (JSON Lines)
  --xrechnung           apply the XRechnung rules even if the invoice does not declare XRechnung
  --strict-extended     treat EN 16931 violations in ZUGFeRD EXTENDED as errors
  --no-schema           skip the XML Schema (XSD) validation
  --warnings-as-errors  exit 1 when there are warnings
  --quiet               only print a summary line per file
  --lang <en|de>        language of the messages (default en)

Files can be UBL or CII XML (XRechnung, ZUGFeRD, Factur-X, Peppol) or ZUGFeRD / Factur-X PDFs.
Exit code 1 when an invoice is invalid.

rules options
  --json                machine-readable output
  --check               ask GitHub whether newer releases of the rule sets exist (sends nothing
                        about your invoices, downloads nothing)
  --fail-on-outdated    with --check: exit code 3 when a newer release exists`;

const defaultIo: CliIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

export async function runCli(
  argv: string[],
  io: CliIo = defaultIo,
  options: { fetch?: FetchLike } = {},
): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    io.out(HELP);
    return command ? 0 : 1;
  }
  try {
    if (command === "validate") return await validate(rest, io);
    if (command === "extract") return await extract(rest, io);
    if (command === "leitweg") return leitweg(rest, io);
    if (command === "rules") return await rulesCommand(rest, io, options);
    io.err(`Unknown command "${command}". Run "summand --help".`);
    return 1;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const SEVERITY_DE: Record<ValidationMessage["severity"], string> = {
  error: "Fehler",
  warning: "Warnung",
  info: "Hinweis",
};

function formatMessage(m: ValidationMessage, de = false): string {
  const where = m.line ? (de ? ` (Zeile ${m.line})` : ` (line ${m.line})`) : "";
  const severity = de ? SEVERITY_DE[m.severity] : m.severity;
  return `  ${severity.padEnd(7)} ${m.id}${where}: ${m.message}`;
}

function summaryLine(file: string, r: ValidationResult, de = false): string {
  const mark = de ? (r.valid ? "gültig  " : "UNGÜLTIG") : r.valid ? "valid  " : "INVALID";
  const profile = r.profile
    ? `${r.profile.label}${r.source.type === "pdf" ? " (PDF)" : ""}`
    : r.source.type.toUpperCase();
  const counts = de
    ? `${r.errors.length} Fehler, ${r.warnings.length} Warnung(en)`
    : `${r.errors.length} error(s), ${r.warnings.length} warning(s)`;
  return `${mark} ${file}  ${profile}  ${counts}`;
}

async function validate(argv: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      xrechnung: { type: "boolean" },
      "strict-extended": { type: "boolean" },
      "no-schema": { type: "boolean" },
      "warnings-as-errors": { type: "boolean" },
      quiet: { type: "boolean" },
      lang: { type: "string" },
    },
  });
  if (values.lang !== undefined && values.lang !== "en" && values.lang !== "de") {
    io.err(`Unknown language "${values.lang}". Use --lang en or --lang de.`);
    return 1;
  }
  if (positionals.length === 0) {
    io.err("No files given. Usage: summand validate <files...>");
    return 1;
  }
  let failed = false;
  for (const file of positionals) {
    const bytes = new Uint8Array(await readFile(file));
    const result = validateInvoice(bytes, {
      ...(values.xrechnung ? { xrechnung: true } : {}),
      ...(values["strict-extended"] ? { extended: "strict" as const } : {}),
      ...(values["no-schema"] ? { schema: false } : {}),
      ...(values.lang === "de" ? { lang: "de" as const } : {}),
    });
    if (!result.valid || (values["warnings-as-errors"] && result.warnings.length > 0))
      failed = true;
    if (values.json) {
      io.out(JSON.stringify({ file, ...result }));
      continue;
    }
    const de = values.lang === "de";
    io.out(summaryLine(file, result, de));
    if (values.quiet) continue;
    for (const m of result.errors) io.out(formatMessage(m, de));
    for (const m of result.warnings) io.out(formatMessage(m, de));
  }
  return failed ? 1 : 0;
}

async function extract(argv: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { out: { type: "string", short: "o" } },
  });
  const file = positionals[0];
  if (!file) {
    io.err("Usage: summand extract <invoice.pdf> [--out <file.xml>]");
    return 1;
  }
  const bytes = new Uint8Array(await readFile(file));
  if (!isPdf(bytes)) {
    io.err(`${file} is not a PDF.`);
    return 1;
  }
  const extracted = extractInvoiceXml(bytes);
  if (!extracted) {
    io.err(`${file} contains no embedded invoice XML.`);
    return 1;
  }
  if (values.out) {
    await writeFile(values.out, extracted.xml);
    io.out(`Wrote ${extracted.name ?? "invoice XML"} to ${values.out}`);
  } else {
    io.out(extracted.xml);
  }
  return 0;
}

function leitweg(argv: string[], io: CliIo): number {
  const value = argv[0];
  if (!value) {
    io.err("Usage: summand leitweg <leitweg-id>");
    return 1;
  }
  const parsed = parseLeitwegId(value);
  if (!parsed) {
    io.out(`${value}: not a Leitweg-ID (expected e.g. 04011000-1234512345-06)`);
    return 1;
  }
  if (isValidLeitwegId(value)) {
    io.out(`${value}: valid Leitweg-ID`);
    return 0;
  }
  io.out(
    `${value}: wrong check digits, expected ${leitwegCheckDigits(parsed.coarse, parsed.fine ?? "")}`,
  );
  return 1;
}
