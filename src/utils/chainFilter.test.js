/**
 * Tests for chain filtering, which backs the show/hide chain controls.
 */

import { getAtomsByChains, getChains } from './pdbParser';

const atoms = [
  { chain: 'A', name: 'CA', serial: 1 },
  { chain: 'B', name: 'CA', serial: 2 },
  { chain: 'A', name: 'CA', serial: 3 },
  { chain: 'C', name: 'CA', serial: 4 },
];

describe('getAtomsByChains', () => {
  it('keeps only atoms from the requested chains', () => {
    const result = getAtomsByChains(atoms, new Set(['A']));

    expect(result.map(a => a.serial)).toEqual([1, 3]);
  });

  it('keeps atoms from several chains at once', () => {
    const result = getAtomsByChains(atoms, new Set(['A', 'C']));

    expect(result.map(a => a.serial)).toEqual([1, 3, 4]);
  });

  it('accepts a plain array as well as a Set', () => {
    expect(getAtomsByChains(atoms, ['B']).map(a => a.serial)).toEqual([2]);
  });

  it('returns nothing when no chains are selected', () => {
    expect(getAtomsByChains(atoms, new Set())).toEqual([]);
  });

  it('ignores chain IDs that are not present', () => {
    expect(getAtomsByChains(atoms, new Set(['Z']))).toEqual([]);
  });

  it('preserves the original atom order', () => {
    const result = getAtomsByChains(atoms, new Set(['C', 'A']));

    expect(result.map(a => a.serial)).toEqual([1, 3, 4]);
  });

  it('selects every chain reported by getChains', () => {
    const result = getAtomsByChains(atoms, new Set(getChains(atoms)));

    expect(result).toHaveLength(atoms.length);
  });
});
