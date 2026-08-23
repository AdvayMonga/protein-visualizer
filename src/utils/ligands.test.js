import {
  isWater,
  getLigandAtoms,
  getLigandSummary,
  resolveElement,
  getElementColor,
  getElementRadius,
} from './ligands';

const atoms = [
  { record: 'ATOM', residue: 'ALA', chain: 'A', residueNum: 1, name: 'CA', element: 'C' },
  { record: 'HETATM', residue: 'HEM', chain: 'A', residueNum: 142, name: 'FE', element: 'FE' },
  { record: 'HETATM', residue: 'HEM', chain: 'A', residueNum: 142, name: 'NA', element: 'N' },
  { record: 'HETATM', residue: 'HEM', chain: 'B', residueNum: 143, name: 'FE', element: 'FE' },
  { record: 'HETATM', residue: 'HOH', chain: 'A', residueNum: 200, name: 'O', element: 'O' },
  { record: 'HETATM', residue: 'HOH', chain: 'A', residueNum: 201, name: 'O', element: 'O' },
];

describe('isWater', () => {
  it('recognises the standard water residue', () => {
    expect(isWater('HOH')).toBe(true);
  });

  it('recognises heavy water from neutron structures', () => {
    expect(isWater('DOD')).toBe(true);
  });

  it('does not treat a ligand as water', () => {
    expect(isWater('HEM')).toBe(false);
  });
});

describe('getLigandAtoms', () => {
  it('excludes polymer atoms', () => {
    expect(getLigandAtoms(atoms).every(a => a.record === 'HETATM')).toBe(true);
  });

  it('excludes water by default', () => {
    const result = getLigandAtoms(atoms);

    expect(result).toHaveLength(3);
    expect(result.some(a => a.residue === 'HOH')).toBe(false);
  });

  it('includes water when asked', () => {
    expect(getLigandAtoms(atoms, { includeWater: true })).toHaveLength(5);
  });

  it('returns nothing for a structure with no heteroatoms', () => {
    expect(getLigandAtoms([atoms[0]])).toEqual([]);
  });
});

describe('getLigandSummary', () => {
  it('groups atoms into distinct ligand entities', () => {
    const summary = getLigandSummary(atoms);

    expect(summary).toHaveLength(2);
  });

  it('separates copies of the same ligand at different sites', () => {
    // Two haems differing only by chain and number are separate molecules
    const summary = getLigandSummary(atoms);

    expect(summary.map(l => `${l.residue}${l.chain}${l.residueNum}`)).toEqual([
      'HEMA142',
      'HEMB143',
    ]);
  });

  it('does not double-count a ligand modelled in two conformations', () => {
    // Alternate conformers emit every atom twice, reporting a 43-atom haem as 86
    const withAltLocs = [
      { record: 'HETATM', residue: 'HEM', chain: 'A', residueNum: 1, name: 'FE', altLoc: 'A' },
      { record: 'HETATM', residue: 'HEM', chain: 'A', residueNum: 1, name: 'FE', altLoc: 'B' },
    ];

    expect(getLigandSummary(withAltLocs)[0].atomCount).toBe(1);
  });

  it('counts the atoms in each ligand', () => {
    const summary = getLigandSummary(atoms);

    expect(summary[0].atomCount).toBe(2);
    expect(summary[1].atomCount).toBe(1);
  });

  it('omits water by default', () => {
    expect(getLigandSummary(atoms).some(l => l.residue === 'HOH')).toBe(false);
  });

  it('returns an empty list for a structure with no ligands', () => {
    expect(getLigandSummary([atoms[0]])).toEqual([]);
  });
});

describe('resolveElement', () => {
  it('uses the element column when present', () => {
    expect(resolveElement({ element: 'Fe', name: 'FE' })).toBe('FE');
  });

  it('falls back to the atom name for older files with no element column', () => {
    // The column was added to the format later, so early entries omit it
    expect(resolveElement({ element: '', name: 'CA', residue: 'CA' })).toBe('CA');
  });

  it('reads a monatomic ion from its residue name', () => {
    expect(resolveElement({ element: '', name: 'ZN', residue: 'ZN' })).toBe('ZN');
  });

  it('does not mistake a haem pyrrole nitrogen for sodium', () => {
    // NA, NB, NC and ND are the four ring nitrogens; reading two letters would
    // draw a purple sodium sphere in the middle of the ring
    for (const name of ['NA', 'NB', 'NC', 'ND']) {
      expect(resolveElement({ element: '', name, residue: 'HEM' })).toBe('N');
    }
  });

  it('does not mistake an alpha carbon for calcium', () => {
    expect(resolveElement({ element: '', name: 'CA', residue: 'GLY' })).toBe('C');
  });

  it('ignores leading digits in atom names', () => {
    expect(resolveElement({ element: '', name: '1HB', residue: 'ALA' })).toBe('H');
  });

  it('returns an empty string when there is nothing to work with', () => {
    expect(resolveElement({ element: '', name: '' })).toBe('');
  });
});

describe('getElementColor', () => {
  it('uses CPK red for oxygen', () => {
    expect(getElementColor('O')).toBe(0xff0d0d);
  });

  it('uses CPK blue for nitrogen', () => {
    expect(getElementColor('N')).toBe(0x3050f8);
  });

  it('is case insensitive', () => {
    expect(getElementColor('fe')).toBe(getElementColor('FE'));
  });

  it('falls back to a visible colour for an unknown element', () => {
    expect(getElementColor('XX')).toBe(0xff1493);
  });

  it('handles a missing element without throwing', () => {
    expect(() => getElementColor('')).not.toThrow();
  });
});

describe('getElementRadius', () => {
  it('scales carbon smaller than sulphur', () => {
    expect(getElementRadius('C')).toBeLessThan(getElementRadius('S'));
  });

  it('draws metals at the default larger radius', () => {
    expect(getElementRadius('FE')).toBe(0.5);
  });

  it('handles a missing element without throwing', () => {
    expect(() => getElementRadius('')).not.toThrow();
  });
});
