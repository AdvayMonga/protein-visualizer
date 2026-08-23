/**
 * Converts parsed PDB atoms into Three.js geometry.
 *
 * PDB coordinates are in Angstroms; typical proteins span 20-200A, which sets the
 * scale for sphere radii and camera distance elsewhere in the app.
 */

import * as THREE from 'three';
import { groupBySecondaryStructure, HELIX, SHEET, COIL } from './secondaryStructure';

/**
 * Tube radius per secondary structure element, as a fraction of the residue
 * radius.
 *
 * Expressed as ratios rather than absolute Angstroms so they scale with the
 * structure, for the same reason the sphere radius does: camera distance grows
 * with the protein, so a fixed radius shrinks to nothing on large structures.
 *
 * Thickness alone separates the elements at a glance: fat cylinders read as
 * helices, medium as strands, thin as the loops between them. This is a tube
 * cartoon rather than a true ribbon one - drawing flat ribbons with the correct
 * twist needs the backbone carbonyl oxygens to orient each residue, and a CA
 * trace does not carry them. A ribbon oriented by curve geometry alone twists
 * arbitrarily, which looks worse than an honest tube.
 */
export const SS_RADIUS_RATIOS = {
  [HELIX]: 0.9,
  [SHEET]: 0.7,
  [COIL]: 0.24,
};

export const SS_COLORS = {
  [HELIX]: 0xf05a5a,
  [SHEET]: 0xf5d76e,
  [COIL]: 0xb0b8c4,
};

/**
 * Builds a smooth tube through the backbone atoms, broken wherever the chain is not
 * actually continuous. With showSecondaryStructure it becomes a tube cartoon, varying
 * thickness and colour by helix, strand and coil.
 *
 * @param {Array<Object>} backboneAtoms - CA atoms from getBackboneAtoms()
 * @param {Object} options - Rendering options
 * @param {boolean} options.showSecondaryStructure - Draw as a cartoon
 * @returns {THREE.Group} Group of tube meshes
 */
export function createBackboneLine(backboneAtoms, options = {}) {
  const { showSecondaryStructure = false } = options;

  const group = new THREE.Group();

  // Neutral slate: the plain trace only needs to show connectivity, so the color
  // budget goes to the residue spheres. Shared by every segment, since a large
  // structure can break into hundreds of them.
  const plainMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a9bb0,
    roughness: 0.6,
    metalness: 0.0
  });

  // Computed once rather than per segment, so every segment is drawn at the same
  // thickness.
  const residueRadius = getResidueRadius(backboneAtoms);

  for (const segment of splitIntoSegments(backboneAtoms)) {
    if (showSecondaryStructure) {
      addSecondaryStructureRuns(group, segment, residueRadius);
    } else {
      addTube(group, segment, residueRadius * BACKBONE_RADIUS_RATIO, plainMaterial);
    }
  }

  return group;
}

/**
 * Draws one connected segment as a sequence of helix, strand and coil runs.
 */
function addSecondaryStructureRuns(group, segment, residueRadius) {
  const runs = groupBySecondaryStructure(segment);
  
  runs.forEach((run, index) => {
    const points = [...run.atoms];
    
    // Carry the first residue of the next run into this one so consecutive
    // tubes meet. Without the overlap each change of secondary structure would
    // leave a visible break in the trace
    const next = runs[index + 1];
    if (next) points.push(next.atoms[0]);
    
    const material = new THREE.MeshStandardMaterial({
      color: SS_COLORS[run.type] ?? SS_COLORS[COIL],
      roughness: 0.5,
      metalness: 0.0,
    });
    
    const ratio = SS_RADIUS_RATIOS[run.type] ?? SS_RADIUS_RATIOS[COIL];
    const radius = residueRadius * ratio;
    addTube(group, points, radius, material);
    
    // TubeGeometry has no end caps, so where a thick helix meets a thin coil
    // the wider tube ends on an open, backface-culled ring you can see through.
    // A sphere at the junction, sized to the wider side, fills it
    if (next) {
      const nextRatio = SS_RADIUS_RATIOS[next.type] ?? SS_RADIUS_RATIOS[COIL];
      addJunctionCap(group, next.atoms[0], Math.max(radius, residueRadius * nextRatio), material);
    }
  });
}

/**
 * Fills the open end of a tube where two runs of different radius meet.
 */
