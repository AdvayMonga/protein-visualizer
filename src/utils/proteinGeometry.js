/**
 * Converts parsed PDB atoms into Three.js geometry.
 *
 * PDB coordinates are in Angstroms; typical proteins span 20-200A, which sets the
 * scale for sphere radii and camera distance elsewhere in the app.
 */

import * as THREE from 'three';

/**
 * Builds a smooth tube through the backbone atoms in sequence, tracing the fold.
 *
 * @param {Array<Object>} backboneAtoms - CA atoms from getBackboneAtoms()
 * @returns {THREE.Mesh|THREE.Group} Tube mesh, or an empty group if there is nothing to sweep
 */
export function createBackboneLine(backboneAtoms) {
  const points = backboneAtoms.map(atom => 
    new THREE.Vector3(atom.x, atom.y, atom.z)
  );

  if (points.length < 2) return new THREE.Group();

  // Catmull-Rom fits a curve through the CA positions so the trace reads as a
  // continuous ribbon rather than kinked segments.
  const curve = new THREE.CatmullRomCurve3(points);

  // 4 tubular segments per residue keeps the curve smooth without exploding the
  // vertex count. Radius is a fraction of the residue radius, so the trace stays
  // thinner than the spheres it threads through but never drops below a pixel.
  const radius = getResidueRadius(backboneAtoms) * BACKBONE_RADIUS_RATIO;
  const geometry = new THREE.TubeGeometry(curve, points.length * 4, radius, 8, false);

  // Neutral slate: the trace only needs to show connectivity, so the color budget
  // goes to the residue/chain spheres.
  const material = new THREE.MeshStandardMaterial({
    color: 0x8a9bb0,
    roughness: 0.6,
    metalness: 0.0
  });

  return new THREE.Mesh(geometry, material);
}

/**
 * Builds one sphere per backbone atom, colored by the chosen scheme.
 *
 * @param {Array<Object>} backboneAtoms - CA atoms from getBackboneAtoms()
 * @param {string} colorScheme - 'residue' or 'chain'
 * @returns {Array<THREE.Mesh>}
 */
export function createAtomSpheres(backboneAtoms, colorScheme = 'residue') {
  const spheres = [];

  // One radius for the whole structure, computed once rather than per atom.
  const radius = getResidueRadius(backboneAtoms);

  backboneAtoms.forEach(atom => {
    // 16x16 segments keeps spheres smooth without hurting frame rate on large structures.
    const geometry = new THREE.SphereGeometry(radius, 16, 16);

    const color = colorScheme === 'chain' 
      ? getChainColor(atom.chain) 
      : getResidueColor(atom.residue);
    // MeshStandardMaterial takes the scene lighting, and that bright/shaded gradient
    // is what makes a sphere read as a ball instead of a flat circle.
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.35,
      metalness: 0.05
    });

    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(atom.x, atom.y, atom.z);

    // Carried along for future picking / hover interactions.
    sphere.userData = {
      atomInfo: atom,
      residue: atom.residue,
      residueNum: atom.residueNum,
      chain: atom.chain
    };

    spheres.push(sphere);
  });

  return spheres;
}

/**
 * Shifts atoms so their centroid sits at the origin, which is where the camera looks
 * and what OrbitControls rotates around.
 *
 * @param {Array<Object>} atoms - Atoms to center
 * @returns {Array<Object>} New array; the input is not modified
 */
export function centerProtein(atoms) {
  if (atoms.length === 0) return atoms;

  const avgX = atoms.reduce((sum, a) => sum + a.x, 0) / atoms.length;
  const avgY = atoms.reduce((sum, a) => sum + a.y, 0) / atoms.length;
  const avgZ = atoms.reduce((sum, a) => sum + a.z, 0) / atoms.length;

  console.log(`Centering protein: offset (${avgX.toFixed(2)}, ${avgY.toFixed(2)}, ${avgZ.toFixed(2)})`);

  return atoms.map(atom => ({
    ...atom,
    x: atom.x - avgX,
    y: atom.y - avgY,
    z: atom.z - avgZ
  }));
}

/**
 * Axis-aligned bounding box of the atoms.
 *
 * @param {Array<Object>} atoms
 * @returns {Object} { min, max, size } in each dimension
 */
export function getBoundingBox(atoms) {
  if (atoms.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } };
  }

  const min = { x: atoms[0].x, y: atoms[0].y, z: atoms[0].z };
  const max = { x: atoms[0].x, y: atoms[0].y, z: atoms[0].z };

  atoms.forEach(atom => {
    min.x = Math.min(min.x, atom.x);
    min.y = Math.min(min.y, atom.y);
    min.z = Math.min(min.z, atom.z);
    max.x = Math.max(max.x, atom.x);
    max.y = Math.max(max.y, atom.y);
    max.z = Math.max(max.z, atom.z);
  });

  const size = {
    x: max.x - min.x,
    y: max.y - min.y,
    z: max.z - min.z
  };

  return { min, max, size };
}

