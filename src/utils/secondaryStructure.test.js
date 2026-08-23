import { createBackboneLine } from './proteinGeometry';
import {
  parseSecondaryStructure,
  assignSecondaryStructure,
  groupBySecondaryStructure,
  HELIX,
  SHEET,
  COIL,
} from './secondaryStructure';

// Real records from 1CRN and 3PTB. HELIX and SHEET place their chain and
// sequence fields at different columns, so both are covered verbatim.
const HELIX_RECORD =
  'HELIX    1  H1 ILE A    7  PRO A   19  13/10 CONFORMATION RES 17,19       13';
const SHEET_RECORD =
  'SHEET    1  S1 2 THR A   1  CYS A   4  0';

describe('parseSecondaryStructure', () => {
  it('reads a helix range', () => {
    const [range] = parseSecondaryStructure(HELIX_RECORD);

    expect(range).toEqual({ type: HELIX, chain: 'A', start: 7, end: 19 });
  });

  it('reads a sheet range from its own column layout', () => {
    // SHEET's fields sit one column right of HELIX's; reading both with one
    // set of offsets yields ranges off by a residue rather than an error
    const [range] = parseSecondaryStructure(SHEET_RECORD);

    expect(range).toEqual({ type: SHEET, chain: 'A', start: 1, end: 4 });
  });

  it('reads both record types from one file', () => {
    const ranges = parseSecondaryStructure([HELIX_RECORD, SHEET_RECORD].join('\n'));

    expect(ranges.map(r => r.type)).toEqual([HELIX, SHEET]);
  });

  it('returns nothing for a file with no such records', () => {
    expect(parseSecondaryStructure('HEADER    PLANT PROTEIN')).toEqual([]);
  });

  it('discards records with unparseable bounds', () => {
    expect(parseSecondaryStructure('HELIX    1  H1 ILE A       PRO A       1')).toEqual([]);
  });
});

describe('assignSecondaryStructure', () => {
  const ranges = [
    { type: HELIX, chain: 'A', start: 7, end: 19 },
    { type: SHEET, chain: 'A', start: 1, end: 4 },
    { type: HELIX, chain: 'B', start: 1, end: 5 },
  ];

  function residue(chain, residueNum) {
    return { chain, residueNum, name: 'CA' };
  }

  it('labels residues inside a helix', () => {
    const [atom] = assignSecondaryStructure([residue('A', 10)], ranges);

    expect(atom.secondaryStructure).toBe(HELIX);
  });

  it('labels residues inside a sheet', () => {
    const [atom] = assignSecondaryStructure([residue('A', 2)], ranges);

    expect(atom.secondaryStructure).toBe(SHEET);
  });

  it('treats range bounds as inclusive', () => {
    const atoms = assignSecondaryStructure(
      [residue('A', 7), residue('A', 19)],
      ranges
    );

    expect(atoms.map(a => a.secondaryStructure)).toEqual([HELIX, HELIX]);
  });

  it('labels everything else as coil', () => {
    const [atom] = assignSecondaryStructure([residue('A', 20)], ranges);

    expect(atom.secondaryStructure).toBe(COIL);
  });

  it('does not apply one chain\'s ranges to another', () => {
    // Residue 10 is helical in chain A but not covered in chain B
    const [atom] = assignSecondaryStructure([residue('B', 10)], ranges);

    expect(atom.secondaryStructure).toBe(COIL);
  });

  it('labels every residue as coil when the file declared nothing', () => {
    const atoms = assignSecondaryStructure([residue('A', 1), residue('A', 2)], []);

    expect(atoms.every(a => a.secondaryStructure === COIL)).toBe(true);
  });

  it('leaves the original atoms untouched', () => {
    const original = residue('A', 10);

    assignSecondaryStructure([original], ranges);

    expect(original.secondaryStructure).toBeUndefined();
  });
});

describe('groupBySecondaryStructure', () => {
  function run(type, count) {
    return Array.from({ length: count }, () => ({ secondaryStructure: type }));
  }

  it('collects consecutive residues of one type into a run', () => {
    const runs = groupBySecondaryStructure(run(HELIX, 5));

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ type: HELIX });
    expect(runs[0].atoms).toHaveLength(5);
  });

  it('starts a new run where the structure changes', () => {
    const atoms = [...run(COIL, 2), ...run(HELIX, 3), ...run(COIL, 1)];

    const runs = groupBySecondaryStructure(atoms);

    expect(runs.map(r => r.type)).toEqual([COIL, HELIX, COIL]);
    expect(runs.map(r => r.atoms.length)).toEqual([2, 3, 1]);
  });

  it('separates two helices divided by a loop', () => {
    const atoms = [...run(HELIX, 3), ...run(COIL, 1), ...run(HELIX, 3)];

    expect(groupBySecondaryStructure(atoms)).toHaveLength(3);
  });

  it('returns nothing for an empty structure', () => {
    expect(groupBySecondaryStructure([])).toEqual([]);
  });
});


describe('cartoon geometry', () => {
  function residue(type, residueNum, x) {
    return { chain: 'A', residueNum, secondaryStructure: type, x, y: 0, z: 0 };
  }

  it('caps the junction where runs of different thickness meet', () => {
    // TubeGeometry has no end caps, so a helix meeting a coil would otherwise
    // end on an open ring that is see-through from most angles
    const atoms = [
      residue(HELIX, 1, 0),
      residue(HELIX, 2, 3.8),
      residue(HELIX, 3, 7.6),
      residue(COIL, 4, 11.4),
      residue(COIL, 5, 15.2),
    ];

    const plain = createBackboneLine(atoms, { showSecondaryStructure: false });
    const cartoon = createBackboneLine(atoms, { showSecondaryStructure: true });

    // Two tubes plus one cap, against a single uniform tube
    expect(plain.children).toHaveLength(1);
    expect(cartoon.children).toHaveLength(3);
  });

  it('adds no cap when the whole segment is one element', () => {
    const atoms = [residue(HELIX, 1, 0), residue(HELIX, 2, 3.8)];

    expect(createBackboneLine(atoms, { showSecondaryStructure: true }).children).toHaveLength(1);
  });
});