function addJunctionCap(group, atom, radius, material) {
  const cap = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 10), material);
  cap.position.set(atom.x, atom.y, atom.z);
  group.add(cap);
}

/**
 * Adds one tube through a run of residues, if it is long enough to define one.
 */
function addTube(group, atoms, radius, material) {
  // A single isolated residue has no neighbour to connect to. Its position is
  // still shown by the atom sphere, so nothing is lost by skipping it here
  if (atoms.length < 2) return;
  
  const points = atoms.map(atom => new THREE.Vector3(atom.x, atom.y, atom.z));
  
  // CatmullRomCurve3 fits a smooth curve through the CA positions,
  // so the trace reads as a continuous ribbon rather than kinked segments
  const curve = new THREE.CatmullRomCurve3(points);
  
  // TubeGeometry sweeps a circle along the curve
  // Parameters: (curve, tubularSegments, radius, radialSegments, closed)
  // - tubularSegments: 4 per residue keeps the curve smooth without exploding vertex count
  const geometry = new THREE.TubeGeometry(curve, points.length * 4, radius, 8, false);
  
  group.add(new THREE.Mesh(geometry, material));
}

/**
 * The longest plausible distance between consecutive alpha carbons, in Angstroms.

/**
 * Longest plausible distance between consecutive alpha carbons, in Angstroms.
 *
 * Peptide bond geometry fixes real CA-CA spacing near 3.8A, dropping to about 2.9A
 * for a cis bond. 4.5A clears coordinate error without admitting real gaps.
 */
export const MAX_CA_GAP = 4.5;

/**
 * Splits backbone atoms into runs of genuinely connected residues.
 *
 * One curve through every CA in file order asserts connectivity that does not exist:
 * it joins the last residue of one chain to the first of the next, and it cuts
 * straight through regions where residues are missing. The second case is the
 * misleading one - a disordered loop is simply absent, so the curve spans the hole as
 * a long straight rod, and a straight rod is what a genuine extended segment looks
 * like.
 *
 * Deliberately not also breaking on a jump in residue numbering: legacy schemes skip
 * numbers by design (trypsin is numbered against chymotrypsinogen), so 3PTB's one
 * continuous chain would fragment into seven pieces. Distance is the physical test.
 *
 * @param {Array<Object>} backboneAtoms - CA atoms in file order
 * @param {number} maxGap - Distance above which residues are not connected
 * @returns {Array<Array<Object>>} Runs of consecutive connected residues
 */
export function splitIntoSegments(backboneAtoms, maxGap = MAX_CA_GAP) {
  const segments = [];
  let current = [];

  for (let i = 0; i < backboneAtoms.length; i++) {
    const atom = backboneAtoms[i];

    if (i > 0) {
      const previous = backboneAtoms[i - 1];
      const differentChain = atom.chain !== previous.chain;
      const tooFar = distanceBetween(previous, atom) > maxGap;

      if (differentChain || tooFar) {
        segments.push(current);
        current = [];
      }
    }

    current.push(atom);
  }

  // The final run has no following break to flush it.
  if (current.length > 0) segments.push(current);

  return segments;
}

/** Straight-line distance between two atoms, in Angstroms. */
function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Builds one sphere per backbone atom, colored by the chosen scheme.
 *
 * @param {Array<Object>} backboneAtoms - CA atoms from getBackboneAtoms()
 * @param {string} colorScheme - 'residue' or 'chain'
 * @param {Object} options - Extra context passed to computeAtomColors()
 * @returns {Array<THREE.Mesh>}
 */
