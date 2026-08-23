/**
 * mmCIF Parser Module
 * ===================
 *
 * Parses PDBx/mmCIF files - the format that replaced legacy PDB as the RCSB standard.
 *
 * Why mmCIF exists:
 * The legacy PDB format is fixed-width, which caps it at 99,999 atoms and 62 chains.
 * Large structures (ribosomes, virus capsids) simply have no PDB file - mmCIF only.
 *
 * Format overview:
 * mmCIF is a tagged key/value format. Atom coordinates live in a `loop_` construct,
 * which is a table: the tag names come first, then the rows of values run together
 * with no row delimiter. Reading it means counting values in chunks of N tags.
 *
 *   loop_
 *   _atom_site.group_PDB
 *   _atom_site.id
 *   _atom_site.type_symbol
 *   _atom_site.label_atom_id
 *   ...
 *   ATOM 1 N N   . MET A 1 1 ? 20.154 6.718 22.520 1.00 49.05 ? 1 MET A N 1
 *   ATOM 2 C CA  . MET A 1 1 ? 21.260 6.766 21.552 1.00 41.14 ? 1 MET A CA 1
 *
 * label_ vs auth_ tags:
 * Every identifier appears twice. `label_*` is the canonical mmCIF numbering;
 * `auth_*` is the numbering the depositor used, which is what the legacy PDB file
 * and all the literature reference. We prefer auth_ for chain and residue number so
 * chain "A" here means the same thing as chain "A" in the PDB file.
 *
 * Output matches parsePDB() exactly, so downstream geometry code is format-agnostic.
 */

// Tokens in a value position that mean "no value" - CIF's null and unknown markers
const NULL_TOKENS = new Set(['.', '?']);

const ATOM_SITE_PREFIX = '_atom_site.';

/**
 * Splits CIF text into tokens, tracking whether each was quoted.
 *
 * Quoting matters: a bare `_foo` is a tag name, but `'_foo'` is a string value.
 * Without that distinction a value of "?" would end a data loop early.
 *
 * @param {string} text - Raw CIF file text
 * @returns {Array<{value: string, quoted: boolean}>}
 */
function tokenize(text) {
  const tokens = [];
  const len = text.length;
  let i = 0;
  // Semicolon text fields are only special when the ';' is the first char of a line
  let atLineStart = true;

  while (i < len) {
    const char = text[i];

    if (char === '\n') {
      i++;
      atLineStart = true;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\r') {
      i++;
      continue;
    }

    // Comments run to end of line
    if (char === '#') {
      while (i < len && text[i] !== '\n') i++;
      continue;
    }

    // Multi-line text field: ";" at line start, closed by "\n;"
    // Used for long values like structure titles that contain spaces and quotes
    if (char === ';' && atLineStart) {
      i++;
      const start = i;
      let end = text.indexOf('\n;', i);
      if (end === -1) end = len;
      tokens.push({ value: text.slice(start, end), quoted: true });
      i = end + 2;
      atLineStart = false;
      continue;
    }

    atLineStart = false;

    // Quoted value. The closing quote must be followed by whitespace, which is how
    // CIF allows apostrophes inside values (e.g. 5'-end) without escaping them.
    if (char === "'" || char === '"') {
      i++;
      const start = i;
      while (i < len) {
        if (text[i] === char && (i + 1 >= len || /\s/.test(text[i + 1]))) break;
        i++;
      }
      tokens.push({ value: text.slice(start, i), quoted: true });
      i++;
      continue;
    }

    // Bare token: runs until whitespace
    const start = i;
    while (i < len && !/\s/.test(text[i])) i++;
    tokens.push({ value: text.slice(start, i), quoted: false });
  }

  return tokens;
}

/**
 * True if a token would start a new construct rather than continue a loop's rows.
 * This is how we know where a loop's value block ends - CIF has no explicit terminator.
 */
function startsNewConstruct(token) {
  if (token.quoted) return false;
  const lower = token.value.toLowerCase();
  return token.value.startsWith('_') ||
         lower === 'loop_' ||
         lower.startsWith('data_') ||
         lower.startsWith('save_');
}

