import { type Detection, detect, type Profile, type Syntax } from "./detect";
import { isValidLeitwegId, looksLikeLeitwegId } from "./leitweg";
import { extractInvoiceXml, isPdf, PdfError } from "./pdf";
import { RULE_SETS, type RuleSetId, type RuleSetInfo, ruleSet } from "./rules/index";
import { runSchematron } from "./schematron";
import { type InvoiceSummary, summarize } from "./summary";
import { parseXml, XmlError, type XNode } from "./xml";

export type Severity = "error" | "warning" | "info";

export interface ValidationMessage {
  /** Rule id, e.g. "BR-CO-10", "BR-DE-15", or "SUM-…" for Summand's own checks. */
  id: string;
  severity: Severity;
  message: string;
  /** XPath of the element the rule refers to. */
  location?: string;
  /** Line in the invoice XML. */
  line?: number;
  /** Rule set that produced the message ("summand" for Summand's own checks). */
  ruleSet: RuleSetId | "summand";
  /** Set when a rule could not be evaluated, e.g. because an amount is not a number. */
  evaluationError?: string;
}

export interface ValidationResult {
  /** True when there are no errors. Warnings and infos do not make an invoice invalid. */
  valid: boolean;
  syntax?: Syntax;
  profile?: Profile;
  source: {
    type: "xml" | "pdf";
    /** Name of the embedded XML file in a PDF. */
    attachmentName?: string;
    /** Factur-X conformance level from the PDF's XMP metadata. */
    pdfConformanceLevel?: string;
  };
  /** Rule sets that were applied, with versions. */
  ruleSets: RuleSetInfo[];
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  infos: ValidationMessage[];
  summary?: InvoiceSummary;
  /** The invoice XML (extracted from the PDF when the input was a PDF). */
  xml?: string;
  durationMs: number;
}

export interface ValidateOptions {
  /**
   * Which rule sets to apply. "auto" (default) applies EN 16931 for the detected syntax and the
   * XRechnung rules when the document declares XRechnung.
   */
  ruleSets?: "auto" | RuleSetId[];
  /** Apply the XRechnung rules even when the invoice does not declare XRechnung. */
  xrechnung?: boolean;
  /** Check a Leitweg-ID in the buyer reference (BT-10). Default true. */
  leitwegId?: boolean;
  /** Include the invoice XML in the result. Default false. */
  includeXml?: boolean;
  /**
   * How to treat EN 16931 errors in ZUGFeRD / Factur-X EXTENDED invoices. EXTENDED may go beyond
   * EN 16931 (e.g. further charges), so by default ("lenient") these errors are reported as
   * warnings. "strict" keeps them as errors.
   */
  extended?: "lenient" | "strict";
  /**
   * Language of the messages: "en" (default) or "de". German covers all EN 16931 rules and
   * Summand's own checks; the XRechnung rules are German in the original.
   */
  lang?: "en" | "de";
}

