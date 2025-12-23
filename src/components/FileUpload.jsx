/**
 * FileUpload Component
 * ====================
 * 
 * A React component that handles PDB file uploads from the user.
 * 
 * How it works:
 * 1. User clicks the file input and selects a .pdb file
 * 2. The browser's FileReader API reads the file as text
 * 3. The raw text content is passed to the parent component via callback
 * 4. Parent component handles parsing and visualization
 * 
 * Key Concepts:
 * 
 * FileReader API:
 * - Browser API for reading files selected by the user
 * - readAsText(): Reads file content as a string (what we need for PDB)
 * - readAsArrayBuffer(): For binary files
 * - readAsDataURL(): For embedding files as data URIs
 * 
 * Event Flow:
 * 1. onChange fires when user selects a file
 * 2. FileReader.onload fires when file is fully read
 * 3. We extract the text and call the parent's callback
 * 
 * Component Props:
 * - onFileLoaded: Function called with the PDB file text content
 *   This is a "callback prop" pattern - the parent passes a function
 *   that we call when we have data to share
 */

import React from 'react';

/**
 * FileUpload - A drag-and-drop styled file upload component
 * 
 * @param {Object} props - Component props
 * @param {Function} props.onFileLoaded - Callback function that receives the file content
 * 
 * @example
 * <FileUpload onFileLoaded={(text) => console.log('Got file:', text)} />
 */
function FileUpload({ onFileLoaded }) {
  
  /**
   * Handles the file input change event.
   * Called whenever the user selects a new file.
   * 
   * @param {Event} event - The input change event
   */
  const handleFileChange = (event) => {
    // Get the first selected file (file inputs can allow multiple files)
    // event.target.files is a FileList object
    const file = event.target.files[0];
    
    // If no file was selected (user cancelled), do nothing
    if (!file) return;
    
    // Log file info for debugging
    console.log('Selected file:', file.name, 'Size:', file.size, 'bytes');
    
    // Create a FileReader to read the file contents
    // FileReader is a browser API, not a React or Node.js feature
    const reader = new FileReader();
    
    // Set up the onload callback BEFORE calling read()
    // This is an async operation - the callback fires when reading is complete
    reader.onload = (e) => {
      // e.target.result contains the file content as a string
      // (because we used readAsText below)
      const pdbText = e.target.result;
      
      // Log the first 200 characters for debugging
      console.log('File loaded, first 200 chars:', pdbText.substring(0, 200));
      
      // Send the raw text to the parent component
      // The parent will handle parsing and visualization
      onFileLoaded(pdbText);
    };
    
    // Handle errors during file reading
    reader.onerror = (e) => {
      console.error('Error reading file:', e);
      alert('Error reading file. Please try again.');
    };
    
    // Start reading the file as text
    // This triggers the async read operation
    // When complete, the onload callback above will fire
    reader.readAsText(file);
  };
  
  // Styles defined as JavaScript objects (inline styles)
  // This is one way to style React components
  // Alternatives: CSS files, CSS modules, styled-components, etc.
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
      {/* 
        File input element
        - type="file": Creates a file picker
        - accept=".pdb": Filters file picker to show only .pdb files
        - onChange: Called when user selects a file
      */}
      <input 
        type="file" 
        accept=".pdb"
        onChange={handleFileChange}
        style={inputStyle}
      />
      
      {/* Help text for users */}
      <p style={helpTextStyle}>
        Upload a PDB file to visualize the protein structure
      </p>
      
      {/* Link to download sample PDB files */}
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

// Export the component as the default export
// This allows importing with: import FileUpload from './FileUpload'
export default FileUpload;
