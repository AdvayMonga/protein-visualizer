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
 *   77-78  Element symbol
 */

/**
 * Extracts every ATOM and HETATM record from PDB text.
 *
 * @param {string} pdbText - Raw contents of a PDB file
 * @returns {Array<Object>} Atoms with serial, name, residue, chain, residueNum, x, y, z, element
 */
export function parsePDB(pdbText) {
  const lines = pdbText.split('\n');
  const atoms = [];

  for (const line of lines) {
    // HETATM covers water, ligands, ions, and modified residues.
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      const atom = {
        serial: parseInt(line.substring(6, 11).trim()),
        name: line.substring(12, 16).trim(),
        residue: line.substring(17, 20).trim(),
        chain: line.substring(21, 22).trim(),
        residueNum: parseInt(line.substring(22, 26).trim()),
        x: parseFloat(line.substring(30, 38).trim()),
        y: parseFloat(line.substring(38, 46).trim()),
        z: parseFloat(line.substring(46, 54).trim()),
        element: line.substring(76, 78).trim(),
      };

      atoms.push(atom);
    }
  }

  return atoms;
}

/**
 * Keeps only alpha carbons - one per residue, enough to trace the fold at a fraction
 * of the atom count.
 *
 * @param {Array<Object>} atoms - All atoms from parsePDB()
 * @returns {Array<Object>} CA atoms only
 */
export function getBackboneAtoms(atoms) {
  return atoms.filter(atom => atom.name === 'CA');
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
 * Summary statistics for the info panel.
 *
 * @param {Array<Object>} atoms
 * @returns {Object} { totalAtoms, residueCount, chainCount, chains }
 */
export function getProteinInfo(atoms) {
  const chains = getChains(atoms);
  const backboneAtoms = getBackboneAtoms(atoms);

  return {
    totalAtoms: atoms.length,
    residueCount: backboneAtoms.length,  // One CA per residue.
    chainCount: chains.length,
    chains: chains,
  };
}
