/**
 * Protein Geometry Module
 * =======================
 * 
 * This module converts parsed PDB atom data into Three.js 3D geometry objects.
 * Three.js is a JavaScript library that makes WebGL (3D graphics in the browser) easy to use.
 * 
 * Key Three.js Concepts Used:
 * 
 * 1. THREE.Vector3 - A point in 3D space (x, y, z)
 *    - Used to represent atom positions
 *    - Can be used for positions, directions, or any 3D vector
 * 
 * 2. THREE.BufferGeometry - The shape/vertices of an object
 *    - More efficient than older Geometry class
 *    - Stores vertex data in typed arrays for GPU performance
 * 
 * 3. THREE.Material - How a surface appears (color, texture, shininess)
 *    - LineBasicMaterial: Simple colored lines
 *    - MeshBasicMaterial: Simple colored surfaces, not affected by lights
 *    - MeshStandardMaterial: Realistic material that responds to lights
 * 
 * 4. THREE.Mesh - A 3D object = Geometry + Material
 *    - Combines what shape something is (geometry) with how it looks (material)
 * 
 * 5. THREE.Line - A line object = Geometry + Material
 *    - Used for drawing the backbone connections
 * 
 * Coordinate System:
 * - Three.js uses a right-handed coordinate system
 * - X: right, Y: up, Z: towards viewer
 * - PDB coordinates are in Angstroms (1Å = 10^-10 meters)
 * - Typical protein dimensions: 20-200 Angstroms
 */

import * as THREE from 'three';

/**
 * Creates a line that connects all backbone atoms in sequence.
 * This visualizes the protein's backbone trace - the overall shape/fold.
 * 
 * The backbone line is the simplest visualization of a protein:
 * - Connects each CA atom to the next CA atom
 * - Shows how the protein chain winds through 3D space
 * - Similar to a "tube" representation but just as a line
 * 
 * @param {Array<Object>} backboneAtoms - Array of CA atoms from getBackboneAtoms()
 * @returns {THREE.Line} - A Three.js Line object ready to be added to the scene
 * 
 * @example
 * const backbone = getBackboneAtoms(atoms);
 * const line = createBackboneLine(backbone);
 * scene.add(line);  // Add to Three.js scene
 */
export function createBackboneLine(backboneAtoms) {
  // Convert each atom's coordinates into a THREE.Vector3 point
  // THREE.Vector3 is Three.js's way of representing a point in 3D space
  const points = backboneAtoms.map(atom => 
    new THREE.Vector3(atom.x, atom.y, atom.z)
  );
  
  // Create geometry from the points array
  // BufferGeometry is more efficient than the old Geometry class
  // setFromPoints() creates a geometry where each point is a vertex
  // When used with a Line, vertices are connected in order
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  
  // Create a material for the line
  // LineBasicMaterial is the simplest line material
  // Properties:
  // - color: Hex color value (0x00ff00 = bright green)
  // - linewidth: Note - linewidth > 1 only works on some systems (not WebGL)
  const material = new THREE.LineBasicMaterial({ 
    color: 0x00ff00,  // Bright green - easy to see against dark background
    linewidth: 2      // Note: May not work in WebGL (browser limitation)
  });
  
  // Combine geometry and material into a Line object
  // THREE.Line draws connected line segments through the vertices
  return new THREE.Line(geometry, material);
}

/**
 * Creates sphere meshes for each backbone atom.
 * This provides a "ball" representation of each residue position.
 * 
 * Why spheres?
 * - Each sphere marks the position of an alpha carbon
 * - Easier to see individual residue positions
 * - Can be colored by different properties (residue type, chain, etc.)
 * - Combined with the backbone line, gives a "ball and stick" appearance
 * 
 * @param {Array<Object>} backboneAtoms - Array of CA atoms from getBackboneAtoms()
 * @param {string} colorScheme - 'residue' or 'chain' to determine coloring
 * @returns {Array<THREE.Mesh>} - Array of sphere mesh objects
 * 
 * @example
 * const spheres = createAtomSpheres(backbone, 'residue');
 * spheres.forEach(sphere => scene.add(sphere));
 */
