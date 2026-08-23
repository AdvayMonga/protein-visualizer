/**
 * Tests for the PDB parser.
 *
 * PDB is a fixed-width column format, so fixtures are built by a helper that
 * places each field at its exact column rather than by hand-aligned strings -
 * a fixture that is one space off tests nothing useful.
 */

import {
  parsePDB,
  parseHeader,
  getBackboneAtoms,
  getChainDetails,
  getProteinInfo,
} from './pdbParser';

/**
 * Builds a single ATOM/HETATM record at the correct column positions.
 */
function atomLine({
  record = 'ATOM',
  serial = 1,
  name = 'CA',
  altLoc = ' ',
  resName = 'ALA',
  chain = 'A',
  resSeq = 1,
  iCode = ' ',
  x = 0,
  y = 0,
  z = 0,
  occupancy = 1.0,
  bFactor = 0.0,
  element = 'C',
}) {
  return (
    record.padEnd(6) +                        // 1-6
    String(serial).padStart(5) +              // 7-11
    ' ' +                                     // 12
    (' ' + name).padEnd(4) +                  // 13-16
    altLoc +                                  // 17
    resName.padEnd(3) +                       // 18-20
    ' ' +                                     // 21
    chain +                                   // 22
    String(resSeq).padStart(4) +              // 23-26
    iCode +                                   // 27
    '   ' +                                   // 28-30
    x.toFixed(3).padStart(8) +                // 31-38
    y.toFixed(3).padStart(8) +                // 39-46
    z.toFixed(3).padStart(8) +                // 47-54
    occupancy.toFixed(2).padStart(6) +        // 55-60
    bFactor.toFixed(2).padStart(6) +          // 61-66
    ' '.repeat(10) +                          // 67-76
    element.padStart(2)                       // 77-78
  );
}

describe('parsePDB', () => {
  it('reads every coordinate field from its column', () => {
    const [atom] = parsePDB(
      atomLine({
        serial: 42,
        name: 'CA',
        resName: 'THR',
        chain: 'B',
        resSeq: 17,
        x: 17.047,
        y: -14.099,
        z: 3.625,
        occupancy: 0.5,
        bFactor: 13.79,
        element: 'C',
      })
    );

    expect(atom).toMatchObject({
      record: 'ATOM',
      serial: 42,
      name: 'CA',
      residue: 'THR',
      chain: 'B',
      residueNum: 17,
      x: 17.047,
      y: -14.099,
      z: 3.625,
      occupancy: 0.5,
      bFactor: 13.79,
      element: 'C',
    });
  });

  it('distinguishes HETATM from ATOM so ligands can be told apart', () => {
    const atoms = parsePDB(
      [
        atomLine({ serial: 1, name: 'CA', resName: 'GLY' }),
        atomLine({ serial: 2, record: 'HETATM', name: 'FE', resName: 'HEM', element: 'FE' }),
      ].join('\n')
    );

    expect(atoms.map(a => a.record)).toEqual(['ATOM', 'HETATM']);
  });

  it('captures altLoc and insertion code', () => {
    const [atom] = parsePDB(
      atomLine({ altLoc: 'B', iCode: 'A', resSeq: 52 })
    );

    expect(atom.altLoc).toBe('B');
    expect(atom.iCode).toBe('A');
    expect(atom.residueNum).toBe(52);
  });

  it('leaves altLoc and iCode empty when the columns are blank', () => {
    const [atom] = parsePDB(atomLine({}));

    expect(atom.altLoc).toBe('');
    expect(atom.iCode).toBe('');
  });

  it('keeps only the first model of an NMR ensemble', () => {
    const pdb = [
      'MODEL        1',
      atomLine({ serial: 1, x: 1 }),
      'ENDMDL',
      'MODEL        2',
      atomLine({ serial: 2, x: 2 }),
      'ENDMDL',
      'MODEL        3',
      atomLine({ serial: 3, x: 3 }),
      'ENDMDL',
    ].join('\n');

    const atoms = parsePDB(pdb);

    expect(atoms).toHaveLength(1);
    expect(atoms[0].x).toBe(1);
  });

  it('parses files with no MODEL records normally', () => {
    const pdb = [atomLine({ serial: 1 }), atomLine({ serial: 2 })].join('\n');

    expect(parsePDB(pdb)).toHaveLength(2);
  });

  it('reports occupancy and bFactor as null when the line is truncated', () => {
    // Many tool-written files stop after the Z coordinate; NaN would propagate
    // silently into a colour scale
    const [atom] = parsePDB('ATOM      1  CA  GLY A   1      12.000   7.000  -5.000');

    expect(atom.occupancy).toBeNull();
    expect(atom.bFactor).toBeNull();
  });

  it('ignores records that are not coordinates', () => {
    const pdb = ['HEADER    HYDROLASE', 'REMARK   2 RESOLUTION.    1.50 ANGSTROMS.', atomLine({})].join('\n');

    expect(parsePDB(pdb)).toHaveLength(1);
  });
});