export type InvoiceInput = string | Uint8Array | ArrayBuffer;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Decodes XML bytes using the BOM or the encoding in the XML declaration (UTF-8 by default). */
export function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const encoding = /^\s*<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/.exec(head)?.[1]?.toLowerCase();
  if (encoding && encoding !== "utf-8" && encoding !== "utf8") {
    try {
      return new TextDecoder(encoding).decode(bytes);
    } catch {
      // unknown label: fall back to UTF-8
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function summandMessage(
  id: string,
  severity: Severity,
  message: string,
  extra: Partial<ValidationMessage> = {},
): ValidationMessage {
  return { id, severity, message, ruleSet: "summand", ...extra };
}

function finish(
  result: Omit<ValidationResult, "valid" | "durationMs">,
  started: number,
): ValidationResult {
  return {
    valid: result.errors.length === 0,
    ...result,
    durationMs: Math.round((now() - started) * 10) / 10,
  };
}

type Level = "error" | "warning" | "info";

/**
 * Severity changes the KoSIT validator configuration for XRechnung applies on top of the
 * Schematron flags (scenarios.xml of itplr-kosit/validator-configuration-xrechnung, Apache-2.0).
 */
const XRECHNUNG_LEVELS: Record<
  "standard" | "extension" | "cvd",
  Record<"ubl" | "cii", Record<string, Level>>
> = {
  standard: {
    ubl: { "BR-CL-23": "warning", "BR-CL-21": "warning", "UBL-CR-646": "error" },
    cii: {
      "BR-CL-23": "warning",
      "BR-CL-21": "warning",
      "CII-SR-452": "error",
      "CII-SR-453": "error",
      "CII-SR-454": "error",
      "CII-SR-465": "error",
      "CII-SR-466": "error",
      "CII-SR-475": "info",
      "CII-SR-476": "info",
    },
  },
  extension: {
    ubl: {
      "BR-CL-21": "info",
      "BR-CL-23": "warning",
      "BR-CL-24": "info",
      "BR-CL-10": "info",
      "BR-CL-11": "info",
      "BR-CL-25": "info",
      "BR-CL-26": "info",
      "BR-CO-16": "info",
      "UBL-CR-470": "info",
      "UBL-CR-646": "info",
    },
    cii: {
      "BR-CL-23": "warning",
      "BR-CL-21": "info",
      "BR-CL-11": "info",
      "BR-CL-10": "info",
      "BR-CL-24": "info",
      "BR-CL-25": "info",
      "BR-CL-26": "info",
      "CII-SR-452": "error",
      "CII-SR-453": "error",
      "CII-SR-454": "error",
      "CII-SR-465": "error",
      "CII-SR-466": "error",
      "CII-SR-475": "info",
      "CII-SR-476": "info",
    },
  },
  cvd: {
    ubl: {
      "BR-CL-13": "info",
      "BR-CL-23": "warning",
      "BR-CL-21": "warning",
      "UBL-CR-646": "error",
    },
    cii: {
      "BR-CL-13": "info",
      "BR-CL-23": "warning",
      "BR-CL-21": "warning",
      "CII-SR-452": "error",
      "CII-SR-453": "error",
      "CII-SR-454": "error",
      "CII-SR-465": "error",
      "CII-SR-466": "error",
      "CII-SR-475": "info",
      "CII-SR-476": "info",
    },
  },
};

function levelOverrides(detection: Detection, ids: RuleSetId[]): Record<string, Level> {
  if (!ids.some((id) => id.startsWith("xrechnung"))) return {};
  const kind =
    detection.profile.id === "xrechnung-extension"
      ? "extension"
      : detection.profile.id === "xrechnung-cvd"
        ? "cvd"
        : "standard";
  return XRECHNUNG_LEVELS[kind][detection.syntax === "cii" ? "cii" : "ubl"];
}

/** Rule sets "auto" picks for a detected document. */
export function ruleSetsFor(
  detection: Detection,
  options: Pick<ValidateOptions, "xrechnung"> = {},
): RuleSetId[] {
  if (!detection.profile.en16931) return [];
  const suffix = detection.syntax === "cii" ? "cii" : "ubl";
  const ids: RuleSetId[] = [`en16931-${suffix}`];
  if (options.xrechnung || detection.profile.id.startsWith("xrechnung"))
    ids.push(`xrechnung-${suffix}`);
  return ids;
}

/**
 * Validates an e-invoice: UBL or CII XML (XRechnung, ZUGFeRD, Factur-X, Peppol) given as a string
 * or bytes, or a ZUGFeRD / Factur-X PDF given as bytes.
 */
export function validateInvoice(
  input: InvoiceInput,
  options: ValidateOptions = {},
): ValidationResult {
  const started = now();
  const de = options.lang === "de";
  const tr = (en: string, german: string) => (de ? german : en);
  const bytes =
    typeof input === "string"
      ? undefined
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  const base: Omit<ValidationResult, "valid" | "durationMs"> = {
    source: { type: "xml" },
    ruleSets: [],
    errors: [],
    warnings: [],
    infos: [],
  };

  let xml: string;
  if (bytes && isPdf(bytes)) {
    base.source.type = "pdf";
    let extracted: ReturnType<typeof extractInvoiceXml>;
    try {
      extracted = extractInvoiceXml(bytes);
    } catch (e) {
      const message = e instanceof PdfError ? e.message : String(e);
      base.errors.push(
        summandMessage(
          "SUM-PDF",
          "error",
          tr(
            `The PDF could not be read: ${message}`,
            `Das PDF konnte nicht gelesen werden: ${message}`,
          ),
        ),
      );
      return finish(base, started);
    }
    if (!extracted) {
      base.errors.push(
        summandMessage(
          "SUM-PDF",
          "error",
          tr(
            "The PDF contains no embedded invoice XML. A ZUGFeRD / Factur-X invoice must embed the XML (for example factur-x.xml); a plain PDF is not an e-invoice.",
            "Das PDF enthält keine eingebettete Rechnungs-XML. Eine ZUGFeRD- / Factur-X-Rechnung muss die XML einbetten (zum Beispiel factur-x.xml); ein reines PDF ist keine E-Rechnung.",
          ),
        ),
      );
      return finish(base, started);
    }
    xml = extracted.xml;
    if (extracted.name) base.source.attachmentName = extracted.name;
    if (extracted.info.xmpConformanceLevel)
      base.source.pdfConformanceLevel = extracted.info.xmpConformanceLevel;
  } else {
    xml = typeof input === "string" ? input : decodeXml(bytes as Uint8Array);
  }
  if (options.includeXml) base.xml = xml;

  let doc: XNode;
  try {
    doc = parseXml(xml);
  } catch (e) {
    if (!(e instanceof XmlError)) throw e;
    base.errors.push(
      summandMessage(
        "SUM-XML",
        "error",
        tr(
          `The invoice is not well-formed XML: ${e.message}`,
          `Die Rechnung ist kein wohlgeformtes XML: ${e.message}`,
        ),
        {
          line: e.line,
        },
      ),
    );
    return finish(base, started);
  }

  const detection = detect(doc);
  if (detection === "zugferd-1") {
    base.errors.push(
      summandMessage(
        "SUM-FORMAT",
        "error",
        tr(
          "ZUGFeRD 1.0 is not supported and does not comply with EN 16931. Use ZUGFeRD 2.x / Factur-X or XRechnung.",
          "ZUGFeRD 1.0 wird nicht unterstützt und entspricht nicht der EN 16931. Verwenden Sie ZUGFeRD 2.x / Factur-X oder XRechnung.",
        ),
      ),
    );
    return finish(base, started);
  }
  if (detection === "not-an-invoice") {
    base.errors.push(
      summandMessage(
        "SUM-FORMAT",
        "error",
        tr(
          "The document is not an e-invoice: expected a UBL Invoice, UBL CreditNote or UN/CEFACT CrossIndustryInvoice root element.",
          "Das Dokument ist keine E-Rechnung: Erwartet wird ein Wurzelelement UBL Invoice, UBL CreditNote oder UN/CEFACT CrossIndustryInvoice.",
        ),
      ),
    );
    return finish(base, started);
  }
  base.syntax = detection.syntax;
  base.profile = detection.profile;
  base.summary = summarize(doc, detection.syntax);

  if (!detection.profile.en16931) {
    base.errors.push(
      summandMessage(
        "SUM-PROFILE",
        "error",
        tr(
          `${detection.profile.label} does not contain all information EN 16931 requires. It is not an e-invoice under EN 16931 (and not under § 14 UStG in Germany); use the EN 16931, BASIC, EXTENDED or XRechnung profile.`,
          `${detection.profile.label} enthält nicht alle Angaben, die die EN 16931 verlangt. Es ist keine E-Rechnung nach EN 16931 (und in Deutschland nicht nach § 14 UStG); verwenden Sie das Profil EN 16931, BASIC, EXTENDED oder XRechnung.`,
        ),
      ),
    );
  } else if (detection.profile.id === "unknown") {
    base.warnings.push(
      summandMessage(
        "SUM-PROFILE",
        "warning",
        detection.profile.specificationId
          ? tr(
              `Unknown specification identifier (BT-24) "${detection.profile.specificationId}"; validated against EN 16931 only.`,
              `Unbekannte Spezifikationskennung (BT-24) "${detection.profile.specificationId}"; nur gegen EN 16931 geprüft.`,
            )
          : tr(
              "The specification identifier (BT-24) is missing; validated against EN 16931 only.",
              "Die Spezifikationskennung (BT-24) fehlt; nur gegen EN 16931 geprüft.",
            ),
      ),
    );
  }

  const ids =
    options.ruleSets && options.ruleSets !== "auto"
      ? options.ruleSets
      : ruleSetsFor(detection, options);
  const overrides = levelOverrides(detection, ids);
  const lenientExtended =
    detection.profile.id === "factur-x-extended" && options.extended !== "strict";
  if (lenientExtended) {
    base.infos.push(
      summandMessage(
        "SUM-EXTENDED",
        "info",
        tr(
          'ZUGFeRD / Factur-X EXTENDED may contain information beyond EN 16931. EN 16931 rule violations are reported as warnings; validate with extended: "strict" to treat them as errors.',
          'ZUGFeRD / Factur-X EXTENDED darf Angaben über die EN 16931 hinaus enthalten. Verstöße gegen EN-16931-Regeln werden als Warnungen gemeldet; mit extended: "strict" gelten sie als Fehler.',
        ),
      ),
    );
  }
  for (const id of ids) {
    base.ruleSets.push(RULE_SETS[id]);
    for (const f of runSchematron(ruleSet(id), doc, de ? { lang: "de" } : {})) {
      let severity: Severity =
        overrides[f.id] ??
        (f.flag === "warning" ? "warning" : f.flag === "information" ? "info" : "error");
      if (severity === "error" && lenientExtended) severity = "warning";
      const message: ValidationMessage = {
        id: f.id,
        severity,
        message: f.message,
        location: f.location,
        line: f.line,
        ruleSet: id,
        ...(f.evaluationError ? { evaluationError: f.evaluationError } : {}),
      };
      (severity === "error"
        ? base.errors
        : severity === "warning"
          ? base.warnings
          : base.infos
      ).push(message);
    }
  }

  const reference = base.summary.buyerReference;
  if (
    options.leitwegId !== false &&
    reference &&
    looksLikeLeitwegId(reference) &&
    !isValidLeitwegId(reference)
  ) {
    base.warnings.push(
      summandMessage(
        "SUM-LEITWEG",
        "warning",
        tr(
          `The buyer reference (BT-10) "${reference}" looks like a Leitweg-ID, but its check digits are wrong. Public buyers in Germany reject invoices with an unknown Leitweg-ID.`,
          `Die Käuferreferenz (BT-10) "${reference}" sieht aus wie eine Leitweg-ID, aber ihre Prüfziffern stimmen nicht. Öffentliche Auftraggeber in Deutschland weisen Rechnungen mit unbekannter Leitweg-ID zurück.`,
        ),
      ),
    );
  }

  if (base.source.pdfConformanceLevel) {
    const level = base.source.pdfConformanceLevel.toUpperCase().replace(/[\s_-]/g, "");
    const expected: Record<string, string> = {
      "factur-x-minimum": "MINIMUM",
      "factur-x-basic-wl": "BASICWL",
      "factur-x-basic": "BASIC",
      en16931: "EN16931",
      "factur-x-extended": "EXTENDED",
      xrechnung: "XRECHNUNG",
    };
    const want = expected[detection.profile.id];
    if (want && level !== want && !(want === "EN16931" && level === "COMFORT")) {
      base.warnings.push(
        summandMessage(
          "SUM-PDF-LEVEL",
          "warning",
          tr(
            `The PDF metadata declares the profile ${base.source.pdfConformanceLevel}, but the embedded XML uses ${detection.profile.label}.`,
            `Die PDF-Metadaten geben das Profil ${base.source.pdfConformanceLevel} an, die eingebettete XML verwendet aber ${detection.profile.label}.`,
          ),
        ),
      );
    }
  }

  return finish(base, started);
}
