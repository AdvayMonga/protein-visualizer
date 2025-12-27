/**
 * Controls Component
 * ==================
 * 
 * A UI panel that provides controls for the protein visualization.
 * This component allows users to customize how the protein is displayed.
 * 
 * Features:
 * - Display statistics about the loaded protein
 * - Toggle visibility of backbone line and atom spheres
 * - (Future) Color scheme selection
 * - (Future) Representation style selection
 * 
 * This component demonstrates React state management for UI controls
 * and how to pass user preferences to visualization components.
 */

import React from 'react';

/**
 * Controls - A panel for visualization settings
 * 
 * @param {Object} props - Component props
 * @param {Object} props.proteinInfo - Information about the loaded protein
 * @param {boolean} props.showBackbone - Whether to show backbone line
 * @param {Function} props.onShowBackboneChange - Callback when backbone toggle changes
 * @param {boolean} props.showAtoms - Whether to show atom spheres
 * @param {Function} props.onShowAtomsChange - Callback when atoms toggle changes
 * @param {string} props.colorScheme - Current color scheme ('residue' or 'chain')
 * @param {Function} props.onColorSchemeChange - Callback when color scheme changes
 */
function Controls({ 
  proteinInfo, 
  showBackbone = true, 
  onShowBackboneChange,
  showAtoms = true,
  onShowAtomsChange,
  colorScheme = 'residue',
  onColorSchemeChange
}) {
  // Styles for the control panel
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
      
      {/* Display protein statistics if available */}
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
      
      {/* Display controls section */}
      <h3 style={headerStyle}>Display Options</h3>
      
      {/* Backbone toggle */}
      <label style={checkboxContainerStyle}>
        <input 
          type="checkbox"
          checked={showBackbone}
          onChange={(e) => onShowBackboneChange && onShowBackboneChange(e.target.checked)}
        />
        <span style={checkboxLabelStyle}>Show Backbone Line</span>
      </label>
      
      {/* Atoms toggle */}
      <label style={checkboxContainerStyle}>
        <input 
          type="checkbox"
          checked={showAtoms}
          onChange={(e) => onShowAtomsChange && onShowAtomsChange(e.target.checked)}
        />
        <span style={checkboxLabelStyle}>Show Atom Spheres</span>
      </label>

      {/* Color scheme selector */}
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

      {/* Instructions */}
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
