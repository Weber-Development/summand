/**
 * A small synchronous zlib inflater (RFC 1950/1951), enough to read the embedded invoice from
 * a ZUGFeRD / Factur-X PDF in any JavaScript runtime. Based on the structure of tinf by
 * Jørgen Ibsen (zlib licence).
 */

interface Tree {
  counts: Uint16Array;
  symbols: Uint16Array;
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function buildTree(lengths: ArrayLike<number>, offset: number, count: number): Tree {
  const tree: Tree = { counts: new Uint16Array(16), symbols: new Uint16Array(count) };
  for (let i = 0; i < count; i++) {
    const length = lengths[offset + i] ?? 0;
    tree.counts[length] = (tree.counts[length] ?? 0) + 1;
  }
  tree.counts[0] = 0;
  const offsets = new Uint16Array(16);
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    offsets[i] = sum;
    sum += tree.counts[i] ?? 0;
  }
  for (let i = 0; i < count; i++) {
    const length = lengths[offset + i] ?? 0;
    if (length) {
      const at = offsets[length] ?? 0;
      tree.symbols[at] = i;
      offsets[length] = at + 1;
    }
  }
  return tree;
}

let fixed: { lit: Tree; dist: Tree } | null = null;
function fixedTrees(): { lit: Tree; dist: Tree } {
  if (!fixed) {
    const lengths = new Uint8Array(288);
    lengths.fill(8, 0, 144);
    lengths.fill(9, 144, 256);
    lengths.fill(7, 256, 280);
    lengths.fill(8, 280, 288);
    fixed = { lit: buildTree(lengths, 0, 288), dist: buildTree(new Uint8Array(30).fill(5), 0, 30) };
  }
  return fixed;
}

class Reader {
  pos = 0;
  bit = 0;
  bits = 0;
  constructor(readonly data: Uint8Array) {}

  getBit(): number {
    if (this.bits === 0) {
      if (this.pos >= this.data.length) throw new Error("inflate: unexpected end of data");
      this.bit = this.data[this.pos++] ?? 0;
      this.bits = 8;
    }
    const value = this.bit & 1;
    this.bit >>>= 1;
    this.bits--;
    return value;
  }

  read(count: number, base = 0): number {
    let value = 0;
    for (let i = 0; i < count; i++) value |= this.getBit() << i;
    return value + base;
  }

  decode(tree: Tree): number {
    let sum = 0;
    let cur = 0;
    let len = 0;
    do {
      cur = 2 * cur + this.getBit();
      len++;
      if (len > 15) throw new Error("inflate: invalid code");
      sum += tree.counts[len] ?? 0;
      cur -= tree.counts[len] ?? 0;
    } while (cur >= 0);
    return tree.symbols[sum + cur] ?? 0;
  }
}

function dynamicTrees(r: Reader): { lit: Tree; dist: Tree } {
  const hlit = r.read(5, 257);
  const hdist = r.read(5, 1);
  const hclen = r.read(4, 4);
  const codeLengths = new Uint8Array(19);
  for (let i = 0; i < hclen; i++) codeLengths[CODE_LENGTH_ORDER[i] ?? 0] = r.read(3);
  const codeTree = buildTree(codeLengths, 0, 19);
  const lengths = new Uint8Array(hlit + hdist);
  for (let n = 0; n < hlit + hdist; ) {
    const sym = r.decode(codeTree);
    if (sym < 16) {
      lengths[n++] = sym;
      continue;
    }
    let repeat: number;
    let value = 0;
    if (sym === 16) {
      if (n === 0) throw new Error("inflate: invalid repeat");
      value = lengths[n - 1] ?? 0;
      repeat = r.read(2, 3);
    } else if (sym === 17) {
      repeat = r.read(3, 3);
    } else {
      repeat = r.read(7, 11);
    }
    while (repeat-- > 0) lengths[n++] = value;
  }
  return { lit: buildTree(lengths, 0, hlit), dist: buildTree(lengths, hlit, hdist) };
}

/** Inflates zlib-wrapped data. Throws on corrupt input or when `maxLength` is exceeded. */
export function inflateZlib(data: Uint8Array, maxLength = 16 * 1024 * 1024): Uint8Array {
  if (
    data.length < 2 ||
    ((data[0] ?? 0) & 0x0f) !== 8 ||
    (((data[0] ?? 0) << 8) | (data[1] ?? 0)) % 31 !== 0
  ) {
    throw new Error("inflate: not a zlib stream");
  }
  const r = new Reader(data);
  r.pos = 2;
  let out = new Uint8Array(Math.max(1024, data.length * 4));
  let length = 0;
  const push = (byte: number) => {
    if (length >= out.length) {
      if (out.length >= maxLength) throw new Error("inflate: output too large");
      const next = new Uint8Array(Math.min(maxLength, out.length * 2));
      next.set(out);
      out = next;
    }
    out[length++] = byte;
  };

  let final = 0;
  do {
    final = r.getBit();
    const type = r.read(2);
    if (type === 0) {
      r.bits = 0;
      if (r.pos + 4 > data.length) throw new Error("inflate: unexpected end of data");
      const len = (data[r.pos] ?? 0) | ((data[r.pos + 1] ?? 0) << 8);
      r.pos += 4;
      if (r.pos + len > data.length) throw new Error("inflate: unexpected end of data");
      for (let i = 0; i < len; i++) push(data[r.pos++] ?? 0);
    } else if (type === 1 || type === 2) {
      const { lit, dist } = type === 1 ? fixedTrees() : dynamicTrees(r);
      for (;;) {
        const sym = r.decode(lit);
        if (sym === 256) break;
        if (sym < 256) {
          push(sym);
          continue;
        }
        const index = sym - 257;
        const len = r.read(LENGTH_EXTRA[index] ?? 0, LENGTH_BASE[index] ?? 0);
        const distSym = r.decode(dist);
        const offset = r.read(DIST_EXTRA[distSym] ?? 0, DIST_BASE[distSym] ?? 0);
        if (offset > length) throw new Error("inflate: invalid distance");
        for (let i = 0; i < len; i++) push(out[length - offset] ?? 0);
      }
    } else {
      throw new Error("inflate: invalid block type");
    }
  } while (!final);
  return out.subarray(0, length);
}
