/**
 * BinaryCIF Parser Module
 * =======================
 *
 * Parses BinaryCIF (.bcif) - the same data as mmCIF, encoded for size and speed.
 *
 * Two layers have to be undone to read one:
 *
 * 1. MessagePack. The file is a MessagePack document (a binary JSON, roughly)
 *    holding the block/category/column tree. Decoding it gives plain JS objects.
 *
 * 2. Column encodings. Each column's values are not stored directly - they are a
 *    byte blob plus a list of encoding steps that were applied in order. Decoding
 *    means walking that list backwards and inverting each step.
 *
 * Why the encodings work so well on coordinates:
 * A column of x-coordinates like 20.154, 21.260, 21.198 becomes 20154, 21260, 21198
 * (FixedPoint), then 20154, +1106, -62 (Delta), then packs into small ints
 * (IntegerPacking). Neighbouring atoms are physically close, so the deltas are tiny
 * and most values fit in one or two bytes instead of eight.
 *
 * Output matches parsePDB() and parseCIF(), so downstream code is format-agnostic.
 *
 * Spec: https://github.com/molstar/BinaryCIF
 */

// BinaryCIF type codes -> the typed array that holds that type
const TYPED_ARRAYS = {
  1: Int8Array,
  2: Int16Array,
  3: Int32Array,
  4: Uint8Array,
  5: Uint16Array,
  6: Uint32Array,
  32: Float32Array,
  33: Float64Array,
};

const ATOM_SITE = '_atom_site';

// Tokens in a value position that mean "no value", same as text CIF
const NULL_TOKENS = new Set(['.', '?']);

// ============================================
// LAYER 1: MessagePack
// ============================================

/**
 * Decodes a MessagePack document into plain JavaScript values.
 *
 * MessagePack tags every value with a leading byte saying what it is and how long
 * it is. Small values pack their length into that same byte ("fix" variants), which
 * is why the ranges below look irregular.
 *
 * @param {ArrayBuffer} buffer - The raw file bytes
 * @returns {*} - The decoded top-level value
 */
function decodeMessagePack(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const utf8 = new TextDecoder('utf-8');
  let offset = 0;

  function readString(length) {
    const value = utf8.decode(bytes.subarray(offset, offset + length));
    offset += length;
    return value;
  }

  function readBytes(length) {
    const value = bytes.subarray(offset, offset + length);
    offset += length;
    return value;
  }

  function readArray(length) {
    const value = new Array(length);
    for (let i = 0; i < length; i++) value[i] = read();
    return value;
  }

  function readMap(length) {
    const value = {};
    for (let i = 0; i < length; i++) {
      const key = read();
      value[key] = read();
    }
    return value;
  }

  function read() {
    const tag = view.getUint8(offset);
    offset++;

    // Single-byte values: the tag itself carries the number or short length
    if (tag < 0x80) return tag;                                  // positive fixint
    if (tag < 0x90) return readMap(tag & 0x0f);                  // fixmap
    if (tag < 0xa0) return readArray(tag & 0x0f);                // fixarray
    if (tag < 0xc0) return readString(tag & 0x1f);               // fixstr
    if (tag >= 0xe0) return tag - 256;                           // negative fixint

    switch (tag) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;

      // Binary blobs - this is how column data and string offsets arrive
      case 0xc4: { const n = view.getUint8(offset); offset += 1; return readBytes(n); }
      case 0xc5: { const n = view.getUint16(offset); offset += 2; return readBytes(n); }
      case 0xc6: { const n = view.getUint32(offset); offset += 4; return readBytes(n); }

      case 0xca: { const v = view.getFloat32(offset); offset += 4; return v; }
      case 0xcb: { const v = view.getFloat64(offset); offset += 8; return v; }

      case 0xcc: { const v = view.getUint8(offset); offset += 1; return v; }
      case 0xcd: { const v = view.getUint16(offset); offset += 2; return v; }
      case 0xce: { const v = view.getUint32(offset); offset += 4; return v; }
      // 64-bit ints are read as two 32-bit halves; BinaryCIF never needs the
      // full range, so the precision loss above 2^53 is not reachable here
      case 0xcf: { const hi = view.getUint32(offset); const lo = view.getUint32(offset + 4); offset += 8; return hi * 4294967296 + lo; }

      case 0xd0: { const v = view.getInt8(offset); offset += 1; return v; }
      case 0xd1: { const v = view.getInt16(offset); offset += 2; return v; }
      case 0xd2: { const v = view.getInt32(offset); offset += 4; return v; }
      case 0xd3: { const hi = view.getInt32(offset); const lo = view.getUint32(offset + 4); offset += 8; return hi * 4294967296 + lo; }

      case 0xd9: { const n = view.getUint8(offset); offset += 1; return readString(n); }
      case 0xda: { const n = view.getUint16(offset); offset += 2; return readString(n); }
      case 0xdb: { const n = view.getUint32(offset); offset += 4; return readString(n); }

      case 0xdc: { const n = view.getUint16(offset); offset += 2; return readArray(n); }
      case 0xdd: { const n = view.getUint32(offset); offset += 4; return readArray(n); }

      case 0xde: { const n = view.getUint16(offset); offset += 2; return readMap(n); }
      case 0xdf: { const n = view.getUint32(offset); offset += 4; return readMap(n); }

      default:
        throw new Error(`Unsupported MessagePack tag 0x${tag.toString(16)}`);
    }
  }

  return read();
}

