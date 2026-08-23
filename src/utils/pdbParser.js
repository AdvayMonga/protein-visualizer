/**
 * Parsing helpers for PDB (Protein Data Bank) files.
 *
 * ATOM/HETATM records are fixed-width. Column positions below are 1-indexed as in the
 * PDB spec; the substring() calls are 0-indexed, hence the off-by-one.
 *
 *   1-6    Record name ("ATOM  " / "HETATM")
 *   7-11   Atom serial number
 *   13-16  Atom name (CA = alpha carbon)
 *   18-20  Residue name (ALA, GLY, ...)
 *   22     Chain identifier
 *   23-26  Residue sequence number
 *   31-38  X coordinate (Angstroms)
 *   39-46  Y coordinate
 *   47-54  Z coordinate
 *   55-60  Occupancy
 *   61-66  Temperature factor (B-factor)
 *   77-78  Element symbol
 *
 * Everything above the coordinates - HEADER, TITLE, EXPDTA, REMARK, SEQRES - is read
 * by parseHeader(). It answers a question the coordinates cannot: how much of the
 * model is measurement rather than interpretation.
 */

/**
 * Extracts every ATOM and HETATM record from PDB text.
 *
 * MODEL blocks mean two incompatible things, and which one a file intends can only
 * be told from the coordinates - see keepRelevantModels().
 *
 * @param {string} pdbText - Raw contents of a PDB file
 * @returns {Array<Object>} Atoms with record, serial, name, altLoc, residue, chain,
 *   residueNum, iCode, x, y, z, occupancy, bFactor, element, model
 */
export function parsePDB(pdbText) {
  const lines = pdbText.split('\n');
  const atoms = [];

  // Which MODEL block the atoms being read belong to. Files with no MODEL records
  // leave this at 1.
  let model = 1;

  for (const line of lines) {
    // MODEL record: columns 11-14 hold the model serial number
    if (line.startsWith('MODEL')) {
      model = parseInt(line.substring(10, 14).trim()) || model + 1;
      continue;
    }

    // HETATM covers water, ligands, ions, and modified residues.
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      const atom = {
        record: line.substring(0, 6).trim(),
        serial: parseInt(line.substring(6, 11).trim()),
        name: line.substring(12, 16).trim(),
        // Non-blank when a residue was modelled in several conformations.
        altLoc: line.substring(16, 17).trim(),
        residue: line.substring(17, 20).trim(),
        chain: line.substring(21, 22).trim(),
        residueNum: parseInt(line.substring(22, 26).trim()),
        // Lets two residues share a sequence number (52 and 52A), so residueNum
        // alone is not a unique key. Antibody numbering relies on this.
        iCode: line.substring(26, 27).trim(),
        x: parseFloat(line.substring(30, 38).trim()),
        y: parseFloat(line.substring(38, 46).trim()),
        z: parseFloat(line.substring(46, 54).trim()),
        occupancy: toNumberOrNull(line.substring(54, 60).trim()),
        // Positional uncertainty for X-ray, local resolution for cryo-EM, and the
        // pLDDT confidence score for predicted models - where high means the
        // opposite of what it means experimentally. Null rather than NaN when
        // absent, since many tool-written files stop after the Z coordinate.
        bFactor: toNumberOrNull(line.substring(60, 66).trim()),
        element: line.substring(76, 78).trim(),

        // Which MODEL this atom came from (1 for single-model files)
        model: model,
      };

      atoms.push(atom);
    }
  }

  return keepRelevantModels(atoms);
}

// A second model whose centre sits closer to the first than this fraction of the
// structure's own size is taken to be superimposed on it. NMR conformers land far
// below it (they are fitted on top of each other); assembly copies land far above
// (they are moved to their place in the complex), so the exact value is not delicate.
const SUPERIMPOSED_FRACTION = 0.25;