describe('getBackboneAtoms', () => {
  it('keeps only alpha carbons', () => {
    const pdb = [
      atomLine({ serial: 1, name: 'N', element: 'N' }),
      atomLine({ serial: 2, name: 'CA' }),
      atomLine({ serial: 3, name: 'C' }),
      atomLine({ serial: 4, name: 'CB' }),
    ].join('\n');

    const backbone = getBackboneAtoms(parsePDB(pdb));

    expect(backbone).toHaveLength(1);
    expect(backbone[0].name).toBe('CA');
  });
});

describe('getBackboneAtoms exclusions', () => {
  it('excludes calcium ions, which share the CA atom name', () => {
    // A calcium ion is HETATM, residue CA, atom CA - otherwise indistinguishable
    // from an alpha carbon by name alone
    const pdb = [
      atomLine({ serial: 1, name: 'CA', resName: 'GLY' }),
      atomLine({ serial: 2, record: 'HETATM', name: 'CA', resName: 'CA', element: 'CA' }),
    ].join('\n');

    const backbone = getBackboneAtoms(parsePDB(pdb));

    expect(backbone).toHaveLength(1);
    expect(backbone[0].residue).toBe('GLY');
  });

  it('keeps modified residues that are recorded as HETATM', () => {
    // Selenomethionine is a HETATM but is genuinely part of the chain; dropping
    // every HETATM would punch a hole in the trace
    const pdb = atomLine({ record: 'HETATM', name: 'CA', resName: 'MSE' });

    expect(getBackboneAtoms(parsePDB(pdb))).toHaveLength(1);
  });

  it('keeps only the first conformation of an alternate-location residue', () => {
    const pdb = [
      atomLine({ serial: 1, name: 'CA', altLoc: 'A', resSeq: 5 }),
      atomLine({ serial: 2, name: 'CA', altLoc: 'B', resSeq: 5 }),
    ].join('\n');

    const backbone = getBackboneAtoms(parsePDB(pdb));

    expect(backbone).toHaveLength(1);
    expect(backbone[0].altLoc).toBe('A');
  });

  it('keeps residues with a blank altLoc', () => {
    expect(getBackboneAtoms(parsePDB(atomLine({ name: 'CA' })))).toHaveLength(1);
  });
});

