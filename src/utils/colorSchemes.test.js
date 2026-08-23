/**
 * Tests for the colour schemes.
 *
 * Colours are compared by hue rather than exact hex where the point is the
 * direction of the ramp, since the exact value depends on saturation and
 * lightness choices that are free to change.
 */

import * as THREE from 'three';
import {
  computeAtomColors,
  NO_VALUE_COLOR,
  getBFactorRange,
  getBFactorColor,
  getPlddtColor,
  getPositionColor,
  looksLikePredictedModel,
  PLDDT_BANDS,
} from './proteinGeometry';

/**
 * Extracts the hue, in degrees, of a hex colour.
 */
function hueOf(hex) {
  const hsl = {};
  new THREE.Color(hex).getHSL(hsl);
  return hsl.h * 360;
}

const BLUE = 240;
const RED = 0;

describe('getBFactorRange', () => {
  it('finds the lowest and highest values', () => {
    const atoms = [{ bFactor: 12.5 }, { bFactor: 3.1 }, { bFactor: 80.0 }];

    expect(getBFactorRange(atoms)).toEqual({ min: 3.1, max: 80.0 });
  });

  it('ignores unparseable values rather than poisoning the range', () => {
    const atoms = [{ bFactor: 10 }, { bFactor: NaN }, { bFactor: 50 }];

    expect(getBFactorRange(atoms)).toEqual({ min: 10, max: 50 });
  });

  it('ignores null values, which would otherwise coerce to zero', () => {
    // Truncated lines parse to null, and null < min is a numeric comparison
    // that would drag the low end of the ramp down to 0
    const atoms = [{ bFactor: 10 }, { bFactor: null }, { bFactor: 50 }];

    expect(getBFactorRange(atoms)).toEqual({ min: 10, max: 50 });
  });

  it('returns a zero range for an empty structure', () => {
    expect(getBFactorRange([])).toEqual({ min: 0, max: 0 });
  });

  it('returns a zero range when no value is usable', () => {
    expect(getBFactorRange([{ bFactor: NaN }])).toEqual({ min: 0, max: 0 });
  });
});

describe('getBFactorColor', () => {
  it('puts the lowest value at blue', () => {
    expect(hueOf(getBFactorColor(10, 10, 90))).toBeCloseTo(BLUE, 0);
  });

  it('puts the highest value at red', () => {
    expect(hueOf(getBFactorColor(90, 10, 90))).toBeCloseTo(RED, 0);
  });

  it('places a mid value between the two', () => {
    const hue = hueOf(getBFactorColor(50, 10, 90));

    expect(hue).toBeGreaterThan(RED);
    expect(hue).toBeLessThan(BLUE);
  });

  it('handles a structure where every atom shares one value', () => {
    // No gradient exists, so this must not divide by zero
    expect(() => getBFactorColor(20, 20, 20)).not.toThrow();
    expect(hueOf(getBFactorColor(20, 20, 20))).toBeCloseTo(BLUE, 0);
  });

  it('shows an atom with no temperature factor as neither end of the ramp', () => {
    // Blue is the legend's "well determined" end; absent data must not
    // masquerade as the most reliable in the structure
    expect(getBFactorColor(null, 10, 90)).toBe(NO_VALUE_COLOR);
    expect(getBFactorColor(NaN, 10, 90)).toBe(NO_VALUE_COLOR);
  });

  it('clamps values outside the supplied range', () => {
    expect(hueOf(getBFactorColor(-5, 0, 100))).toBeCloseTo(BLUE, 0);
    expect(hueOf(getBFactorColor(200, 0, 100))).toBeCloseTo(RED, 0);
  });
});

describe('getPlddtColor', () => {
  it('uses the very high band above 90', () => {
    expect(getPlddtColor(95)).toBe(PLDDT_BANDS[0].color);
  });

  it('uses the confident band between 70 and 90', () => {
    expect(getPlddtColor(80)).toBe(PLDDT_BANDS[1].color);
  });

  it('uses the low band between 50 and 70', () => {
    expect(getPlddtColor(60)).toBe(PLDDT_BANDS[2].color);
  });

  it('uses the very low band below 50', () => {
    expect(getPlddtColor(30)).toBe(PLDDT_BANDS[3].color);
  });

  it('treats a band boundary as belonging to the higher band', () => {
    expect(getPlddtColor(90)).toBe(PLDDT_BANDS[0].color);
    expect(getPlddtColor(70)).toBe(PLDDT_BANDS[1].color);
  });

  it('shows a missing score as unknown rather than as very low confidence', () => {
    // A residue with no score is not a residue predicted badly
    expect(getPlddtColor(NaN)).toBe(NO_VALUE_COLOR);
    expect(getPlddtColor(null)).toBe(NO_VALUE_COLOR);
  });
});