// Floor for that threshold, in Angstroms. Needed because the fraction alone says
// nothing when the first model has no extent to scale against - a single atom, or a
// handful of coincident ones. Two copies of a subunit cannot genuinely sit this close
// anyway; they would occupy the same space.
const MIN_SEPARATION = 5;

/**
 * Decides what a file's MODEL blocks were meant to express, and drops the ones that
 * should not be drawn.
 *
 * MODEL means two incompatible things depending on the file:
 *
 * - An NMR ensemble stores many conformers of one molecule, all fitted on top of each
 *   other. Drawing them together superimposes twenty copies into an unreadable blur,
 *   so only the first belongs on screen.
 * - A biological assembly stores copies of a subunit moved into their places in the
 *   complex, reusing the same chain letters. Here the later models are most of the
 *   structure - dropping them turns hemoglobin's tetramer back into a dimer.
 *
 * Nothing in the MODEL record distinguishes the two, so the coordinates decide it:
 * conformers sit on top of each other, assembly copies sit apart. This is the same
 * reasoning splitIntoSegments uses for chain breaks - the physical test is the honest
 * one when the bookkeeping is ambiguous.
 *
 * @param {Array<Object>} atoms - All parsed atoms, tagged with their model
 * @returns {Array<Object>} Either every atom, or only those of the first model
 */
function keepRelevantModels(atoms) {
  const first = [];
  const second = [];
  let firstModel = null;
  let secondModel = null;

  for (const atom of atoms) {
    if (firstModel === null) firstModel = atom.model;

    if (atom.model === firstModel) {
      first.push(atom);
    } else if (secondModel === null || atom.model === secondModel) {
      secondModel = atom.model;
      second.push(atom);
    }
  }

  // Single-model file: nothing to decide.
  if (second.length === 0) return atoms;

  const firstCentre = centroidOf(first);
  const separation = distance(firstCentre, centroidOf(second));

  // Scale the test to the structure: "far apart" only means anything relative to how
  // big the thing is. Radius rather than diameter, since a copy only has to clear the
  // subunit's own extent to be somewhere else.
  const radius = first.reduce((max, a) => Math.max(max, distance(firstCentre, a)), 0);
  const threshold = Math.max(radius * SUPERIMPOSED_FRACTION, MIN_SEPARATION);

  return separation < threshold ? first : atoms;
}

/** Mean position of a set of atoms. */
function centroidOf(atoms) {
  const sum = atoms.reduce(
    (acc, a) => ({ x: acc.x + a.x, y: acc.y + a.y, z: acc.z + a.z }),
    { x: 0, y: 0, z: 0 }
  );
  return { x: sum.x / atoms.length, y: sum.y / atoms.length, z: sum.z / atoms.length };
}

/** Straight-line distance between two points. */
function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Keeps only alpha carbons - one per residue, enough to trace the fold at a fraction
 * of the atom count.
 *
 * @param {Array<Object>} atoms - All atoms from parsePDB()
 * @returns {Array<Object>} CA atoms only
 */
export function getBackboneAtoms(atoms) {
  return atoms.filter(atom => {
    if (atom.name !== 'CA') return false;

    // A calcium ion is atom CA in residue CA, so name alone would draw it as a
    // residue and count it as one. Tested on residue name rather than record
    // type because modified residues like selenomethionine are HETATM too but
    // genuinely belong to the chain. mmCIF and BinaryCIF carry the same
    // distinction in group_PDB, which their parsers map onto `record`.
    if (atom.record === 'HETATM' && atom.residue === 'CA') return false;

    // Each conformation of an alternate-location residue gets its own CA, which
    // would draw overlapping spheres and count the residue more than once.
    if (atom.altLoc && atom.altLoc !== 'A') return false;

    return true;
  });
}

/**
 * Sorted list of unique chain identifiers.
 *
 * @param {Array<Object>} atoms
 * @returns {Array<string>} e.g. ['A', 'B', 'C']
 */