describe('parseHeader', () => {
  it('reads the HEADER record fields', () => {
    const header = parseHeader(
      'HEADER    PLANT PROTEIN                           30-APR-81   1CRN'
    );

    expect(header.classification).toBe('PLANT PROTEIN');
    expect(header.depositionDate).toBe('30-APR-81');
    expect(header.idCode).toBe('1CRN');
  });

  it('joins multi-line TITLE records in order', () => {
    const header = parseHeader(
      [
        'TITLE     WATER STRUCTURE OF A HYDROPHOBIC PROTEIN AT ATOMIC RESOLUTION.',
        'TITLE    2 PENTAGON RINGS OF WATER MOLECULES IN CRYSTALS OF CRAMBIN',
      ].join('\n')
    );

    expect(header.title).toBe(
      'WATER STRUCTURE OF A HYDROPHOBIC PROTEIN AT ATOMIC RESOLUTION. ' +
        'PENTAGON RINGS OF WATER MOLECULES IN CRYSTALS OF CRAMBIN'
    );
  });

  it('reads the experimental method', () => {
    expect(parseHeader('EXPDTA    SOLUTION NMR').method).toBe('SOLUTION NMR');
  });

  it('reads resolution in Angstroms', () => {
    const header = parseHeader('REMARK   2 RESOLUTION.    2.16 ANGSTROMS.');

    expect(header.resolution).toBe(2.16);
  });

  it('leaves resolution null when not applicable', () => {
    const header = parseHeader('REMARK   2 RESOLUTION. NOT APPLICABLE.');

    expect(header.resolution).toBeNull();
  });

  it('reads R value and free R value', () => {
    const header = parseHeader(
      [
        'REMARK   3   R VALUE            (WORKING SET) : 0.202',
        'REMARK   3   FREE R VALUE                     : 0.235',
      ].join('\n')
    );

    expect(header.rValue).toBe(0.202);
    expect(header.rFree).toBe(0.235);
  });

  it('is not clobbered by per-shell BIN statistics later in REMARK 3', () => {
    // Regression test: these lines appear after the overall values in real
    // files and match a naive unanchored pattern, overwriting good data
    const header = parseHeader(
      [
        'REMARK   3   R VALUE            (WORKING SET) : 0.182',
        'REMARK   3   FREE R VALUE                     : 0.240',
        'REMARK   3   BIN R VALUE           (WORKING SET) : NULL',
        'REMARK   3   BIN FREE R VALUE                    : NULL',
        'REMARK   3   ESTIMATED ERROR OF FREE R VALUE  : NULL',
      ].join('\n')
    );

    expect(header.rValue).toBe(0.182);
    expect(header.rFree).toBe(0.24);
  });

  it('treats a literal NULL refinement value as absent', () => {
    const header = parseHeader('REMARK   3   FREE R VALUE                     : NULL');

    expect(header.rFree).toBeNull();
  });

  it('does not mistake FREE R VALUE TEST SET for the free R value', () => {
    const header = parseHeader(
      'REMARK   3   FREE R VALUE TEST SET SELECTION  : RANDOM'
    );

    expect(header.rFree).toBeNull();
  });

  it('accumulates SEQRES across lines and chains', () => {
    const header = parseHeader(
      [
        'SEQRES   1 A   25  THR THR CYS CYS PRO SER ILE VAL ALA ARG SER ASN PHE',
        'SEQRES   2 A   25  ASN VAL CYS ARG LEU PRO GLY THR PRO GLU ALA ILE',
        'SEQRES   1 B    3  GLY ALA VAL',
      ].join('\n')
    );

    expect(header.seqres.A).toHaveLength(25);
    expect(header.seqres.A[0]).toBe('THR');
    expect(header.seqres.B).toEqual(['GLY', 'ALA', 'VAL']);
  });

  it('counts models without keeping their coordinates', () => {
    const pdb = ['MODEL        1', 'ENDMDL', 'MODEL        2', 'ENDMDL'].join('\n');

    expect(parseHeader(pdb).modelCount).toBe(2);
  });

  it('reports zero models for a file with no MODEL records', () => {
    expect(parseHeader('HEADER    HYDROLASE').modelCount).toBe(0);
  });

  it('joins a word split across two TITLE lines without inserting a space', () => {
    // Continuation text starts at column 11 and its leading space is
    // significant: a split word continues with no space there
    const header = parseHeader(
      [
        'TITLE     CRYSTAL STRUCTURE OF A PROTEIN IN COMP',
        'TITLE    2LEX WITH ATP',
      ].join('\n')
    );

    expect(header.title).toBe('CRYSTAL STRUCTURE OF A PROTEIN IN COMPLEX WITH ATP');
  });

  it('joins multi-line EXPDTA records instead of overwriting', () => {
    const header = parseHeader(
      ['EXPDTA    X-RAY DIFFRACTION; NEUTRON', 'EXPDTA   2 DIFFRACTION'].join('\n')
    );

    expect(header.method).toBe('X-RAY DIFFRACTION; NEUTRON DIFFRACTION');
  });

  it('reads an R value whose working set label is qualified', () => {
    const header = parseHeader(
      'REMARK   3   R VALUE   (WORKING SET, NO CUTOFF) : 0.202'
    );

    expect(header.rValue).toBe(0.202);
  });

  it('returns empty values for a file with no header records', () => {
    const header = parseHeader(atomLine({}));

    expect(header.title).toBe('');
    expect(header.method).toBe('');
    expect(header.resolution).toBeNull();
    expect(header.seqres).toEqual({});
  });
});

