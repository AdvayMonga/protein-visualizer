/**
 * PDB Parser Module
 * =================
 * 
 * This module handles parsing of PDB (Protein Data Bank) files.
 * PDB files are a standard format for storing 3D structural data of biological molecules.
 * 
 * PDB File Format Overview:
 * - Each line in a PDB file is 80 characters wide (historically from punch cards)
 * - Different record types start with specific keywords (ATOM, HETATM, HEADER, etc.)
 * - ATOM records contain the 3D coordinates of atoms in the protein structure
 * - HETATM records contain coordinates for heteroatoms (non-standard residues, water, ligands)
 * 
 * PDB ATOM Record Format (column positions are 1-indexed):
 * Columns  1-6:   Record name "ATOM  " or "HETATM"
 * Columns  7-11:  Atom serial number (integer, right-justified)
 * Columns 13-16:  Atom name (e.g., "CA" for alpha carbon, "N" for nitrogen)
 * Columns 17:     Alternate location indicator (usually blank)
 * Columns 18-20:  Residue name (e.g., "ALA" for Alanine, "GLY" for Glycine)
 * Columns 22:     Chain identifier (A, B, C, etc. for multi-chain proteins)
 * Columns 23-26:  Residue sequence number
 * Columns 27:     Code for insertion of residues
 * Columns 31-38:  X coordinate in Angstroms (8.3 format)
 * Columns 39-46:  Y coordinate in Angstroms (8.3 format)
 * Columns 47-54:  Z coordinate in Angstroms (8.3 format)
 * Columns 55-60:  Occupancy (usually 1.00)
 * Columns 61-66:  Temperature factor (B-factor)
 * Columns 77-78:  Element symbol (right-justified)
 * Columns 79-80:  Charge (if present)
 * 
 * Note: JavaScript uses 0-indexed strings, so we subtract 1 from column numbers
 */

/**
 * Parses a PDB file text and extracts all atom information.
 * 
 * @param {string} pdbText - The raw text content of a PDB file
 * @returns {Array<Object>} - Array of atom objects with coordinates and metadata
 * 
 * @example
 * const atoms = parsePDB(pdbFileContent);
 * // Returns: [{ serial: 1, name: 'N', residue: 'MET', chain: 'A', ... }, ...]
 * 
 * What each property means:
 * - serial: Unique identifier for each atom in the file (1, 2, 3, ...)
 * - name: The atom type (CA = alpha carbon, N = nitrogen, O = oxygen, etc.)
 * - residue: Three-letter code for the amino acid (ALA, GLY, PRO, etc.)
 * - chain: Which polypeptide chain the atom belongs to (A, B, C, etc.)
 * - residueNum: Position of the residue in the protein sequence (1, 2, 3, ...)
 * - x, y, z: 3D coordinates in Angstroms (1 Angstrom = 10^-10 meters)
 * - element: The chemical element (C, N, O, S, etc.)
 */
export function parsePDB(pdbText) {
  // Split the file content into individual lines for processing
  // PDB files use standard newline characters
  const lines = pdbText.split('\n');
  
  // Array to store all parsed atom objects
  const atoms = [];
  
  // Process each line of the PDB file
  for (const line of lines) {
    // We only care about ATOM and HETATM records
    // ATOM: Standard amino acid atoms
    // HETATM: Heteroatoms (water, ligands, modified residues, ions)
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      
      // Extract data from fixed-width columns using substring
      // JavaScript substring(start, end) uses 0-indexed positions
      // PDB format uses 1-indexed columns, so we subtract 1 from start position
      
      const atom = {
        // Atom serial number: columns 7-11 (0-indexed: 6-11)
        // This is a unique identifier for each atom in the file
        serial: parseInt(line.substring(6, 11).trim()),
        
        // Atom name: columns 13-16 (0-indexed: 12-16)
        // Common names: CA (alpha carbon), CB (beta carbon), N (backbone nitrogen)
        // O (backbone oxygen), C (backbone carbonyl carbon)
        name: line.substring(12, 16).trim(),
        
        // Residue name: columns 18-20 (0-indexed: 17-20)
        // Three-letter codes: ALA (Alanine), GLY (Glycine), PRO (Proline), etc.
        // There are 20 standard amino acids plus some modified ones
        residue: line.substring(17, 20).trim(),
        
        // Chain identifier: column 22 (0-indexed: 21-22)
        // Single letter identifying which chain (A, B, C, etc.)
        // Multi-subunit proteins have multiple chains
        chain: line.substring(21, 22).trim(),
        
        // Residue sequence number: columns 23-26 (0-indexed: 22-26)
        // Position of this residue in the protein sequence
        residueNum: parseInt(line.substring(22, 26).trim()),
        
        // X coordinate: columns 31-38 (0-indexed: 30-38)
        // Measured in Angstroms (Å), 1 Å = 0.1 nanometers
        x: parseFloat(line.substring(30, 38).trim()),
        
        // Y coordinate: columns 39-46 (0-indexed: 38-46)
        y: parseFloat(line.substring(38, 46).trim()),
        
        // Z coordinate: columns 47-54 (0-indexed: 46-54)
        z: parseFloat(line.substring(46, 54).trim()),
        
        // Element symbol: columns 77-78 (0-indexed: 76-78)
        // Chemical element: C (carbon), N (nitrogen), O (oxygen), S (sulfur), etc.
        element: line.substring(76, 78).trim(),
      };
      
      // Add the parsed atom to our collection
      atoms.push(atom);
    }
  }
  
  // Return the complete array of parsed atoms
  return atoms;
}

