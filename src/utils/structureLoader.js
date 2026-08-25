/**
 * Structure Loader Module
 * =======================
 *
 * The single entry point for turning a user-selected file into atoms.
 *
 * RCSB offers the same structure in several encodings, and most of them arrive
 * gzipped. This module handles that pipeline:
 *
 *   File -> ArrayBuffer -> (gunzip if needed) -> detect format -> parse -> atoms
 *
 * What is supported:
 * - Legacy PDB (.pdb, .ent, .pdb1)    fixed-width text, the classic format
 * - PDBx/mmCIF (.cif)                 tagged text, the current RCSB standard
 * - BinaryCIF (.bcif)                 MessagePack-encoded mmCIF, smallest and fastest
 * - Biological assemblies             any of the above; RCSB writes the expanded
 *                                     coordinates directly into the file, so they
 *                                     need no special handling beyond multi-model
 *                                     awareness in the parsers
 * - Any of these gzipped (.gz)
 *
 * Detection is by content, not file extension. Assembly downloads use extensions
 * like .pdb1 and .cif that do not map cleanly to a format, and users rename files.
 */

import { parsePDB, getBackboneAtoms } from './pdbParser';
import { parseCIF } from './cifParser';
import { parseBinaryCIF } from './binaryCifParser';

// gzip streams always begin with these two bytes
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

// Human-readable names for the info panel
const FORMAT_LABELS = {
  pdb: 'Legacy PDB',
  cif: 'PDBx/mmCIF',
  bcif: 'BinaryCIF',
};

/**
 * True if the buffer is a gzip stream.
 */
function isGzipped(buffer) {
  if (buffer.byteLength < 2) return false;
  const head = new Uint8Array(buffer, 0, 2);
  return head[0] === GZIP_MAGIC_0 && head[1] === GZIP_MAGIC_1;
}

/**
 * Decompresses a gzip buffer using the browser's built-in DecompressionStream.
 * No library needed - this is native in every current browser.
 *
 * @param {ArrayBuffer} buffer - Compressed bytes
 * @returns {Promise<ArrayBuffer>} - Decompressed bytes
 */
async function gunzip(buffer) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress .gz files. Download the uncompressed version instead.');
  }

  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}

/**
 * Identifies which format a buffer holds by looking at its contents.
 *
 * @param {ArrayBuffer} buffer - Decompressed file bytes
 * @returns {string} - 'pdb', 'cif', or 'bcif'
 */
function detectFormat(buffer) {
  const firstByte = new Uint8Array(buffer, 0, 1)[0];

  // A BinaryCIF file is a MessagePack document whose root is a map, so it starts
  // with a fixmap (0x80-0x8f), map16 (0xde) or map32 (0xdf) tag. No text format
  // starts with those bytes.
  if ((firstByte >= 0x80 && firstByte <= 0x8f) || firstByte === 0xde || firstByte === 0xdf) {
    return 'bcif';
  }

  // Text CIF opens with a data block header, possibly after comments or blank lines
  const head = new TextDecoder('utf-8').decode(buffer.slice(0, 4096));
  for (const line of head.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return trimmed.toLowerCase().startsWith('data_') ? 'cif' : 'pdb';
  }

  return 'pdb';
}

/**
 * Reads a user-selected file and parses it into atoms.
 *
 * @param {File} file - The file from an <input type="file">
 * @returns {Promise<{atoms: Array<Object>, format: string, formatLabel: string}>}
 * @throws {Error} - If the file cannot be decompressed or parsed
 */
export async function loadStructure(file) {
  let buffer = await file.arrayBuffer();

  if (isGzipped(buffer)) {
    buffer = await gunzip(buffer);
  }

  if (buffer.byteLength === 0) {
    throw new Error('The file is empty.');
  }

  const format = detectFormat(buffer);

  let atoms;
  // Kept only for legacy PDB. HEADER, EXPDTA, SEQRES, HELIX and SHEET are read
  // straight from the text by parseHeader() and parseSecondaryStructure(), which
  // have no mmCIF equivalent yet - so those callers get null rather than a format
  // they would misread.
  let pdbText = null;

  if (format === 'bcif') {
    atoms = parseBinaryCIF(buffer);
  } else {
    const text = new TextDecoder('utf-8').decode(buffer);
    if (format === 'cif') {
      atoms = parseCIF(text);
    } else {
      atoms = parsePDB(text);
      pdbText = text;
    }
  }

  if (atoms.length === 0) {
    // Deliberately does not name the detected format: 'pdb' is the fallback when
    // nothing else matched, so a FASTA or a validation PDF lands there and calling
    // it a PDB file would be actively misleading
    throw new Error(
      'No atom coordinates found in this file. Sequence (FASTA), validation and ' +
      'structure-factor downloads are not structures - use a PDB, mmCIF, BinaryCIF ' +
      'or Biological Assembly download instead.'
    );
  }

  // A single bad coordinate is worse than none: getCentroid averages every position,
  // so one NaN spreads to all of them and the structure silently vanishes from an
  // otherwise working viewer
  const broken = atoms.find(a => !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z));
  if (broken) {
    throw new Error(`This file has unreadable coordinates (atom ${broken.serial}).`);
  }

  // The viewer traces alpha carbons, so a structure without them renders as an
  // empty scene. DNA and RNA entries are the common case, and mmCIF/BinaryCIF
  // support makes them easy to reach - say so rather than showing a blank canvas
  if (getBackboneAtoms(atoms).length === 0) {
    throw new Error(
      `Found ${atoms.length} atoms but no protein backbone (alpha carbons). ` +
      'This is usually a DNA or RNA structure, which this viewer cannot draw yet.'
    );
  }

  return { atoms, format, formatLabel: FORMAT_LABELS[format], pdbText };
}