describe('getChainDetails', () => {
  const backbone = [
    { chain: 'A', name: 'CA' },
    { chain: 'A', name: 'CA' },
    { chain: 'B', name: 'CA' },
  ];

  it('counts observed residues per chain', () => {
    const details = getChainDetails(backbone, null);

    expect(details).toEqual([
      { chain: 'A', observedResidues: 2, expectedResidues: null, missingResidues: null },
      { chain: 'B', observedResidues: 1, expectedResidues: null, missingResidues: null },
    ]);
  });

  it('reports residues declared in SEQRES but absent from the coordinates', () => {
    const seqres = { A: ['GLY', 'ALA', 'VAL', 'LEU', 'SER'], B: ['GLY'] };

    const details = getChainDetails(backbone, seqres);

    expect(details[0]).toMatchObject({ expectedResidues: 5, missingResidues: 3 });
    expect(details[1]).toMatchObject({ expectedResidues: 1, missingResidues: 0 });
  });

  it('clamps at zero when more residues are observed than SEQRES declares', () => {
    // Happens when a chain contains non-standard residues that carry a CA atom
    // but are recorded as HETATM and omitted from SEQRES
    const details = getChainDetails(backbone, { A: ['GLY'] });

    expect(details[0].missingResidues).toBe(0);
  });

  it('includes a chain declared in SEQRES but entirely unresolved', () => {
    // A chain that failed to resolve at all is the most severe kind of gap, and
    // it appears nowhere in the coordinates to be counted from
    const details = getChainDetails(backbone, { A: ['GLY', 'ALA'], Z: ['GLY', 'ALA', 'VAL'] });

    const missingChain = details.find(d => d.chain === 'Z');
    expect(missingChain).toMatchObject({
      observedResidues: 0,
      expectedResidues: 3,
      missingResidues: 3,
    });
  });

  it('does not report nucleic acid chains as missing', () => {
    // DNA and RNA chains carry no CA atom by nature, so they would otherwise
    // look like fully unresolved protein chains
    const details = getChainDetails(backbone, {
      A: ['GLY', 'ALA'],
      D: ['DA', 'DC', 'DG', 'DT'],
    });

    expect(details.map(d => d.chain)).not.toContain('D');
  });

  it('sorts chains alphabetically', () => {
    const unsorted = [{ chain: 'C' }, { chain: 'A' }, { chain: 'B' }];

    expect(getChainDetails(unsorted, null).map(d => d.chain)).toEqual(['A', 'B', 'C']);
  });
});

describe('getProteinInfo', () => {
  const pdb = [
    atomLine({ serial: 1, name: 'CA', chain: 'A', resSeq: 1 }),
    atomLine({ serial: 2, name: 'N', chain: 'A', resSeq: 1, element: 'N' }),
    atomLine({ serial: 3, name: 'CA', chain: 'B', resSeq: 1 }),
  ].join('\n');

  it('summarises atom, residue and chain counts', () => {
    const info = getProteinInfo(parsePDB(pdb));

    expect(info).toMatchObject({
      totalAtoms: 3,
      residueCount: 2,
      chainCount: 2,
      chains: ['A', 'B'],
    });
  });

  it('works without a header, leaving expected counts unknown', () => {
    const info = getProteinInfo(parsePDB(pdb));

    expect(info.chainDetails[0].expectedResidues).toBeNull();
  });

  it('includes SEQRES comparison when a header is supplied', () => {
    const header = parseHeader('SEQRES   1 A    4  GLY ALA VAL LEU');

    const info = getProteinInfo(parsePDB(pdb), header);

    expect(info.chainDetails[0]).toMatchObject({
      chain: 'A',
      observedResidues: 1,
      expectedResidues: 4,
      missingResidues: 3,
    });
  });
});