// ============================================
// LAYER 2: Column encodings
// ============================================

/**
 * Reinterprets raw bytes as a typed array.
 * Always the innermost encoding - every chain bottoms out here.
 */
function decodeByteArray(data, encoding) {
  const ArrayType = TYPED_ARRAYS[encoding.type];
  if (!ArrayType) throw new Error(`Unknown BinaryCIF type code ${encoding.type}`);
  // Typed array views require the byte offset to be a multiple of the element
  // size, which subarray() does not guarantee - copy to a fresh buffer instead
  const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new ArrayType(copy);
}

/**
 * Undoes fixed-point scaling: integers back to decimals.
 * Coordinates are stored as thousandths of an Angstrom, so factor is typically 1000.
 */
function decodeFixedPoint(data, encoding) {
  const result = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) result[i] = data[i] / encoding.factor;
  return result;
}

/**
 * Undoes quantization onto an evenly spaced grid between min and max.
 * Used for values with a known bounded range, like occupancy 0..1.
 */
function decodeIntervalQuantization(data, encoding) {
  const step = (encoding.max - encoding.min) / (encoding.numSteps - 1);
  const result = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) result[i] = encoding.min + data[i] * step;
  return result;
}

/**
 * Expands (value, repeatCount) pairs back into the full run.
 * Very effective on columns that barely change, like model number or chain ID.
 */
function decodeRunLength(data, encoding) {
  const ArrayType = TYPED_ARRAYS[encoding.srcType];
  const result = new ArrayType(encoding.srcSize);
  let out = 0;
  for (let i = 0; i < data.length; i += 2) {
    const value = data[i];
    const count = data[i + 1];
    for (let k = 0; k < count; k++) result[out++] = value;
  }
  return result;
}

/**
 * Turns differences back into absolute values by running a cumulative sum.
 * Atom serial numbers 1,2,3,... become 1,1,1,... which then run-length encode to nothing.
 */
function decodeDelta(data, encoding) {
  const ArrayType = TYPED_ARRAYS[encoding.srcType];
  const result = new ArrayType(data.length);
  let running = encoding.origin || 0;
  for (let i = 0; i < data.length; i++) {
    running += data[i];
    result[i] = running;
  }
  return result;
}

/**
 * Unpacks integers that were stored in a narrower type.
 *
 * A value too large for the narrow type is written as a run of saturated values
 * that sum toward it, terminated by a value that is not saturated. So decoding
 * accumulates until a non-limit lands.
 *
 * Which values count as saturated depends on signedness. An unsigned column
 * saturates only at its maximum - 0 is an ordinary value there, and treating it
 * as a continuation marker silently swallows the next entry and shifts the whole
 * rest of the column by one row.
 */
function decodeIntegerPacking(data, encoding) {
  const result = new Int32Array(encoding.srcSize);
  const isOneByte = encoding.byteCount === 1;
  const upper = encoding.isUnsigned
    ? (isOneByte ? 0xff : 0xffff)
    : (isOneByte ? 0x7f : 0x7fff);
  // Signed columns also saturate downwards; unsigned ones have no lower marker,
  // and null never equals a number so the check below simply never fires
  const lower = encoding.isUnsigned ? null : (isOneByte ? -0x80 : -0x8000);

  let i = 0;
  let out = 0;
  while (i < data.length) {
    let value = 0;
    let current = data[i];
    // Saturated values are continuation markers, not the value itself
    while (current === upper || current === lower) {
      value += current;
      i++;
      // A run must be terminated by a non-saturated value. Running off the end
      // means the file is truncated; without this check the read yields undefined,
      // NaN lands in the Int32Array as 0, and the structure comes out subtly wrong
      // with nothing to indicate it
      if (i >= data.length) {
        throw new Error('Malformed BinaryCIF: packed integer run is truncated.');
      }
      current = data[i];
    }
    value += current;
    i++;
    result[out++] = value;
  }
  return result;
}

/**
 * Rebuilds a column of strings from a deduplicated pool.
 *
 * All distinct strings are concatenated into one blob, `offsets` marks where each
 * begins, and the column stores an index per row. Residue names repeat constantly,
 * so this collapses a whole column down to a handful of characters plus indices.
 */
function decodeStringArray(data, encoding) {
  const offsets = decodeColumn(encoding.offsets, encoding.offsetEncoding);
  const indices = decodeColumn(data, encoding.dataEncoding);

  // Index -1 means "no value", so slot 0 holds the empty string and everything
  // shifts up by one
  const pool = [''];
  for (let i = 1; i < offsets.length; i++) {
    pool.push(encoding.stringData.substring(offsets[i - 1], offsets[i]));
  }

  const result = new Array(indices.length);
  for (let i = 0; i < indices.length; i++) result[i] = pool[indices[i] + 1];
  return result;
}

