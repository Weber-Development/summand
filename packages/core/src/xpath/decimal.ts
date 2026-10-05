/**
 * Exact decimal numbers for xs:decimal and xs:integer. Invoice rules compare sums of amounts,
 * so binary floating point would produce false errors (0.1 + 0.2 != 0.3).
 */
export class Decimal {
  private constructor(
    /** Value is mantissa / 10^scale. */
    readonly mantissa: bigint,
    readonly scale: number,
  ) {}

  static readonly ZERO = new Decimal(0n, 0);

  static fromBigInt(value: bigint): Decimal {
    return new Decimal(value, 0);
  }

  static fromInt(value: number): Decimal {
    return new Decimal(BigInt(Math.trunc(value)), 0);
  }

  /** Parses the xs:decimal lexical form (optional sign, digits, optional fraction). */
  static parse(text: string): Decimal | null {
    const m = /^\s*([+-]?)(\d*)(?:\.(\d*))?\s*$/.exec(text);
    if (!m) return null;
    const intPart = m[2] ?? "";
    const frac = m[3] ?? "";
    if (intPart === "" && frac === "") return null;
    const digits = `${intPart}${frac}`.replace(/^0+(?=\d)/, "") || "0";
    let mantissa = BigInt(digits);
    if (m[1] === "-") mantissa = -mantissa;
    return new Decimal(mantissa, frac.length).normalize();
  }

  /** Converts a finite double exactly enough for invoice arithmetic. */
  static fromNumber(value: number): Decimal | null {
    if (!Number.isFinite(value)) return null;
    if (Number.isInteger(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER) {
      return new Decimal(BigInt(value), 0);
    }
    // Shortest round-trip representation, expanded from exponent notation.
    return Decimal.parse(expandExponent(String(value)));
  }

  private normalize(): Decimal {
    let m = this.mantissa;
    let s = this.scale;
    while (s > 0 && m % 10n === 0n) {
      m /= 10n;
      s--;
    }
    return m === this.mantissa && s === this.scale ? this : new Decimal(m, s);
  }

  private static align(a: Decimal, b: Decimal): [bigint, bigint, number] {
    if (a.scale === b.scale) return [a.mantissa, b.mantissa, a.scale];
    if (a.scale > b.scale)
      return [a.mantissa, b.mantissa * 10n ** BigInt(a.scale - b.scale), a.scale];
    return [a.mantissa * 10n ** BigInt(b.scale - a.scale), b.mantissa, b.scale];
  }

  add(other: Decimal): Decimal {
    const [x, y, s] = Decimal.align(this, other);
    return new Decimal(x + y, s).normalize();
  }

  sub(other: Decimal): Decimal {
    const [x, y, s] = Decimal.align(this, other);
    return new Decimal(x - y, s).normalize();
  }

  mul(other: Decimal): Decimal {
    return new Decimal(this.mantissa * other.mantissa, this.scale + other.scale).normalize();
  }

  /** Division with 24 fractional digits, truncated. Returns null for division by zero. */
  div(other: Decimal): Decimal | null {
    if (other.mantissa === 0n) return null;
    const precision = 24;
    // (a / 10^sa) / (b / 10^sb) = a * 10^(sb + p) / (b * 10^sa) / 10^p
    const numerator = this.mantissa * 10n ** BigInt(other.scale + precision);
    const denominator = other.mantissa * 10n ** BigInt(this.scale);
    return new Decimal(numerator / denominator, precision).normalize();
  }

  /** Integer division truncating toward zero (idiv). */
  idiv(other: Decimal): Decimal | null {
    if (other.mantissa === 0n) return null;
    const [x, y] = Decimal.align(this, other);
    return new Decimal(x / y, 0);
  }

  mod(other: Decimal): Decimal | null {
    if (other.mantissa === 0n) return null;
    const [x, y, s] = Decimal.align(this, other);
    return new Decimal(x % y, s).normalize();
  }

  neg(): Decimal {
    return new Decimal(-this.mantissa, this.scale);
  }

  abs(): Decimal {
    return this.mantissa < 0n ? this.neg() : this;
  }

  floor(): Decimal {
    if (this.scale === 0) return this;
    const f = 10n ** BigInt(this.scale);
    let q = this.mantissa / f;
    if (this.mantissa < 0n && this.mantissa % f !== 0n) q -= 1n;
    return new Decimal(q, 0);
  }

  ceiling(): Decimal {
    return this.neg().floor().neg();
  }

  /** fn:round: rounds half toward positive infinity. */
  round(precision = 0): Decimal {
    if (this.scale <= precision) return this;
    const shift = new Decimal(1n, 0).mulPow10(precision);
    const scaled = this.mul(shift).add(new Decimal(5n, 1)).floor();
    return scaled.div(shift)?.normalize() ?? this;
  }

  /** fn:round-half-to-even. */
  roundHalfEven(precision = 0): Decimal {
    if (this.scale <= precision) return this;
    const drop = BigInt(this.scale - precision);
    const f = 10n ** drop;
    let q = this.mantissa / f;
    const r = this.mantissa % f;
    const twice = (r < 0n ? -r : r) * 2n;
    if (twice > f || (twice === f && q % 2n !== 0n)) q += this.mantissa < 0n ? -1n : 1n;
    return new Decimal(q, precision).normalize();
  }

  private mulPow10(n: number): Decimal {
    return n >= 0
      ? new Decimal(this.mantissa * 10n ** BigInt(n), this.scale)
      : new Decimal(this.mantissa, this.scale - n);
  }

  compare(other: Decimal): number {
    const [x, y] = Decimal.align(this, other);
    return x < y ? -1 : x > y ? 1 : 0;
  }

  isZero(): boolean {
    return this.mantissa === 0n;
  }

  isInteger(): boolean {
    return this.normalize().scale === 0;
  }

  toNumber(): number {
    return Number(this.toString());
  }

  toBigInt(): bigint {
    return this.mantissa / 10n ** BigInt(this.scale);
  }

  /** Canonical xs:decimal string: no exponent, no trailing zeros. */
  toString(): string {
    const n = this.normalize();
    const negative = n.mantissa < 0n;
    let digits = (negative ? -n.mantissa : n.mantissa).toString();
    if (n.scale > 0) {
      digits = digits.padStart(n.scale + 1, "0");
      digits = `${digits.slice(0, digits.length - n.scale)}.${digits.slice(digits.length - n.scale)}`;
    }
    return negative ? `-${digits}` : digits;
  }

  /** Number of fractional digits as written (before normalisation). */
  get fractionDigits(): number {
    return this.normalize().scale;
  }
}

function expandExponent(s: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/i.exec(s);
  if (!m) return s;
  const sign = m[1] ?? "";
  const intPart = m[2] ?? "";
  const frac = m[3] ?? "";
  const exp = Number(m[4]);
  const digits = intPart + frac;
  const point = intPart.length + exp;
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}
