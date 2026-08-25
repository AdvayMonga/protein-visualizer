import {
  isClickNotDrag,
  toNormalizedDeviceCoords,
  firstAtomHit,
  formatAtomLabel,
  DRAG_THRESHOLD_PX,
} from './picking';

describe('isClickNotDrag', () => {
  it('treats a stationary pointer as a click', () => {
    expect(isClickNotDrag({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
  });

  it('tolerates small movement during a click', () => {
    expect(isClickNotDrag({ x: 100, y: 100 }, { x: 102, y: 101 })).toBe(true);
  });

  it('rejects a camera drag', () => {
    expect(isClickNotDrag({ x: 100, y: 100 }, { x: 200, y: 150 })).toBe(false);
  });

  it('measures diagonal movement, not per-axis movement', () => {
    // 4px on each axis is under the threshold individually but 5.66px combined
    expect(isClickNotDrag({ x: 0, y: 0 }, { x: 4, y: 4 })).toBe(false);
  });

  it('accepts movement exactly at the threshold', () => {
    expect(isClickNotDrag({ x: 0, y: 0 }, { x: DRAG_THRESHOLD_PX, y: 0 })).toBe(true);
  });

  it('honours a custom threshold', () => {
    expect(isClickNotDrag({ x: 0, y: 0 }, { x: 50, y: 0 }, 100)).toBe(true);
  });
});

describe('toNormalizedDeviceCoords', () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 };

  it('maps the canvas centre to the origin', () => {
    const ndc = toNormalizedDeviceCoords(400, 300, rect);

    expect(ndc.x).toBeCloseTo(0);
    expect(ndc.y).toBeCloseTo(0);
  });

  it('maps the top-left corner to (-1, 1)', () => {
    const ndc = toNormalizedDeviceCoords(0, 0, rect);

    expect(ndc.x).toBeCloseTo(-1);
    expect(ndc.y).toBeCloseTo(1);
  });

  it('maps the bottom-right corner to (1, -1)', () => {
    const ndc = toNormalizedDeviceCoords(800, 600, rect);

    expect(ndc.x).toBeCloseTo(1);
    expect(ndc.y).toBeCloseTo(-1);
  });

  it('accounts for a canvas that is offset in the page', () => {
    const offset = { left: 100, top: 50, width: 800, height: 600 };

    const ndc = toNormalizedDeviceCoords(500, 350, offset);

    expect(ndc.x).toBeCloseTo(0);
    expect(ndc.y).toBeCloseTo(0);
  });
});

describe('firstAtomHit', () => {
  const atom = { residue: 'THR', residueNum: 17, chain: 'A' };

  it('returns the atom of the nearest hit that has one', () => {
    const hits = [{ object: { userData: { atomInfo: atom } } }];

    expect(firstAtomHit(hits)).toBe(atom);
  });

  it('selects nothing when the nearest hit is not an atom', () => {
    // The backbone tube threads through the sphere centres, so between residues
    // it is the only thing in front. Walking past it would select whatever
    // sphere the ray met next - routinely one on the far side of the structure
    const hits = [
      { object: { userData: {} } },
      { object: { userData: { atomInfo: atom } } },
    ];

    expect(firstAtomHit(hits)).toBeNull();
  });

  it('returns null when nothing was hit', () => {
    expect(firstAtomHit([])).toBeNull();
  });

  it('returns null when no hit carries atom data', () => {
    expect(firstAtomHit([{ object: { userData: {} } }])).toBeNull();
  });

  it('prefers the nearest atom when several are behind each other', () => {
    const near = { residue: 'GLY', residueNum: 1, chain: 'A' };
    const far = { residue: 'ALA', residueNum: 2, chain: 'A' };
    const hits = [
      { object: { userData: { atomInfo: near } } },
      { object: { userData: { atomInfo: far } } },
    ];

    expect(firstAtomHit(hits)).toBe(near);
  });

  // The residue spheres are one instanced mesh, so every hit reports the same object
  // and only instanceId says which residue was clicked.
  it('resolves an instanced hit through instanceId', () => {
    const atoms = [
      { residue: 'GLY', residueNum: 1, chain: 'A' },
      { residue: 'ALA', residueNum: 2, chain: 'A' },
      { residue: 'SER', residueNum: 3, chain: 'A' },
    ];
    const mesh = { userData: { atoms } };

    expect(firstAtomHit([{ object: mesh, instanceId: 2 }])).toBe(atoms[2]);
    expect(firstAtomHit([{ object: mesh, instanceId: 0 }])).toBe(atoms[0]);
  });

  it('selects nothing when an instanced hit is out of range', () => {
    const mesh = { userData: { atoms: [{ residue: 'GLY', residueNum: 1, chain: 'A' }] } };

    expect(firstAtomHit([{ object: mesh, instanceId: 5 }])).toBeNull();
  });

  it('still reads per-mesh atoms, which is how ligand spheres are built', () => {
    const ligandAtom = { residue: 'HEM', residueNum: 147, chain: 'A' };

    expect(firstAtomHit([{ object: { userData: { atomInfo: ligandAtom } } }])).toBe(ligandAtom);
  });
});

describe('formatAtomLabel', () => {
  it('formats residue, number and chain', () => {
    expect(formatAtomLabel({ residue: 'THR', residueNum: 17, chain: 'A' })).toBe('THR 17 A');
  });

  it('includes an insertion code when present', () => {
    expect(
      formatAtomLabel({ residue: 'SER', residueNum: 52, chain: 'H', iCode: 'A' })
    ).toBe('SER 52A H');
  });

  it('returns an empty string when nothing is selected', () => {
    expect(formatAtomLabel(null)).toBe('');
  });
});