/**
 * Filters atoms to get only the alpha carbon (CA) backbone atoms.
 * 
 * Why Alpha Carbons?
 * - Each amino acid residue has one alpha carbon (CA)
 * - The CA atoms trace the backbone of the protein
 * - Connecting CA atoms gives a simplified view of the protein's overall shape
 * - Much faster to render than all atoms (1 atom per residue vs ~10-20 atoms)
 * 
 * Protein Backbone Structure:
 * The backbone of a protein consists of repeating N-CA-C units:
 * 
 *     O           O           O
 *     ||          ||          ||
 * N - CA - C - N - CA - C - N - CA - C
 *     |           |           |
 *     R1          R2          R3
 * 
 * Where:
 * - N = Nitrogen atom
 * - CA = Alpha carbon (the central carbon)
 * - C = Carbonyl carbon
 * - O = Oxygen atom
 * - R = Side chain (different for each amino acid)
 * 
 * @param {Array<Object>} atoms - Array of all atoms from parsePDB()
 * @returns {Array<Object>} - Array containing only CA atoms
 * 
 * @example
 * const allAtoms = parsePDB(pdbText);  // Might have 1000+ atoms
 * const backbone = getBackboneAtoms(allAtoms);  // Just ~100-200 CA atoms
 */
export function getBackboneAtoms(atoms) {
  // Filter the atoms array to keep only those with name === 'CA'
  // 'CA' stands for Carbon Alpha, the central carbon in each amino acid
  return atoms.filter(atom => atom.name === 'CA');
}

/**
 * Gets unique chain identifiers from the atom data.
 * 
 * Useful for:
 * - Displaying multi-chain proteins with different colors
 * - Selecting specific chains for visualization
 * - Understanding the quaternary structure of a protein
 * 
 * @param {Array<Object>} atoms - Array of atoms from parsePDB()
 * @returns {Array<string>} - Array of unique chain IDs (e.g., ['A', 'B', 'C'])
 */
export function getChains(atoms) {
  // Use Set to automatically remove duplicates
  const chainSet = new Set(atoms.map(atom => atom.chain));
  // Convert back to array and sort alphabetically
  return Array.from(chainSet).sort();
}

/**
 * Filters atoms by a specific chain identifier.
 * 
 * @param {Array<Object>} atoms - Array of atoms from parsePDB()
 * @param {string} chainId - The chain identifier to filter by (e.g., 'A')
 * @returns {Array<Object>} - Atoms belonging only to the specified chain
 */
export function getAtomsByChain(atoms, chainId) {
  return atoms.filter(atom => atom.chain === chainId);
}

/**
 * Gets information about the protein structure.
 * 
 * @param {Array<Object>} atoms - Array of atoms from parsePDB()
 * @returns {Object} - Summary statistics about the protein
 */
export function getProteinInfo(atoms) {
  const chains = getChains(atoms);
  const backboneAtoms = getBackboneAtoms(atoms);
  
  return {
    totalAtoms: atoms.length,
    residueCount: backboneAtoms.length,  // One CA per residue
    chainCount: chains.length,
    chains: chains,
  };
}
