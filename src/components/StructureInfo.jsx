/**
 * Metadata panel for the loaded structure.
 *
 * A 1.2A crystal structure and a 4.0A cryo-EM map look identical once rendered as
 * spheres, but the amount of real measurement behind each atom is very different.
 * Resolution, method and R-free are how that is judged, and none of it can be
 * derived from the coordinates.
 */

import React from 'react';

/** Whether the header carried anything worth showing. */
function hasHeaderContent(header) {
  return Boolean(
    header.idCode || header.title || header.method || header.classification
  ) || header.resolution !== null || header.modelCount > 1;
}

/** Resolution is absent for NMR structures. */
function formatResolution(resolution) {
  return resolution === null ? 'N/A' : `${resolution.toFixed(2)} Å`;
}

/** Older entries record refinement R values as literally "NULL". */
function formatRValue(value) {
  return value === null ? '—' : value.toFixed(3);
}

/**
 * @param {Object} props.header - Parsed header from parseHeader()
 * @param {Array} props.chainDetails - Per-chain residue counts from getProteinInfo()
 */
function StructureInfo({ header, chainDetails = [] }) {
  // parseHeader always returns an object, so a truthiness check would let a
  // coordinate-only file (a docking result, a hand-trimmed export) render a
  // panel whose only row is "Resolution: N/A". Gate on real content instead
  if (!header || !hasHeaderContent(header)) return null;

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

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '14px',
    gap: '10px',
  };

  const labelStyle = { color: '#666', flexShrink: 0 };
  const valueStyle = { fontWeight: 'bold', color: '#333', textAlign: 'right' };

  const titleStyle = {
    fontSize: '13px',
    color: '#333',
    lineHeight: 1.4,
    marginBottom: '12px',
  };

  const noticeStyle = {
    marginTop: '12px',
    padding: '8px 10px',
    backgroundColor: '#fff3cd',
    border: '1px solid #ffe69c',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#664d03',
  };

  // Chains whose SEQRES declares residues that never made it into the model
  const chainsWithGaps = chainDetails.filter(c => c.missingResidues > 0);

  return (
    <div style={panelStyle}>
      <h3 style={headerStyle}>Structure</h3>

      {header.idCode && (
        <div style={rowStyle}>
          <span style={labelStyle}>PDB ID:</span>
          <span style={valueStyle}>{header.idCode}</span>
        </div>
      )}

      {header.classification && (
        <div style={rowStyle}>
          <span style={labelStyle}>Class:</span>
          <span style={valueStyle}>{header.classification}</span>
        </div>
      )}

      {header.title && <p style={titleStyle}>{header.title}</p>}

      {header.method && (
        <div style={rowStyle}>
          <span style={labelStyle}>Method:</span>
          <span style={valueStyle}>{header.method}</span>
        </div>
      )}

      <div style={rowStyle}>
        <span style={labelStyle}>Resolution:</span>
        <span style={valueStyle}>{formatResolution(header.resolution)}</span>
      </div>

      {/* Only meaningful for refined crystal structures, so hidden when absent */}
      {(header.rValue !== null || header.rFree !== null) && (
        <div style={rowStyle}>
          <span style={labelStyle}>R / R-free:</span>
          <span style={valueStyle}>
            {formatRValue(header.rValue)} / {formatRValue(header.rFree)}
          </span>
        </div>
      )}

      {/* Per-chain completeness, only worth a row when there is a comparison */}
      {chainDetails.some(c => c.expectedResidues !== null) && (
        <div style={{ marginTop: '12px' }}>
          {chainDetails.map(chain => (
            <div key={chain.chain} style={rowStyle}>
              <span style={labelStyle}>Chain {chain.chain}:</span>
              <span style={valueStyle}>
                {chain.observedResidues}
                {chain.expectedResidues !== null && ` / ${chain.expectedResidues}`} res
              </span>
            </div>
          ))}
        </div>
      )}

      {chainsWithGaps.length > 0 && (
        <div style={noticeStyle}>
          <strong>Incomplete model.</strong> Residues declared in SEQRES are
          missing from the coordinates
          {chainsWithGaps
            .map(c => ` (chain ${c.chain}: ${c.missingResidues})`)
            .join(',')}
          . These are usually disordered regions that did not resolve.
        </div>
      )}

      {header.modelCount > 1 && (
        <div style={noticeStyle}>
          <strong>{header.modelCount} models</strong> in this file (typical of
          NMR). Only the first is displayed — rendering all of them at once
          superimposes every conformer.
        </div>
      )}
    </div>
  );
}

export default StructureInfo;
