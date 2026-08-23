/** Sidebar panel showing protein statistics and the display toggles. */

import React from 'react';
import { getChainColor } from '../utils/proteinGeometry';

/**
 * Converts a Three.js hex color number into a CSS color string.
 */
function toCssColor(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/**
 * @param {boolean} props.showSecondaryStructure - Whether the cartoon is drawn
 * @param {Function} props.onShowSecondaryStructureChange - Callback for that toggle
 * @param {boolean} props.hasSecondaryStructure - Whether the file declared any
 * @param {Set<string>} props.visibleChains - Chains currently drawn
 * @param {Function} props.onVisibleChainsChange - Callback with the new visible set
 */
function Controls({ 
  proteinInfo, 
  showBackbone = true, 
  onShowBackboneChange,
  showAtoms = true,
  onShowAtomsChange,
  colorScheme = 'residue',
  onColorSchemeChange,
  showSecondaryStructure = false,
  onShowSecondaryStructureChange,
  hasSecondaryStructure = false,
  visibleChains = null,
  onVisibleChainsChange
}) {
  // proteinInfo.chains counts every chain in the file, including ones holding only
  // water or ligands.
  const chains = proteinInfo
    ? (proteinInfo.chainDetails || [])
        .filter(chain => chain.observedResidues > 0)
        .map(chain => chain.chain)
    : [];
  
  /** Toggles one chain without disturbing the others. */
  const toggleChain = (chain) => {
    if (!onVisibleChainsChange || !visibleChains) return;
    const next = new Set(visibleChains);
    if (next.has(chain)) {
      next.delete(chain);
    } else {
      next.add(chain);
    }
    onVisibleChainsChange(next);
  };
  
  /** Isolating one chain is the common case when reading a large complex. */
  const isolateChain = (chain) => {
    if (!onVisibleChainsChange) return;
    onVisibleChainsChange(new Set([chain]));
  };
  
  const showAllChains = () => {
    if (!onVisibleChainsChange) return;
    onVisibleChainsChange(new Set(chains));
  };
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

  const buttonStyle = {
    padding: '2px 8px',
    fontSize: '12px',
    borderRadius: '4px',
    border: '1px solid #dee2e6',
    backgroundColor: 'white',
    color: '#333',
    cursor: 'pointer',
  };
  
  const linkButtonStyle = {
    padding: '0 4px',
    fontSize: '11px',
    border: 'none',
    background: 'none',
    color: '#0066cc',
    cursor: 'pointer',
  };
  
  // Large complexes can have dozens of chains, so the list scrolls
  const chainListStyle = {
    maxHeight: '180px',
    overflowY: 'auto',
    border: '1px solid #dee2e6',
    borderRadius: '4px',
    padding: '6px',
    backgroundColor: 'white',
  };
  
  const chainRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  };
  
  const swatchStyle = {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '2px',
    marginLeft: '8px',
    flexShrink: 0,
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
      
      {/* Only worth showing for multi-chain structures - a single-chain protein has
          nothing to isolate against. */}
      {chains.length > 1 && visibleChains && (
        <div style={{ marginBottom: '15px' }}>
          <div style={{ ...statStyle, alignItems: 'center' }}>
            <span style={{ ...labelStyle, fontWeight: 'bold' }}>
              Chains ({visibleChains.size}/{chains.length})
            </span>
            <button style={buttonStyle} onClick={showAllChains}>
              Show all
            </button>
          </div>

          <div style={chainListStyle}>
            {chains.map(chain => (
              <div key={chain} style={chainRowStyle}>
                <label style={{ ...checkboxContainerStyle, marginBottom: 0, flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={visibleChains.has(chain)}
                    onChange={() => toggleChain(chain)}
                  />
                  {/* Doubles as a legend, but only when it matches the view. */}
                  {colorScheme === 'chain' && (
                    <span
                      style={{ ...swatchStyle, backgroundColor: toCssColor(getChainColor(chain)) }}
                    />
                  )}
                  <span style={checkboxLabelStyle}>Chain {chain}</span>
                </label>
                <button style={linkButtonStyle} onClick={() => isolateChain(chain)}>
                  only
                </button>
              </div>
            ))}
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
      
      {/* Hidden when the file declares no HELIX or SHEET records - common for older
          entries and predicted models - since the toggle would do nothing. */}
      {hasSecondaryStructure && (
        <label style={{ ...checkboxContainerStyle, opacity: showBackbone ? 1 : 0.5 }}>
          <input 
            type="checkbox"
            checked={showSecondaryStructure}
            // The cartoon is how the backbone is drawn, so it has nothing to act on
            // while the backbone is hidden. Disabled rather than absent, so the
            // setting does not silently appear to have no effect.
            disabled={!showBackbone}
            onChange={(e) => onShowSecondaryStructureChange && onShowSecondaryStructureChange(e.target.checked)}
          />
          <span style={checkboxLabelStyle}>Show Secondary Structure</span>
        </label>
      )}
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
