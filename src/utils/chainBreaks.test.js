/**
 * Tests for backbone segmentation.
 *
 * Consecutive alpha carbons sit ~3.8 A apart. Fixtures place atoms along the x
 * axis at that spacing so a "gap" can be created by simply skipping ahead.
 */

import { splitIntoSegments, MAX_CA_GAP, createBackboneLine } from './proteinGeometry';

const CA_SPACING = 3.8;

/**
 * Builds a run of CA atoms spaced like a real polypeptide.
 */
function chainOfResidues(chain, count, startX = 0) {
  return Array.from({ length: count }, (_, i) => ({
    chain,
    name: 'CA',
    residueNum: i + 1,
    x: startX + i * CA_SPACING,
    y: 0,
    z: 0,
  }));
}

describe('splitIntoSegments', () => {
  it('keeps a continuous chain as a single segment', () => {
    const segments = splitIntoSegments(chainOfResidues('A', 5));

    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(5);
  });

  it('breaks between different chains even when they are close in space', () => {
    // Adjacent in the file and only 3.8 A apart, but separate molecules
    const atoms = [...chainOfResidues('A', 3), ...chainOfResidues('B', 3, 3 * CA_SPACING)];

    const segments = splitIntoSegments(atoms);

    expect(segments).toHaveLength(2);
    expect(segments[0].every(a => a.chain === 'A')).toBe(true);
    expect(segments[1].every(a => a.chain === 'B')).toBe(true);
  });

  it('breaks where residues are missing from the model', () => {
    const atoms = [
      ...chainOfResidues('A', 3),
      // Jump well beyond bonding distance, as an unresolved loop would
      ...chainOfResidues('A', 3, 40),
    ];

    const segments = splitIntoSegments(atoms);

    expect(segments).toHaveLength(2);
    expect(segments.map(s => s.length)).toEqual([3, 3]);
  });

  it('does not break at normal peptide spacing', () => {
    expect(splitIntoSegments(chainOfResidues('A', 20))).toHaveLength(1);
  });

  it('does not break at cis-peptide spacing', () => {
    // Cis peptide bonds, usually before proline, shorten CA-CA to about 2.9 A
    const atoms = [
      { chain: 'A', x: 0, y: 0, z: 0 },
      { chain: 'A', x: 2.9, y: 0, z: 0 },
      { chain: 'A', x: 6.7, y: 0, z: 0 },
    ];

    expect(splitIntoSegments(atoms)).toHaveLength(1);
  });

  it('breaks just above the cutoff and not just below it', () => {
    const justUnder = [
      { chain: 'A', x: 0, y: 0, z: 0 },
      { chain: 'A', x: MAX_CA_GAP - 0.01, y: 0, z: 0 },
    ];
    const justOver = [
      { chain: 'A', x: 0, y: 0, z: 0 },
      { chain: 'A', x: MAX_CA_GAP + 0.01, y: 0, z: 0 },
    ];

    expect(splitIntoSegments(justUnder)).toHaveLength(1);
    expect(splitIntoSegments(justOver)).toHaveLength(2);
  });

  it('measures distance in three dimensions, not just along one axis', () => {
    // 3-4-5 style triangle: each axis alone is under the cutoff, the real
    // distance is 5.0 A, which is over it
    const atoms = [
      { chain: 'A', x: 0, y: 0, z: 0 },
      { chain: 'A', x: 3, y: 4, z: 0 },
    ];

    expect(splitIntoSegments(atoms)).toHaveLength(2);
  });

  it('does not break at a numbering gap when the residues are bonded', () => {
    // Legacy numbering schemes skip numbers by design - trypsin is numbered
    // against chymotrypsinogen - so a jump in residue number is not evidence of
    // a missing residue. Breaking on it fragments 3PTB's one continuous chain
    // into seven pieces
    const atoms = [
      { chain: 'A', residueNum: 10, x: 0, y: 0, z: 0 },
      { chain: 'A', residueNum: 15, x: 3.8, y: 0, z: 0 },
    ];

    expect(splitIntoSegments(atoms)).toHaveLength(1);
  });

  it('handles a single isolated residue', () => {
    const segments = splitIntoSegments(chainOfResidues('A', 1));

    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(1);
  });

  it('returns nothing for an empty structure', () => {
    expect(splitIntoSegments([])).toEqual([]);
  });

  it('respects a custom gap threshold', () => {
    const atoms = [
      { chain: 'A', x: 0, y: 0, z: 0 },
      { chain: 'A', x: 10, y: 0, z: 0 },
    ];

    expect(splitIntoSegments(atoms, 20)).toHaveLength(1);
    expect(splitIntoSegments(atoms, 5)).toHaveLength(2);
  });
});

describe('createBackboneLine', () => {
  it('creates one tube mesh per connected segment', () => {
    const atoms = [...chainOfResidues('A', 4), ...chainOfResidues('B', 4, 100)];

    const group = createBackboneLine(atoms);

    expect(group.children).toHaveLength(2);
  });

  it('skips segments too short to draw a tube through', () => {
    // A lone residue between two gaps cannot form a curve
    const atoms = [
      ...chainOfResidues('A', 3),
      { chain: 'A', name: 'CA', x: 60, y: 0, z: 0 },
      ...chainOfResidues('A', 3, 120),
    ];

    const group = createBackboneLine(atoms);

    expect(splitIntoSegments(atoms)).toHaveLength(3);
    expect(group.children).toHaveLength(2);
  });

  it('produces an empty group for an empty structure', () => {
    expect(createBackboneLine([]).children).toHaveLength(0);
  });

  it('produces an empty group when no segment is long enough', () => {
    expect(createBackboneLine([{ chain: 'A', x: 0, y: 0, z: 0 }]).children).toHaveLength(0);
  });
});
