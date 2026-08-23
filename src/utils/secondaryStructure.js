/**
 * Secondary Structure
 * ===================
 *
 * Helices and sheets are how people actually parse a fold. A protein is not
 * read as a list of residues but as an arrangement of helices and strands, so a
 * view that does not distinguish them makes the reader do that work themselves.
 *
 * PDB files carry HELIX and SHEET records stating the ranges the depositors
 * assigned, so the assignment does not have to be recomputed from geometry
 * (which is what DSSP does, and would need backbone N, C and O atoms that the
 * alpha carbon trace does not include).
 */

/** Residue is part of an alpha helix (or 3-10 / pi helix). */
export const HELIX = 'helix';

/** Residue is part of a beta strand. */
export const SHEET = 'sheet';

/** Everything else: loops, turns, and termini. */
export const COIL = 'coil';

/**
 * Parses HELIX and SHEET records into residue ranges.
 *
 * The two records place their fields at different columns - SHEET's chain and
 * sequence number sit one position right of HELIX's - which is a detail worth
 * stating because reading both with one set of offsets silently yields ranges
 * that are off by one residue rather than an obvious failure.
 *
 * @param {string} pdbText - The raw text content of a PDB file
 * @returns {Array<Object>} - Ranges with chain, start, end and type
 */
export function parseSecondaryStructure(pdbText) {
  const ranges = [];
  
  for (const line of pdbText.split('\n')) {
    if (line.startsWith('HELIX')) {
      // initChainID column 20, initSeqNum 22-25, endSeqNum 34-37
      ranges.push({
        type: HELIX,
        chain: line.substring(19, 20).trim(),
        start: parseInt(line.substring(21, 25).trim(), 10),
        end: parseInt(line.substring(33, 37).trim(), 10),
      });
      
    } else if (line.startsWith('SHEET')) {
      // initChainID column 22, initSeqNum 23-26, endSeqNum 34-37
      ranges.push({
        type: SHEET,
        chain: line.substring(21, 22).trim(),
        start: parseInt(line.substring(22, 26).trim(), 10),
        end: parseInt(line.substring(33, 37).trim(), 10),
      });
    }
  }
  
  // A malformed record yields NaN bounds, which would match no residue but
  // would also make every comparison against it false in confusing ways
  return ranges.filter(r => Number.isFinite(r.start) && Number.isFinite(r.end));
}

/**
 * Labels each residue with the secondary structure element it belongs to.
 *
 * @param {Array<Object>} backboneAtoms - CA atoms
 * @param {Array<Object>} ranges - Ranges from parseSecondaryStructure()
 * @returns {Array<Object>} - New atom objects carrying a secondaryStructure field
 */
export function assignSecondaryStructure(backboneAtoms, ranges) {
  // Indexed by chain so each lookup only scans that chain's ranges
  const byChain = new Map();
  for (const range of ranges) {
    if (!byChain.has(range.chain)) byChain.set(range.chain, []);
    byChain.get(range.chain).push(range);
  }
  
  return backboneAtoms.map(atom => ({
    ...atom,
    secondaryStructure: classifyResidue(atom, byChain.get(atom.chain)),
  }));
}

/**
 * Finds which element, if any, contains a residue.
 *
 * Matched on sequence number alone. Where a boundary residue carries an
 * insertion code - 52, 52A, 52B in Kabat-numbered antibodies - every residue
 * sharing that number is treated as inside the element, which can extend it by
 * a residue or two. Handling it properly needs the HELIX/SHEET insertion code
 * columns and an ordering rule for coded residues.
 */
function classifyResidue(atom, ranges) {
  if (!ranges) return COIL;
  
  for (const range of ranges) {
    // Ranges are inclusive at both ends
    if (atom.residueNum >= range.start && atom.residueNum <= range.end) {
      return range.type;
    }
  }
  
  return COIL;
}

/**
 * Splits residues into consecutive runs sharing one secondary structure.
 *
 * Runs are what get drawn: a helix is one thick tube along its whole length,
 * not a series of per-residue pieces.
 *
 * @param {Array<Object>} atoms - Residues carrying a secondaryStructure field
 * @returns {Array<Object>} - Runs with their type and atoms
 */
export function groupBySecondaryStructure(atoms) {
  const runs = [];
  
  for (const atom of atoms) {
    const last = runs[runs.length - 1];
    
    if (last && last.type === atom.secondaryStructure) {
      last.atoms.push(atom);
    } else {
      runs.push({ type: atom.secondaryStructure, atoms: [atom] });
    }
  }
  
  return runs;
}
