/** Sidebar panel showing protein statistics and the display toggles. */

import React from 'react';

function Controls({ 
  proteinInfo, 
  showBackbone = true, 
  onShowBackboneChange,
  showAtoms = true,
  onShowAtomsChange,
  colorScheme = 'residue',
  onColorSchemeChange
}) {
  const panelStyle = {
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #dee2e6',
  };
  
  const headerStyle = {
    margin: '0 0 15px 0',
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333',
    borderBottom: '1px solid #dee2e6',
    paddingBottom: '10px',
  };
  
  const statStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '14px',
  };
  
  const labelStyle = {
    color: '#666',
  };
  
  const valueStyle = {
    fontWeight: 'bold',
    color: '#333',
  };
  
  const checkboxContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '10px',
    cursor: 'pointer',
  };
  
  const checkboxLabelStyle = {
    marginLeft: '8px',
    fontSize: '14px',
    color: '#333',
    cursor: 'pointer',
  };

  const selectStyle = {
    width: '100%',
    padding: '8px',
    fontSize: '14px',
    borderRadius: '4px',
    border: '1px solid #dee2e6',
    backgroundColor: 'white',
    cursor: 'pointer',
  };

  const selectLabelStyle = {
    fontSize: '14px',
    color: '#333',
    marginBottom: '5px',
    display: 'block',
  };
  
  return (
    <div style={panelStyle}>
      <h3 style={headerStyle}>Protein Information</h3>
      
      {proteinInfo && (
        <div style={{ marginBottom: '15px' }}>
          <div style={statStyle}>
            <span style={labelStyle}>Residues:</span>
            <span style={valueStyle}>{proteinInfo.residueCount}</span>
          </div>
          <div style={statStyle}>
            <span style={labelStyle}>Total Atoms:</span>
            <span style={valueStyle}>{proteinInfo.totalAtoms}</span>
          </div>
          <div style={statStyle}>
            <span style={labelStyle}>Chains:</span>
            <span style={valueStyle}>{proteinInfo.chains.join(', ')}</span>
          </div>
        </div>
      )}
      
      <h3 style={headerStyle}>Display Options</h3>
      
      <label style={checkboxContainerStyle}>
        <input 
          type="checkbox"
          checked={showBackbone}
          onChange={(e) => onShowBackboneChange && onShowBackboneChange(e.target.checked)}
        />
        <span style={checkboxLabelStyle}>Show Backbone Line</span>
      </label>
      
      <label style={checkboxContainerStyle}>
        <input 
          type="checkbox"
          checked={showAtoms}
          onChange={(e) => onShowAtomsChange && onShowAtomsChange(e.target.checked)}
        />
        <span style={checkboxLabelStyle}>Show Atom Spheres</span>
      </label>

      <div style={{ marginTop: '15px' }}>
        <label style={selectLabelStyle}>Color Scheme:</label>
        <select 
          style={selectStyle}
          value={colorScheme}
          onChange={(e) => onColorSchemeChange && onColorSchemeChange(e.target.value)}
        >
          <option value="residue">By Residue Type</option>
          <option value="chain">By Chain</option>
        </select>
        <p style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>
          {colorScheme === 'residue' 
            ? '🟠 Hydrophobic  🟢 Polar  🔵 Positive  🔴 Negative'
            : 'Each chain gets a unique color'}
        </p>
      </div>

      <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
        <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
          <strong>Controls:</strong><br />
          • Left-click + drag: Rotate<br />
          • Right-click + drag: Pan<br />
          • Scroll: Zoom
        </p>
      </div>
    </div>
  );
}

export default Controls;