describe('getPositionColor', () => {
  it('puts the N terminus at blue', () => {
    expect(hueOf(getPositionColor(0, 100))).toBeCloseTo(BLUE, 0);
  });

  it('puts the C terminus at red', () => {
    expect(hueOf(getPositionColor(99, 100))).toBeCloseTo(RED, 0);
  });

  it('handles a single-residue chain without dividing by zero', () => {
    expect(() => getPositionColor(0, 1)).not.toThrow();
  });
});

describe('looksLikePredictedModel', () => {
  it('recognises an AlphaFold model', () => {
    const header = {
      method: '',
      resolution: null,
      title: 'ALPHAFOLD MONOMER V2.0 PREDICTION FOR EPIDERMAL GROWTH FACTOR RECEPTOR',
    };

    expect(looksLikePredictedModel(header)).toBe(true);
  });

  it('rejects an experimental structure', () => {
    const header = {
      method: 'X-RAY DIFFRACTION',
      resolution: 1.5,
      title: 'WATER STRUCTURE OF A HYDROPHOBIC PROTEIN',
    };

    expect(looksLikePredictedModel(header)).toBe(false);
  });

  it('rejects an NMR structure, which also has no resolution', () => {
    const header = {
      method: 'SOLUTION NMR',
      resolution: null,
      title: 'NMR STRUCTURE OF TRP-CAGE',
    };

    expect(looksLikePredictedModel(header)).toBe(false);
  });

  it('recognises a model declaring EXPDTA THEORETICAL MODEL', () => {
    // Older entries and several modelling tools declare a method; treating any
    // method as proof of an experiment would invert their confidence scores
    const header = {
      method: 'THEORETICAL MODEL',
      resolution: null,
      title: 'HOMOLOGY MODEL OF SOMETHING',
    };

    expect(looksLikePredictedModel(header)).toBe(true);
  });

  it('rejects a file with no header at all', () => {
    expect(looksLikePredictedModel(null)).toBe(false);
  });

  it('rejects a headerless file with no telling title', () => {
    expect(
      looksLikePredictedModel({ method: '', resolution: null, title: '' })
    ).toBe(false);
  });
});

describe('computeAtomColors', () => {
  const atoms = [
    { chain: 'A', residue: 'ALA', bFactor: 10 },
    { chain: 'A', residue: 'ASP', bFactor: 50 },
    { chain: 'B', residue: 'ALA', bFactor: 90 },
  ];

  it('returns one colour per atom', () => {
    expect(computeAtomColors(atoms, 'residue')).toHaveLength(3);
  });

  it('gives identical residues the same colour under the residue scheme', () => {
    const colors = computeAtomColors(atoms, 'residue');

    expect(colors[0]).toBe(colors[2]);
    expect(colors[0]).not.toBe(colors[1]);
  });

  it('gives atoms of one chain the same colour under the chain scheme', () => {
    const colors = computeAtomColors(atoms, 'chain');

    expect(colors[0]).toBe(colors[1]);
    expect(colors[0]).not.toBe(colors[2]);
  });

  it('reads the bFactor column as pLDDT for predicted models', () => {
    const asExperimental = computeAtomColors(atoms, 'bfactor', { isPredicted: false });
    const asPredicted = computeAtomColors(atoms, 'bfactor', { isPredicted: true });

    // 90 is the top of the range either way, but the two schemes disagree about
    // what that means, so they must not produce the same colour
    expect(asPredicted[2]).toBe(PLDDT_BANDS[0].color);
    expect(asExperimental[2]).not.toBe(asPredicted[2]);
  });

  it('restarts the rainbow for each chain', () => {
    // Chain B holds a single residue, so it sits at the start of its own
    // spectrum rather than at the end of a spectrum spanning the whole file
    const colors = computeAtomColors(atoms, 'rainbow');

    expect(hueOf(colors[0])).toBeCloseTo(BLUE, 0);
    expect(hueOf(colors[1])).toBeCloseTo(RED, 0);
    expect(hueOf(colors[2])).toBeCloseTo(BLUE, 0);
  });

  it('runs the rainbow from N to C within a chain', () => {
    const chain = Array.from({ length: 5 }, () => ({ chain: 'A', residue: 'GLY', bFactor: 0 }));

    const colors = computeAtomColors(chain, 'rainbow');

    expect(hueOf(colors[0])).toBeCloseTo(BLUE, 0);
    expect(hueOf(colors[4])).toBeCloseTo(RED, 0);
  });

  it('falls back to the residue scheme for an unknown scheme name', () => {
    expect(computeAtomColors(atoms, 'nonsense')).toEqual(computeAtomColors(atoms, 'residue'));
  });

  it('returns nothing for an empty structure', () => {
    expect(computeAtomColors([], 'bfactor')).toEqual([]);
  });
});