export function createAtomSpheres(backboneAtoms, colorScheme = 'residue') {
  // Array to collect all the sphere meshes
  const spheres = [];
  
  // Create a sphere for each backbone atom
  backboneAtoms.forEach(atom => {
    // SphereGeometry creates a sphere shape
    // Parameters: (radius, widthSegments, heightSegments)
    // - radius: 0.5 Angstroms - reasonable size for visualization
    // - widthSegments: 16 - how many horizontal divisions (more = smoother)
    // - heightSegments: 16 - how many vertical divisions (more = smoother)
    // Lower values = faster rendering, higher values = smoother spheres
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    
    // MeshBasicMaterial is a simple material that doesn't respond to lights
    // Good for quick visualization, always appears the same brightness
    // For more realistic lighting, use MeshStandardMaterial instead
    // Color based on selected scheme: residue type or chain
    const color = colorScheme === 'chain' 
      ? getChainColor(atom.chain) 
      : getResidueColor(atom.residue);
    const material = new THREE.MeshBasicMaterial({ 
      color: color 
    });
    
    // Create the mesh by combining geometry and material
    // A mesh is a renderable 3D object
    const sphere = new THREE.Mesh(geometry, material);
    
    // Position the sphere at the atom's coordinates
    // position.set(x, y, z) moves the sphere to those coordinates
    sphere.position.set(atom.x, atom.y, atom.z);
    
    // Store additional data on the sphere for potential interactivity
    // userData is a Three.js property for storing custom data
    sphere.userData = {
      atomInfo: atom,  // Reference to original atom data
      residue: atom.residue,
      residueNum: atom.residueNum,
      chain: atom.chain
    };
    
    // Add the sphere to our collection
    spheres.push(sphere);
  });
  
  return spheres;
}

/**
 * Centers the protein at the origin (0, 0, 0) for optimal viewing.
 * 
 * Why center?
 * - PDB coordinates are in the crystallographic reference frame
 * - Proteins can be located anywhere in 3D space
 * - Centering puts the protein at the camera's natural focus point
 * - Makes rotation orbit around the protein's center
 * - Prevents the protein from being off-screen when loaded
 * 
 * The centering process:
 * 1. Calculate the average (centroid) of all atom positions
 * 2. Subtract the centroid from each atom's position
 * 3. Result: protein is centered at (0, 0, 0)
 * 
 * @param {Array<Object>} atoms - Array of atoms to center
 * @returns {Array<Object>} - New array with centered coordinates (original unchanged)
 * 
 * @example
 * const centeredAtoms = centerProtein(backbone);
 * // Now the protein's center of mass is at (0, 0, 0)
 */
export function centerProtein(atoms) {
  // Handle empty input gracefully
  if (atoms.length === 0) return atoms;
  
  // Calculate the centroid (average position) in each dimension
  // Sum all x coordinates, then divide by count to get average
  const avgX = atoms.reduce((sum, a) => sum + a.x, 0) / atoms.length;
  const avgY = atoms.reduce((sum, a) => sum + a.y, 0) / atoms.length;
  const avgZ = atoms.reduce((sum, a) => sum + a.z, 0) / atoms.length;
  
  // Log the offset for debugging purposes
  console.log(`Centering protein: offset (${avgX.toFixed(2)}, ${avgY.toFixed(2)}, ${avgZ.toFixed(2)})`);
  
  // Create new atom objects with shifted coordinates
  // We use the spread operator (...atom) to copy all existing properties
  // Then override x, y, z with the centered values
  // This creates a new array without modifying the original
  return atoms.map(atom => ({
    ...atom,  // Copy all existing properties (serial, name, residue, etc.)
    x: atom.x - avgX,  // Shift x coordinate
    y: atom.y - avgY,  // Shift y coordinate
    z: atom.z - avgZ   // Shift z coordinate
  }));
}

/**
 * Calculates the bounding box of the protein.
 * Useful for:
 * - Determining appropriate camera distance
 * - Scaling the visualization
 * - Creating enclosing geometry
 * 
 * @param {Array<Object>} atoms - Array of atoms
 * @returns {Object} - Object with min, max, and size in each dimension
 */