/**
 * Applies one encoding's inverse.
 */
function applyDecoder(data, encoding) {
  switch (encoding.kind) {
    case 'ByteArray': return decodeByteArray(data, encoding);
    case 'FixedPoint': return decodeFixedPoint(data, encoding);
    case 'IntervalQuantization': return decodeIntervalQuantization(data, encoding);
    case 'RunLength': return decodeRunLength(data, encoding);
    case 'Delta': return decodeDelta(data, encoding);
    case 'IntegerPacking': return decodeIntegerPacking(data, encoding);
    case 'StringArray': return decodeStringArray(data, encoding);
    default: throw new Error(`Unknown BinaryCIF encoding "${encoding.kind}"`);
  }
}

/**
 * Walks an encoding chain backwards to recover the original values.
 *
 * @param {Uint8Array} data - The encoded bytes
 * @param {Array<Object>} encodings - Encodings in the order they were applied
 * @returns {ArrayLike} - The decoded values
 */
function decodeColumn(data, encodings) {
  let result = data;
  for (let i = encodings.length - 1; i >= 0; i--) {
    result = applyDecoder(result, encodings[i]);
  }
  return result;
}

// ============================================
// ASSEMBLING ATOMS
// ============================================

/**
 * Parses a BinaryCIF file and extracts all atom information.
 *
 * @param {ArrayBuffer} buffer - The raw (already decompressed) file bytes
 * @returns {Array<Object>} - Atom objects in the same shape parsePDB() returns
 */
export function parseBinaryCIF(buffer) {
  let file;
  try {
    file = decodeMessagePack(buffer);
  } catch (err) {
    // A truncated download trips this deep inside the MessagePack reader, where
    // the message ("Offset is outside the bounds of the DataView") means nothing
    // to someone who just picked a file
    throw new Error('This BinaryCIF file is corrupt or incomplete - try downloading it again.');
  }

  const block = file.dataBlocks && file.dataBlocks[0];
  if (!block) return [];

  const category = block.categories.find(c => c.name === ATOM_SITE);
  if (!category) return [];

  // Decode only the columns we actually render - a bcif file carries dozens
  const columns = {};
  for (const column of category.columns) {
    columns[column.name] = () => decodeColumn(column.data.data, column.data.encoding);
  }

  // Reads the first column that is present, decoding it at most once
  const decoded = {};
  const pick = (...names) => {
    for (const name of names) {
      if (!columns[name]) continue;
      if (!(name in decoded)) decoded[name] = columns[name]();
      return decoded[name];
    }
    return null;
  };

  const group = pick('group_PDB');
  const id = pick('id');
  const atomName = pick('label_atom_id', 'auth_atom_id');
  const altLoc = pick('label_alt_id', 'auth_alt_id');
  const residue = pick('auth_comp_id', 'label_comp_id');
  const chain = pick('auth_asym_id', 'label_asym_id');
  const residueNum = pick('auth_seq_id', 'label_seq_id');
  const insCode = pick('pdbx_PDB_ins_code');
  const x = pick('Cartn_x');
  const y = pick('Cartn_y');
  const z = pick('Cartn_z');
  const occupancy = pick('occupancy');
  const bFactor = pick('B_iso_or_equiv');
  const element = pick('type_symbol');
  const modelNum = pick('pdbx_PDB_model_num');

  // Strings arrive as a JS array; numbers as a typed array. Either way, a missing
  // column yields the same empty value the text parser produces.
  const text = (column, row) => {
    if (!column) return '';
    const value = column[row];
    if (value === undefined || NULL_TOKENS.has(value)) return '';
    return String(value);
  };
  const number = (column, row) => (column ? Number(column[row]) : NaN);
  // Null rather than NaN for absent optional columns, matching parsePDB
  const optional = (column, row) => {
    if (!column) return null;
    const value = Number(column[row]);
    return Number.isFinite(value) ? value : null;
  };

  const atoms = [];
  for (let row = 0; row < category.rowCount; row++) {
    atoms.push({
      // Same ATOM/HETATM distinction the legacy format carries; getBackboneAtoms
      // needs it to tell a calcium ion from an alpha carbon
      record: text(group, row) || 'ATOM',
      serial: number(id, row),
      name: text(atomName, row),
      altLoc: text(altLoc, row),
      residue: text(residue, row),
      chain: text(chain, row),
      residueNum: number(residueNum, row),
      iCode: text(insCode, row),
      x: number(x, row),
      y: number(y, row),
      z: number(z, row),
      occupancy: optional(occupancy, row),
      bFactor: optional(bFactor, row),
      element: text(element, row),
      model: (modelNum ? Number(modelNum[row]) : 0) || 1,
    });
  }

  return atoms;
}
