/**
 * PDB file picker. Reads the selected file as text and hands the raw contents to the
 * parent via onFileLoaded; parsing happens there.
 */

import React from 'react';

function FileUpload({ onFileLoaded }) {

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log('Selected file:', file.name, 'Size:', file.size, 'bytes');

    // FileReader is async, so the handlers have to be attached before readAsText().
    const reader = new FileReader();

    reader.onload = (e) => {
      const pdbText = e.target.result;
      console.log('File loaded, first 200 chars:', pdbText.substring(0, 200));
      onFileLoaded(pdbText);
    };

    reader.onerror = (e) => {
      console.error('Error reading file:', e);
      alert('Error reading file. Please try again.');
    };

    reader.readAsText(file);
  };

  const containerStyle = {
    padding: '20px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    border: '2px dashed #ccc',
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

  const linkStyle = {
    color: '#0066cc',
    textDecoration: 'none',
  };

  return (
    <div style={containerStyle}>
      <input 
        type="file" 
        accept=".pdb"
        onChange={handleFileChange}
        style={inputStyle}
      />

      <p style={helpTextStyle}>
        Upload a PDB file to visualize the protein structure
      </p>

      <p style={{ ...helpTextStyle, fontSize: '12px' }}>
        Don't have a PDB file? Try downloading one from{' '}
        <a 
          href="https://www.rcsb.org/structure/1CRN" 
          target="_blank" 
          rel="noopener noreferrer"
          style={linkStyle}
        >
          RCSB PDB (1CRN - Crambin)
        </a>
      </p>
    </div>
  );
}

export default FileUpload;