export function getBoundingBox(atoms) {
  if (atoms.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } };
  }
  
  // Initialize with first atom's coordinates
  const min = { x: atoms[0].x, y: atoms[0].y, z: atoms[0].z };
  const max = { x: atoms[0].x, y: atoms[0].y, z: atoms[0].z };
  
  // Find min and max in each dimension
  atoms.forEach(atom => {
    min.x = Math.min(min.x, atom.x);
    min.y = Math.min(min.y, atom.y);
    min.z = Math.min(min.z, atom.z);
    max.x = Math.max(max.x, atom.x);
    max.y = Math.max(max.y, atom.y);
    max.z = Math.max(max.z, atom.z);
  });
  
  // Calculate size (extent) in each dimension
  const size = {
    x: max.x - min.x,
    y: max.y - min.y,
    z: max.z - min.z
  };
  
  return { min, max, size };
}

/**
 * Calculates the maximum dimension of the protein.
 * Useful for setting camera distance.
 * 
 * @param {Array<Object>} atoms - Array of atoms
 * @returns {number} - The largest dimension (x, y, or z extent)
 */
export function getMaxDimension(atoms) {
  const bbox = getBoundingBox(atoms);
  return Math.max(bbox.size.x, bbox.size.y, bbox.size.z);
}

/**
 * Color schemes for amino acids.
 * Different color schemes help visualize different properties:
 * 
 * - byType: Colors based on chemical properties (hydrophobic, polar, charged)
 * - byElement: Standard CPK coloring (carbon=gray, nitrogen=blue, oxygen=red)
 * 
 * The amino acid classification used:
 * - Hydrophobic (orange): ALA, VAL, LEU, ILE, MET, PHE, TRP, PRO, GLY
 * - Polar (green): SER, THR, TYR, ASN, GLN, CYS
 * - Positive charge (blue): LYS, ARG, HIS
 * - Negative charge (red): ASP, GLU
 */
export const aminoAcidColors = {
  // Hydrophobic residues - orange tones
  'ALA': 0xffa500, 'VAL': 0xffa500, 'LEU': 0xffa500, 'ILE': 0xffa500,
  'MET': 0xffa500, 'PHE': 0xffa500, 'TRP': 0xffa500, 'PRO': 0xffa500,
  'GLY': 0xffa500,
  
  // Polar residues - green tones
  'SER': 0x00ff00, 'THR': 0x00ff00, 'TYR': 0x00ff00,
  'ASN': 0x00ff00, 'GLN': 0x00ff00, 'CYS': 0x00ff00,
  
  // Positively charged - blue
  'LYS': 0x0000ff, 'ARG': 0x0000ff, 'HIS': 0x8080ff,
  
  // Negatively charged - red
  'ASP': 0xff0000, 'GLU': 0xff0000,
  
  // Default for unknown residues
  'default': 0x808080
};

/**
 * Color scheme for protein chains.
 * Each chain (A, B, C, etc.) gets a distinct color.
 */
export const chainColors = {
  'A': 0x3498db, // Blue
  'B': 0xe74c3c, // Red
  'C': 0x2ecc71, // Green
  'D': 0xf39c12, // Orange
  'E': 0x9b59b6, // Purple
  'F': 0x1abc9c, // Teal
  'G': 0xe91e63, // Pink
  'H': 0x00bcd4, // Cyan
  'I': 0xff5722, // Deep Orange
  'J': 0x795548, // Brown
  'default': 0x95a5a6 // Gray
};

/**
 * Gets the color for a specific amino acid residue.
 * 
 * @param {string} residueName - Three-letter residue code (e.g., 'ALA')
 * @returns {number} - Hex color value for Three.js materials
 */
export function getResidueColor(residueName) {
  return aminoAcidColors[residueName] || aminoAcidColors['default'];
}

/**
 * Gets the color for a specific chain.
 * 
 * @param {string} chain - Single-letter chain identifier (e.g., 'A')
 * @returns {number} - Hex color value for Three.js materials
 */
export function getChainColor(chain) {
  return chainColors[chain] || chainColors['default'];
}
