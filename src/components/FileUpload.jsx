/**
 * Structure file picker. Reads the selected file as bytes, then hands it to
 * loadStructure(), which decompresses it, works out the format and parses it.
 *
 * Deciding what a file is means looking at its bytes - gzip magic first, then
 * MessagePack against text - so that lives in the loader rather than here. This
 * component picks the file and reports failures.
 *
 * Reading is async because gzip decompression is: DecompressionStream is
 * promise-based, so the whole path is a promise and the button shows a loading state.
 */

import React, { useState } from 'react';
import { loadStructure } from '../utils/structureLoader';

// Extensions RCSB hands out. Detection is by content, so this only filters the file
// picker - a renamed file still loads correctly.
const ACCEPTED_EXTENSIONS = '.pdb,.pdb1,.pdb2,.pdb3,.pdb4,.ent,.cif,.bcif,.gz';

function FileUpload({ onFileLoaded }) {

  const [loading, setLoading] = useState(false);

  // Message from the last failed load, or null when the last one worked.
  const [error, setError] = useState(null);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log('Selected file:', file.name, 'Size:', file.size, 'bytes');

    setLoading(true);
    setError(null);

    try {
      const structure = await loadStructure(file);
      console.log(`Parsed ${structure.atoms.length} atoms from ${structure.formatLabel}`);
      onFileLoaded(structure);
    } catch (err) {
      // Anything the pipeline throws - bad gzip, unknown encoding, no coordinates -
      // lands here and is shown to the user rather than only the console.
      console.error('Error loading structure:', err);
      setError(err.message || 'Could not read this file.');
    } finally {
      setLoading(false);
      // Picking the same file twice fires no change event, so without clearing the
      // selection a user who hits an error cannot retry that file - or reload one
      // they just fixed on disk - without choosing another first.
      event.target.value = '';
    }
  };

  const containerStyle = {
    padding: '20px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    border: `2px dashed ${error ? '#e74c3c' : '#ccc'}`,
    textAlign: 'center',
    marginBottom: '20px',
    transition: 'border-color 0.3s ease',
  };

  const inputStyle = {
    display: 'block',
    margin: '0 auto',
    padding: '10px',
    cursor: 'pointer',
  };

  const helpTextStyle = {
    marginTop: '10px',
    fontSize: '14px',
    color: '#666',
  };

  const errorStyle = {
    marginTop: '10px',
    fontSize: '14px',
    color: '#c0392b',
  };

  const linkStyle = {
    color: '#0066cc',
    textDecoration: 'none',
  };

  return (
    <div style={containerStyle}>
      {/* Disabled while loading so a second file cannot race the first. */}
      <input
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileChange}
        disabled={loading}
        style={inputStyle}
      />

      <p style={helpTextStyle}>
        {loading
          ? 'Reading structure...'
          : 'Upload a PDB, mmCIF or BinaryCIF file - compressed (.gz) works too'}
      </p>

      {error && <p style={errorStyle}>{error}</p>}

      <p style={{ ...helpTextStyle, fontSize: '12px' }}>
        Don't have a file? Try downloading one from{' '}
        <a
          href="https://www.rcsb.org/structure/1CRN"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          RCSB PDB (1CRN - Crambin)
        </a>
        {' '}- any of the PDB, mmCIF, BinaryCIF or Biological Assembly downloads will load.
      </p>
    </div>
  );
}

export default FileUpload;