/**
 * Parses mmCIF text and extracts all atom information.
 *
 * @param {string} cifText - The raw text content of an mmCIF file
 * @returns {Array<Object>} - Atom objects in the same shape parsePDB() returns
 */
export function parseCIF(cifText) {
  const tokens = tokenize(cifText);

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].quoted || tokens[i].value.toLowerCase() !== 'loop_') continue;

    // Collect the tag names that head this loop
    const tags = [];
    let j = i + 1;
    while (j < tokens.length && !tokens[j].quoted && tokens[j].value.startsWith('_')) {
      tags.push(tokens[j].value);
      j++;
    }

    // Only the _atom_site loop holds coordinates - skip past any other loop
    if (!tags.length || !tags[0].startsWith(ATOM_SITE_PREFIX)) {
      i = j - 1;
      continue;
    }

    // Map short tag name -> column index, so we can look fields up by name.
    // Column order is not fixed by the spec, so we cannot hardcode positions.
    const columnOf = {};
    tags.forEach((tag, index) => {
      columnOf[tag.slice(ATOM_SITE_PREFIX.length)] = index;
    });

    // Read the flat run of values until the next construct begins
    const values = [];
    while (j < tokens.length && !startsNewConstruct(tokens[j])) {
      values.push(tokens[j].value);
      j++;
    }

    return buildAtoms(values, tags.length, columnOf);
  }

  // No _atom_site loop found - not a coordinate file
  return [];
}

/**
 * Turns the flat value run of an _atom_site loop into atom objects.
 *
 * @param {Array<string>} values - All loop values in row-major order
 * @param {number} width - Number of columns per row
 * @param {Object} columnOf - Map of tag name to column index
 * @returns {Array<Object>}
 */
function buildAtoms(values, width, columnOf) {
  const atoms = [];
  const rowCount = Math.floor(values.length / width);

  // Reads the first tag that is present and not a CIF null marker
  const field = (rowStart, ...names) => {
    for (const name of names) {
      const column = columnOf[name];
      if (column === undefined) continue;
      const value = values[rowStart + column];
      if (value !== undefined && !NULL_TOKENS.has(value)) return value;
    }
    return '';
  };

  for (let row = 0; row < rowCount; row++) {
    const start = row * width;

    atoms.push({
      // group_PDB carries the same ATOM/HETATM distinction as the legacy format.
      // getBackboneAtoms relies on it to tell a calcium ion from an alpha carbon,
      // so an mmCIF file without it would draw ions as residues.
      record: field(start, 'group_PDB') || 'ATOM',
      serial: parseInt(field(start, 'id'), 10),
      name: field(start, 'label_atom_id', 'auth_atom_id'),
      // '.' means no alternate conformation, which field() already maps to ''
      altLoc: field(start, 'label_alt_id', 'auth_alt_id'),
      residue: field(start, 'auth_comp_id', 'label_comp_id'),
      // auth_asym_id matches the chain letter used in the legacy PDB file
      chain: field(start, 'auth_asym_id', 'label_asym_id'),
      residueNum: parseInt(field(start, 'auth_seq_id', 'label_seq_id'), 10),
      iCode: field(start, 'pdbx_PDB_ins_code'),
      x: parseFloat(field(start, 'Cartn_x')),
      y: parseFloat(field(start, 'Cartn_y')),
      z: parseFloat(field(start, 'Cartn_z')),
      occupancy: toNumberOrNull(field(start, 'occupancy')),
      // Feeds the B-factor and pLDDT color schemes; null rather than NaN when the
      // column is absent, matching what parsePDB produces
      bFactor: toNumberOrNull(field(start, 'B_iso_or_equiv')),
      element: field(start, 'type_symbol'),
      // Assembly files repeat chain IDs across models, so downstream code needs
      // this to tell one copy of a subunit from the next
      model: parseInt(field(start, 'pdbx_PDB_model_num'), 10) || 1,
    });
  }

  return atoms;
}

/** Parses a numeric column, yielding null rather than NaN when it is absent. */
function toNumberOrNull(raw) {
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