export function getChains(atoms) {
  const chainSet = new Set(atoms.map(atom => atom.chain));
  return Array.from(chainSet).sort();
}

/**
 * Atoms belonging to a single chain.
 *
 * @param {Array<Object>} atoms
 * @param {string} chainId
 * @returns {Array<Object>}
 */
export function getAtomsByChain(atoms, chainId) {
  return atoms.filter(atom => atom.chain === chainId);
}

/**
 * Filters atoms down to a set of chains.
 *
 * Hiding chains is the main tool for reading a multi-chain structure: what is
 * deposited is the crystal's asymmetric unit, which may hold several copies of a
 * molecule that is functionally a monomer, and in a large complex chains simply
 * occlude each other. Subtracting chains is how those are told apart.
 *
 * @param {Array<Object>} atoms
 * @param {Set<string>|Array<string>} chainIds - Chains to keep
 * @returns {Array<Object>} Atoms belonging to any of the given chains
 */
export function getAtomsByChains(atoms, chainIds) {
  // Set lookup keeps this linear; a large complex has enough chains that
  // Array.includes() per atom becomes a visible cost.
  const wanted = chainIds instanceof Set ? chainIds : new Set(chainIds);
  return atoms.filter(atom => wanted.has(atom.chain));
}

/**
 * Summary statistics for the info panel.
 *
 * @param {Array<Object>} atoms
 * @param {Object|null} header - Parsed header, enabling the SEQRES comparison
 * @returns {Object} { totalAtoms, residueCount, chainCount, chains, chainDetails }
 */
export function getProteinInfo(atoms, header = null) {
  const chains = getChains(atoms);
  const backboneAtoms = getBackboneAtoms(atoms);

  return {
    totalAtoms: atoms.length,
    residueCount: backboneAtoms.length,  // One CA per residue.
    chainCount: chains.length,
    chains: chains,
    chainDetails: getChainDetails(backboneAtoms, header ? header.seqres : null),
  };
}

/**
 * Compares the residues present in the coordinates against the sequence SEQRES says
 * was crystallised.
 *
 * Disordered regions often fail to resolve and are simply absent from the coordinate
 * section, so a model looks complete when it is not. Chains declared in SEQRES with no
 * coordinates at all are included with a count of zero, since a chain that failed
 * entirely is the worst case of that. Nucleic acid chains are skipped - they carry no
 * CA atom by nature and would always look fully missing.
 *
 * @param {Array<Object>} backboneAtoms - CA atoms from getBackboneAtoms()
 * @param {Object|null} seqres - Chain ID to residue name array, or null
 * @returns {Array<Object>} Per-chain observed/expected/missing counts
 */
export function getChainDetails(backboneAtoms, seqres) {
  const observed = new Map();
  for (const atom of backboneAtoms) {
    observed.set(atom.chain, (observed.get(atom.chain) || 0) + 1);
  }

  const chains = new Set(observed.keys());
  if (seqres) {
    for (const chain of Object.keys(seqres)) {
      if (!isNucleicChain(seqres[chain])) chains.add(chain);
    }
  }

  return Array.from(chains).sort().map(chain => {
    // SEQRES is optional; predicted models never carry it.
    const expected = seqres && seqres[chain] ? seqres[chain].length : null;
    const observedCount = observed.get(chain) || 0;

    return {
      chain,
      observedResidues: observedCount,
      expectedResidues: expected,
      // Clamped because a chain can hold modified residues present in the
      // coordinates but absent from SEQRES.
      missingResidues: expected === null ? null : Math.max(0, expected - observedCount),
    };
  });
}

// Nucleotide codes as they appear in SEQRES.
const NUCLEIC_RESIDUES = new Set([
  'A', 'C', 'G', 'U', 'I', 'N',
  'DA', 'DC', 'DG', 'DT', 'DI', 'DU', 'DN',
]);