/**
 * Largest extent of the protein along any axis. Used to pick a camera distance.
 *
 * @param {Array<Object>} atoms
 * @returns {number}
 */
export function getMaxDimension(atoms) {
  const bbox = getBoundingBox(atoms);
  return Math.max(bbox.size.x, bbox.size.y, bbox.size.z);
}

/**
 * Distance from the origin to the furthest atom, assuming centerProtein() has run.
 *
 * Unlike getMaxDimension this is rotation-independent, which is what the fog needs:
 * the protein presents a different depth to the camera at every orientation, and the
 * fog range has to cover the worst case.
 *
 * @param {Array<Object>} atoms - Centered atoms
 * @returns {number}
 */
export function getBoundingRadius(atoms) {
  if (atoms.length === 0) return 0;

  return atoms.reduce(
    (max, a) => Math.max(max, Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)),
    0
  );
}

/**
 * Radius to draw each residue sphere at.
 *
 * Camera distance scales with the protein, so a fixed radius shrinks on screen as
 * structures get bigger - at 200A a 0.5A sphere is under a pixel across. Scaling with
 * the protein holds the apparent size constant; the floor leaves small proteins at
 * the original 0.5A.
 *
 * That scaling stops at a physical limit rather than a visual one: consecutive alpha
 * carbons sit CA_SPACING apart no matter how large the structure is, so past half
 * that radius neighbouring residues intersect and the chain renders as one fused
 * sausage instead of a row of beads.
 *
 * @param {Array<Object>} atoms
 * @returns {number} Radius in Angstroms
 */

// Distance between consecutive alpha carbons in a polypeptide backbone.
const CA_SPACING = 3.8;

// Held below CA_SPACING / 2 so adjacent residues keep a visible gap rather than
// merging at exactly the point they touch.
const MAX_RESIDUE_RADIUS = CA_SPACING * 0.37;

function getResidueRadius(atoms) {
  const scaled = Math.max(0.5, getMaxDimension(atoms) * 0.016);
  return Math.min(MAX_RESIDUE_RADIUS, scaled);
}

// The backbone trace is drawn at a fraction of the residue radius so it always reads
// as a thread through the spheres rather than a tube swallowing them.
const BACKBONE_RADIUS_RATIO = 0.3;

/** Residue colors grouped by chemical character. */
export const aminoAcidColors = {
  // Hydrophobic - orange
  'ALA': 0xffa500, 'VAL': 0xffa500, 'LEU': 0xffa500, 'ILE': 0xffa500,
  'MET': 0xffa500, 'PHE': 0xffa500, 'TRP': 0xffa500, 'PRO': 0xffa500,
  'GLY': 0xffa500,

  // Polar - green
  'SER': 0x00ff00, 'THR': 0x00ff00, 'TYR': 0x00ff00,
  'ASN': 0x00ff00, 'GLN': 0x00ff00, 'CYS': 0x00ff00,

  // Positively charged - blue
  'LYS': 0x0000ff, 'ARG': 0x0000ff, 'HIS': 0x8080ff,

  // Negatively charged - red
  'ASP': 0xff0000, 'GLU': 0xff0000,

  'default': 0x808080
};

/** Hex color for a three-letter residue code, falling back to gray. */
export function getResidueColor(residueName) {
  return aminoAcidColors[residueName] || aminoAcidColors['default'];
}

/**
 * Chain colors are generated rather than hardcoded: large complexes run A-Z, then
 * a-z, then 0-9, and any fixed palette runs out.
 *
 * Hue steps by the golden ratio, a low-discrepancy sequence - sequential IDs land far
 * apart on the hue circle and stay evenly distributed at any chain count. Random hues
 * would clump into near-duplicate pairs and change on every reload.
 *
 * Hue alone runs out around 30 chains, where the closest pair sits under 5 degrees
 * apart. Cycling saturation and lightness on periods 2 and 3 gives six buckets, so two
 * chains share all three values only if their hues are 15+ degrees apart.
 */
const HUE_STEP = 0.618033988749895;
const SATURATIONS = [0.85, 0.62];
const LIGHTNESSES = [0.72, 0.62, 0.52];

/** Hex color for a chain identifier, derived from the ID so it is stable across reloads. */
export function getChainColor(chain) {
  // Some PDB files leave the chain column blank - nothing to derive a hue from.
  if (!chain) return 0x95a5a6;

  const code = chain.charCodeAt(0);
  return new THREE.Color()
    .setHSL(
      (code * HUE_STEP) % 1,
      SATURATIONS[code % SATURATIONS.length],
      LIGHTNESSES[code % LIGHTNESSES.length]
    )
    .getHex();
}
