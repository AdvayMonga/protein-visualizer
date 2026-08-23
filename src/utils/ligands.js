/**
 * Ligand Handling
 * ===============
 *
 * Everything in a PDB file that is not polymer arrives as a HETATM record:
 * drugs, cofactors, metal ions, sugars, and water.
 *
 * These are frequently the reason a structure exists at all. A drug target is
 * deposited precisely to show how the compound binds, and a metalloenzyme's
 * active site is defined by an ion that is a HETATM. Keeping only alpha carbons
 * discards all of it, which can mean discarding the point of the structure.
 *
 * Water is the exception. A high resolution structure can carry hundreds of
 * ordered water molecules, which are real, but drawing them buries the
 * structure in dots. It is separated out and left off by default.
 */

/**
 * Residue names used for water across PDB entries and modelling programs.
 * DOD is heavy water, which appears in neutron structures.
 */
const WATER_RESIDUES = new Set(['HOH', 'WAT', 'DOD', 'H2O', 'TIP', 'SOL']);

/**
 * CPK colouring - the near-universal convention for elements in chemistry.
 * Recognising a structure by its red oxygens and blue nitrogens is muscle
 * memory for anyone who works with molecules, so departing from it would make
 * the display harder to read, not more distinctive.
 */
const ELEMENT_COLORS = {
  H: 0xffffff,
  C: 0x909090,
  N: 0x3050f8,
  O: 0xff0d0d,
  S: 0xffff30,
  P: 0xff8000,
  F: 0x90e050,
  CL: 0x1ff01f,
  BR: 0xa62929,
  I: 0x940094,
  FE: 0xe06633,
  MG: 0x8aff00,
  ZN: 0x7d80b0,
  CA: 0x3dff00,
  NA: 0xab5cf2,
  K: 0x8f40d4,
  MN: 0x9c7ac7,
  CU: 0xc88033,
  CO: 0xf090a0,
  NI: 0x50d050,
  SE: 0xffa100,
};

/** Anything not in the table, deliberately garish so it is noticed. */
const DEFAULT_ELEMENT_COLOR = 0xff1493;

/**
 * Display radii in Angstroms, roughly scaled from van der Waals radii.
 * Not the real radii - those would fuse a ligand into one blob - but kept in
 * proportion so heavier atoms read as larger.
 */
const ELEMENT_RADII = {
  H: 0.25,
  C: 0.35,
  N: 0.34,
  O: 0.33,
  S: 0.42,
  P: 0.42,
};

/** Metals and halogens are drawn larger, as they dominate a site visually. */
const DEFAULT_ELEMENT_RADIUS = 0.5;

/**
 * Determines whether a residue is water.
 *
 * @param {string} residueName - Three-letter residue code
 * @returns {boolean} - True for water
 */
export function isWater(residueName) {
  return WATER_RESIDUES.has(residueName);
}

/**
 * Extracts heteroatoms from a structure.
 *
 * @param {Array<Object>} atoms - All atoms from parsePDB()
 * @param {Object} options - Extraction options
 * @param {boolean} options.includeWater - Keep water molecules
 * @returns {Array<Object>} - Heteroatoms, water included only when asked for
 */
export function getLigandAtoms(atoms, options = {}) {
  const { includeWater = false } = options;
  
  return atoms.filter(atom => {
    if (atom.record !== 'HETATM') return false;
    return includeWater || !isWater(atom.residue);
  });
}

/**
 * Groups heteroatoms into the distinct chemical entities they belong to.
 *
 * A ligand is identified by residue name, chain and sequence number together:
 * a structure with four haems has four HEM groups that differ only by number,
 * and they are separate molecules bound at separate sites.
 *
 * @param {Array<Object>} atoms - All atoms from parsePDB()
 * @param {Object} options - Passed through to getLigandAtoms()
 * @returns {Array<Object>} - One entry per ligand, with its atom count
 */
export function getLigandSummary(atoms, options = {}) {
  const groups = new Map();
  
  for (const atom of getLigandAtoms(atoms, options)) {
    // A ligand modelled in two conformations emits every atom twice, which
    // would report a 43-atom haem as having 86
    if (atom.altLoc && atom.altLoc !== 'A') continue;
    
    // iCode is part of the identity: two ligands can share a sequence number
    const key = `${atom.residue}|${atom.chain}|${atom.residueNum}|${atom.iCode || ''}`;
    
    if (!groups.has(key)) {
      groups.set(key, {
        residue: atom.residue,
        chain: atom.chain,
        residueNum: atom.residueNum,
        iCode: atom.iCode || '',
        atomCount: 0,
      });
    }
    groups.get(key).atomCount += 1;
  }
  
  return Array.from(groups.values()).sort((a, b) => {
    if (a.residue !== b.residue) return a.residue.localeCompare(b.residue);
    if (a.chain !== b.chain) return a.chain.localeCompare(b.chain);
    return a.residueNum - b.residueNum;
  });
}

/**
 * Resolves an atom's element symbol.
 *
 * The element column was added to the format later, so entries deposited before
 * it exists leave it blank. Falling back to the atom name recovers the element
 * for those files - names begin with the element symbol.
 *
 * @param {Object} atom - An atom record
 * @returns {string} - Uppercase element symbol, or empty string
 */
export function resolveElement(atom) {
  if (atom.element) return atom.element.toUpperCase();
  
  // Strip leading digits, which appear in names such as "1HB"
  const match = (atom.name || '').match(/[A-Za-z]+/);
  if (!match) return '';
  
  const letters = match[0].toUpperCase();
  const residue = (atom.residue || '').toUpperCase();
  
  // A monatomic ion names its residue after the element and its single atom the
  // same way, so CA/CA is calcium and ZN/ZN is zinc. This has to be checked
  // first: the one-letter reading below would otherwise call calcium carbon
  if (residue === letters && KNOWN_ELEMENTS.has(letters)) return letters;
  
  // Otherwise prefer the single letter. Taking two unconditionally mis-reads
  // ordinary atom names: a haem's pyrrole nitrogens are named NA, NB, NC, ND,
  // and NA would resolve to sodium and draw a large purple sphere in the middle
  // of the ring
  const oneLetter = letters.slice(0, 1);
  if (KNOWN_ELEMENTS.has(oneLetter)) return oneLetter;
  
  const twoLetter = letters.slice(0, 2);
  if (KNOWN_ELEMENTS.has(twoLetter)) return twoLetter;
  
  return oneLetter;
}

/**
 * Elements that can appear in a structure, used only to disambiguate the
 * one-versus-two letter reading of an atom name in files with no element column.
 */
const KNOWN_ELEMENTS = new Set([
  'H', 'C', 'N', 'O', 'S', 'P', 'F', 'I', 'K', 'B', 'V', 'W', 'U',
  'CL', 'BR', 'FE', 'MG', 'ZN', 'CA', 'NA', 'MN', 'CU', 'CO', 'NI',
  'SE', 'MO', 'CD', 'HG', 'PT', 'AU', 'AG', 'AL', 'SI', 'LI', 'BE',
]);

/**
 * Gets the CPK colour for an element.
 *
 * @param {string} element - Element symbol
 * @returns {number} - Hex color value
 */
export function getElementColor(element) {
  return ELEMENT_COLORS[(element || '').toUpperCase()] ?? DEFAULT_ELEMENT_COLOR;
}

/**
 * Gets the display radius for an element, in Angstroms.
 *
 * @param {string} element - Element symbol
 * @returns {number} - Sphere radius
 */
export function getElementRadius(element) {
  return ELEMENT_RADII[(element || '').toUpperCase()] ?? DEFAULT_ELEMENT_RADIUS;
}
