/** Sidebar panel showing protein statistics and the display toggles. */

import React from 'react';
import { getChainColor, PLDDT_BANDS } from '../utils/proteinGeometry';

/** Converts a Three.js hex color number into a CSS color string. */
function toCssColor(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/**
 * @param {boolean} props.showSecondaryStructure - Whether the cartoon is drawn
 * @param {Function} props.onShowSecondaryStructureChange - Callback for that toggle
 * @param {boolean} props.hasSecondaryStructure - Whether the file declared any
 * @param {Set<string>} props.visibleChains - Chains currently drawn
 * @param {Function} props.onVisibleChainsChange - Callback with the new visible set
 * @param {boolean} props.isPredicted - Whether bFactor should be read as pLDDT * @param {boolean} props.showLigands - Whether non-water heteroatoms are drawn
 * @param {Function} props.onShowLigandsChange - Callback when ligand toggle changes
 * @param {boolean} props.showWater - Whether water is drawn
 * @param {Function} props.onShowWaterChange - Callback when water toggle changes
 * @param {Array} props.ligandSummary - Distinct ligands in the structure
 * @param {boolean} props.hasWater - Whether the file contains any water
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
  onVisibleChainsChange,
  isPredicted = false,
  showLigands = true,
  onShowLigandsChange,
  showWater = false,
  onShowWaterChange,
  ligandSummary = [],
  hasWater = false
}) {
  // Water is filtered out of the summary, so this counts real ligands only.
  const hasLigands = ligandSummary.length > 0;
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

  const legendRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '2px',
  };

  const legendSwatchStyle = {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '2px',
    flexShrink: 0,
  };

  // Structures such as ribosomes carry many distinct ligands, so this scrolls.
  const ligandListStyle = {
    maxHeight: '120px',
    overflowY: 'auto',
    marginTop: '6px',
    marginBottom: '10px',
    fontSize: '11px',
    color: '#666',
  };
  
  const ligandRowStyle = {
    padding: '2px 0',
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

      {/* 
        Heteroatom toggles
        ------------------
        Only shown when the structure actually contains heteroatoms, so a bare
        protein does not carry controls that do nothing.
      */}
      {hasLigands && (
        <label style={checkboxContainerStyle}>
          <input 
            type="checkbox"
            checked={showLigands}
            onChange={(e) => onShowLigandsChange && onShowLigandsChange(e.target.checked)}
          />
          <span style={checkboxLabelStyle}>Show Ligands</span>
        </label>
      )}
      
      {/* Gated on its own signal: most structures carry water but no ligand */}
      {hasWater && (
        <label style={checkboxContainerStyle}>
          <input 
            type="checkbox"
            checked={showWater}
            onChange={(e) => onShowWaterChange && onShowWaterChange(e.target.checked)}
          />
          <span style={checkboxLabelStyle}>Show Water</span>
        </label>
      )}
      
      {hasLigands && (
        <div style={ligandListStyle}>
          {ligandSummary.map(ligand => (
            <div
              key={`${ligand.residue}-${ligand.chain}-${ligand.residueNum}-${ligand.iCode}`}
              style={ligandRowStyle}
            >
              <strong>{ligand.residue}</strong> {ligand.chain}
              {ligand.residueNum}{ligand.iCode} · {ligand.atomCount} atoms
            </div>
          ))}
        </div>
      )}
      
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
          <option value="rainbow">Rainbow (N &rarr; C)</option>
          {/* Same column either way, but the two cases mean opposite things */}
          <option value="bfactor">
            {isPredicted ? 'By Confidence (pLDDT)' : 'By B-factor'}
          </option>
        </select>
        <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>
          {colorScheme === 'residue' && (
            <p style={{ margin: 0 }}>🟠 Hydrophobic  🟢 Polar  🔵 Positive  🔴 Negative</p>
          )}
          {colorScheme === 'chain' && (
            <p style={{ margin: 0 }}>Each chain gets a unique color</p>
          )}
          {colorScheme === 'rainbow' && (
            <p style={{ margin: 0 }}>
              Blue at the N terminus running to red at the C terminus, restarting
              for each chain. Shows the direction the chain travels.
            </p>
          )}
          {colorScheme === 'bfactor' && isPredicted && (
            <div>
              <p style={{ margin: '0 0 4px 0' }}>
                Predicted model — this column holds pLDDT confidence, where
                higher is more reliable.
              </p>
              {PLDDT_BANDS.map(band => (
                <div key={band.min} style={legendRowStyle}>
                  <span
                    style={{ ...legendSwatchStyle, backgroundColor: toCssColor(band.color) }}
                  />
                  {band.label}
                </div>
              ))}
            </div>
          )}
          {colorScheme === 'bfactor' && !isPredicted && (
            <p style={{ margin: 0 }}>
              Blue where the model is well determined, red where atoms are
              mobile or uncertain. Scaled to this structure's own range.
            </p>
          )}
        </div>
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