export function createAtomSpheres(backboneAtoms, colorScheme = 'residue', options = {}) {
  const spheres = [];

  // One radius for the whole structure, computed once rather than per atom.
  const radius = getResidueRadius(backboneAtoms);

  // Computed up front because some schemes need the whole structure in view.
  const colors = computeAtomColors(backboneAtoms, colorScheme, options);

  backboneAtoms.forEach((atom, index) => {
    // 16x16 segments keeps spheres smooth without hurting frame rate on large structures.
    const geometry = new THREE.SphereGeometry(radius, 16, 16);

    const color = colors[index];
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
 * Exported so anything drawn alongside the spheres - a selection marker, a ligand -
 * scales with them instead of re-deriving a size.
 *
 * @param {Array<Object>} atoms
 * @returns {number} Radius in Angstroms
 */

// Distance between consecutive alpha carbons in a polypeptide backbone.
const CA_SPACING = 3.8;

// Held below CA_SPACING / 2 so adjacent residues keep a visible gap rather than
// merging at exactly the point they touch.
const MAX_RESIDUE_RADIUS = CA_SPACING * 0.37;

export function getResidueRadius(atoms) {
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
 * AlphaFold's confidence bands, with its published colours.
 *
 * Predicted models store the per-residue confidence score pLDDT in the
 * temperature factor column. It is banded rather than continuous on purpose:
 * the thresholds carry specific meaning, and below 50 a region is more likely
 * to be genuinely disordered than to be a wrong prediction. A smooth ramp would
 * hide exactly the boundary a reader needs to see.
 */
export const PLDDT_BANDS = [
  { min: 90, color: 0x0053d6, label: 'Very high (pLDDT > 90)' },
  { min: 70, color: 0x65cbf3, label: 'Confident (70-90)' },
  { min: 50, color: 0xffdb13, label: 'Low (50-70)' },
  { min: 0, color: 0xff7d45, label: 'Very low (< 50)' },
];

/**
 * Gets the AlphaFold band colour for a pLDDT score.
 *
 * @param {number} plddt - Confidence score, 0-100
 * @returns {number} - Hex color value
 */
export function getPlddtColor(plddt) {
  // Absent rather than low: a residue with no score is not a residue predicted
  // badly, and colouring it as very low would assert something about the model
  if (!Number.isFinite(plddt)) return NO_VALUE_COLOR;
  
  const band = PLDDT_BANDS.find(b => plddt >= b.min);
  return band ? band.color : PLDDT_BANDS[PLDDT_BANDS.length - 1].color;
}

/**
 * Finds the range of temperature factors in a structure.
 *
 * The ramp is normalised to the structure's own range rather than an absolute
 * scale because B-factors are not comparable between entries - a 1.0 A
 * structure and a 3.5 A one occupy entirely different ranges.
 *
 * @param {Array<Object>} atoms - Atoms carrying a bFactor field
 * @returns {{min: number, max: number}} - Observed range
 */
export function getBFactorRange(atoms) {
  if (atoms.length === 0) return { min: 0, max: 0 };
  
  let min = Infinity;
  let max = -Infinity;
  for (const atom of atoms) {
    // Truncated lines give null and malformed ones NaN. Number.isFinite rejects
    // both; a null would otherwise coerce to 0 in the comparisons below and
    // drag the low end of the ramp to zero
    if (!Number.isFinite(atom.bFactor)) continue;
    if (atom.bFactor < min) min = atom.bFactor;
    if (atom.bFactor > max) max = atom.bFactor;
  }
  
  // Every value was unusable
  if (min === Infinity) return { min: 0, max: 0 };
  
  return { min, max };
}

/**
 * Maps a temperature factor onto a blue-to-red ramp.
 *
 * Blue is low and red is high, matching the convention used across structural
 * biology software: cool where the model is well determined, hot where it is
 * uncertain or mobile.
 *
 * @param {number} bFactor - Temperature factor for this atom
 * @param {number} min - Lowest value in the structure
 * @param {number} max - Highest value in the structure
 * @returns {number} - Hex color value
 */
export function getBFactorColor(bFactor, min, max) {
  // An atom with no temperature factor must not be drawn at the blue end, which
  // the legend calls well determined - absent data would masquerade as the most
  // reliable in the structure. Grey reads as "no value" against the ramp
  if (!Number.isFinite(bFactor)) return NO_VALUE_COLOR;
  
  // A structure with a single B-factor value has no gradient to show
  const span = max - min;
  const fraction = span > 0 ? (bFactor - min) / span : 0;
  
  // Hue 0.666 is blue and 0 is red, so invert the fraction to put low at blue
  return new THREE.Color().setHSL((1 - clamp01(fraction)) * 0.666, 0.75, 0.55).getHex();
}

/**
 * Shown for atoms carrying no value under a numeric colour scheme, so they read
 * as unknown rather than as one end of the scale.
 */
export const NO_VALUE_COLOR = 0x808080;

/**
 * Maps a residue's position in its chain onto a blue-to-red ramp.
 *
 * This is the standard "rainbow" view: blue at the N terminus running to red at
 * the C terminus. It is the quickest way to read a fold, because it shows the
 * direction the chain travels and which parts of the structure are sequential
 * neighbours - information a per-residue-type colouring throws away entirely.
 *
 * @param {number} index - Position of the residue within its chain
 * @param {number} total - Number of residues in that chain
 * @returns {number} - Hex color value
 */
export function getPositionColor(index, total) {
  // A single-residue chain has no direction to convey
  const fraction = total > 1 ? index / (total - 1) : 0;
  return new THREE.Color().setHSL((1 - clamp01(fraction)) * 0.666, 0.8, 0.55).getHex();
}

/**
 * Constrains a value to the 0-1 range that setHSL expects.
 */
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Detects a computationally predicted model.
 *
 * This matters because it changes what the temperature factor column means.
 * In an experimental structure a high value marks an uncertain atom; in a
 * predicted model the same column holds pLDDT, where high means confident -
 * the exact opposite. Colouring one as though it were the other inverts the
 * reading of the entire structure.
 *
 * @param {Object|null} header - Parsed header from parseHeader()
 * @returns {boolean} - True when the file appears to be a predicted model
 */
export function looksLikePredictedModel(header) {
  if (!header) return false;
  
  // Some predicted models do declare a method, and it says so: older PDB
  // entries and several modelling tools write "THEORETICAL MODEL". No
  // experimental EXPDTA value contains either word, and treating a non-empty
  // method as proof of an experiment would send those down the B-factor ramp
  // and invert their confidence scores
  if (/THEORETICAL|PREDICT/i.test(header.method || '')) return true;
  
  // Otherwise a real experiment is identified by having a method or resolution
  if (header.method || header.resolution !== null) return false;
  
  // AlphaFold DB and ESMFold announce themselves in the TITLE record instead
  return /ALPHAFOLD|ESMFOLD|PREDICTION/i.test(header.title || '');
}

/**
 * Computes a colour for every atom under the selected scheme.
 *
 * Colours are produced as one array aligned with the atoms rather than per
 * sphere, because two of the schemes need whole-structure context: the
 * temperature factor ramp needs the range across all atoms, and the rainbow
 * needs each residue's position within its chain.
 *
 * @param {Array<Object>} atoms - Atoms to colour
 * @param {string} colorScheme - 'residue', 'chain', 'bfactor' or 'rainbow'
 * @param {Object} options - Extra context
 * @param {boolean} options.isPredicted - Treat bFactor as pLDDT
 * @returns {Array<number>} - Hex colors, one per atom, in the same order
 */
export function computeAtomColors(atoms, colorScheme = 'residue', options = {}) {
  const { isPredicted = false } = options;
  
  if (colorScheme === 'chain') {
    return atoms.map(atom => getChainColor(atom.chain));
  }
  
  if (colorScheme === 'bfactor') {
    if (isPredicted) return atoms.map(atom => getPlddtColor(atom.bFactor));
    
    const { min, max } = getBFactorRange(atoms);
    return atoms.map(atom => getBFactorColor(atom.bFactor, min, max));
  }
  
  if (colorScheme === 'rainbow') {
    // Each chain runs its own full spectrum, so every chain reads N to C.
    // Spreading one spectrum across a whole complex would instead encode chain
    // order, which is an artefact of the file rather than anything structural
    const chainLengths = new Map();
    for (const atom of atoms) {
      chainLengths.set(atom.chain, (chainLengths.get(atom.chain) || 0) + 1);
    }
    
    const seen = new Map();
    return atoms.map(atom => {
      const index = seen.get(atom.chain) || 0;
      seen.set(atom.chain, index + 1);
      return getPositionColor(index, chainLengths.get(atom.chain));
    });
  }
  
  return atoms.map(atom => getResidueColor(atom.residue));
}

/**
 * Colors for protein chains.
 * 
 * Generated rather than hardcoded: large complexes can have dozens of chains
 * (PDB IDs run A-Z, then a-z, then 0-9), and any fixed palette runs out.
 * 
 * Why not Math.random()? Two reasons:
 * 1. Colors would change on every reload, so a chain you are tracking visually
 *    becomes a different color each time the file is loaded.
 * 2. Random hues clump - with 20 chains drawn uniformly you are very likely to
 *    get several near-duplicate pairs, which is the exact problem to avoid.
 * 
 * Instead the hue is derived deterministically from the chain ID. Multiplying by
 * the golden ratio and taking the fractional part is a low-discrepancy sequence:
 * it looks scattered, but sequential IDs (K, L, M...) land far apart on the hue
 * circle and the values stay evenly distributed at any number of chains.

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