/**
 * Whether a SEQRES sequence is DNA or RNA rather than protein. Judged by majority so a
 * chain with a few modified nucleotides still counts.
 */
function isNucleicChain(residues) {
  if (!residues || residues.length === 0) return false;

  const nucleic = residues.filter(r => NUCLEIC_RESIDUES.has(r)).length;
  return nucleic > residues.length / 2;
}

/**
 * Reads the header records - everything above the coordinates.
 *
 * @param {string} pdbText - Raw contents of a PDB file
 * @returns {Object} Metadata, with absent fields as null or empty
 */
export function parseHeader(pdbText) {
  const lines = pdbText.split('\n');

  // TITLE and EXPDTA continue across lines; SEQRES lists 13 residues per line.
  const titleParts = [];
  const methodParts = [];
  const seqres = {};

  let idCode = '';
  let classification = '';
  let depositionDate = '';
  let resolution = null;
  let rValue = null;
  let rFree = null;
  let modelCount = 0;

  for (const line of lines) {
    if (line.startsWith('HEADER')) {
      // Classification 11-50, deposition date 51-59, PDB ID 63-66.
      classification = line.substring(10, 50).trim();
      depositionDate = line.substring(50, 59).trim();
      idCode = line.substring(62, 66).trim();

    } else if (line.startsWith('TITLE')) {
      // Text starts at column 11, and its leading space is significant: a word
      // split across lines continues with none, so trimming each part would
      // insert one mid-word. Runs of whitespace are collapsed at the end.
      titleParts.push(line.substring(10));

    } else if (line.startsWith('EXPDTA')) {
      methodParts.push(line.substring(10));

    } else if (line.startsWith('REMARK   2 RESOLUTION.')) {
      // NMR entries say "NOT APPLICABLE", leaving this null.
      const match = line.match(/RESOLUTION\.\s+([\d.]+)\s+ANGSTROM/);
      if (match) resolution = parseFloat(match[1]);

    } else if (line.startsWith('REMARK   3')) {
      // Anchored to the start of the remark text, which is load-bearing: REMARK 3
      // also carries per-shell "BIN R VALUE" and "ESTIMATED ERROR OF FREE R VALUE"
      // lines that would otherwise match and overwrite the overall values. The
      // trailing \s+: likewise stops "FREE R VALUE" matching "FREE R VALUE TEST SET".
      const rMatch = line.match(/^REMARK   3   R VALUE\s+\(WORKING SET[^)]*\)\s+:\s+(\S+)/);
      if (rMatch) rValue = toNumberOrNull(rMatch[1]);
      const freeMatch = line.match(/^REMARK   3   FREE R VALUE\s+:\s+(\S+)/);
      if (freeMatch) rFree = toNumberOrNull(freeMatch[1]);

    } else if (line.startsWith('SEQRES')) {
      // Chain ID at column 12, residue names 20-70.
      const chain = line.substring(11, 12).trim();
      const residues = line.substring(19, 70).trim().split(/\s+/).filter(Boolean);
      if (!seqres[chain]) seqres[chain] = [];
      seqres[chain].push(...residues);

    } else if (line.startsWith('MODEL')) {
      modelCount += 1;
    }
  }

  return {
    idCode,
    classification,
    depositionDate,
    title: collapseWhitespace(titleParts.join('')),
    method: collapseWhitespace(methodParts.join('')),
    resolution,
    rValue,
    rFree,
    seqres,
    // 0 means no MODEL records at all, normal for crystal structures.
    modelCount,
  };
}

/**
 * Collapses whitespace in fields assembled from fixed-width continuation lines.
 */
function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Refinement remarks and truncated coordinate lines both yield non-numeric text.
 *
 * @param {string} raw
 * @returns {number|null} Parsed number, or null if not numeric
 */
function toNumberOrNull(raw) {
  const value = parseFloat(raw);
  return Number.isNaN(value) ? null : value;
}
