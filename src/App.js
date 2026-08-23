/**
 * Root component. Owns all app state and wires FileUpload, Controls, and ProteinViewer together.
 *
 * Flow: FileUpload hands up raw PDB text -> parse -> extract CA backbone -> center at origin
 * -> ProteinViewer renders it.
 */

import React, { useState } from 'react';
import './App.css';

import FileUpload from './components/FileUpload';
import ProteinViewer from './components/ProteinViewer';
import Controls from './components/Controls';
import StructureInfo from './components/StructureInfo';

import { parsePDB, parseHeader, getBackboneAtoms, getProteinInfo } from './utils/pdbParser';
import { centerProtein } from './utils/proteinGeometry';
import { parseSecondaryStructure, assignSecondaryStructure } from './utils/secondaryStructure';

function App() {
  // Centered CA atoms for visualization; null until a file is loaded.
  const [backboneAtoms, setBackboneAtoms] = useState(null);
  // Stats for the info panel: totalAtoms, residueCount, chainCount, chains.
  const [proteinInfo, setProteinInfo] = useState(null);
  // Header metadata: idCode, title, method, resolution, rValue, rFree, seqres, modelCount.
  const [header, setHeader] = useState(null);
  const [showBackbone, setShowBackbone] = useState(true);
  const [showAtoms, setShowAtoms] = useState(true);
  
  /**
   * showSecondaryStructure - Draw helices and strands as a tube cartoon
   */
  const [showSecondaryStructure, setShowSecondaryStructure] = useState(true);
  
  /**
   * hasSecondaryStructure - Whether the file declared any HELIX or SHEET records
   */
  const [hasSecondaryStructure, setHasSecondaryStructure] = useState(false);
  const [colorScheme, setColorScheme] = useState('residue');

  /** Parses uploaded PDB text and loads the centered backbone into state. */
  const handleFileLoaded = (pdbText) => {
    console.log('=== Processing PDB File ===');

    const allAtoms = parsePDB(pdbText);
    console.log(`Parsed ${allAtoms.length} total atoms`);

    // Read separately from the coordinates because it answers a different
    // question: not where the atoms are, but how much to trust them.
    const structureHeader = parseHeader(pdbText);
    console.log('Structure header:', structureHeader);

    let backbone = getBackboneAtoms(allAtoms);
    console.log(`Found ${backbone.length} backbone (CA) atoms`);

    // From the file's own HELIX and SHEET records rather than recomputed: deriving
    // it geometrically needs backbone N, C and O atoms a CA trace does not carry.
    const ssRanges = parseSecondaryStructure(pdbText);
    console.log(`Found ${ssRanges.length} secondary structure ranges`);
    backbone = assignSecondaryStructure(backbone, ssRanges);

    backbone = centerProtein(backbone);

    // Header passed in so observed residues can be compared against SEQRES,
    // which is what reveals unresolved regions.
    const info = getProteinInfo(allAtoms, structureHeader);
    console.log('Protein info:', info);

    setBackboneAtoms(backbone);
    setProteinInfo(info);
    setHeader(structureHeader);
    // Older entries and predicted models often omit these records entirely.
    setHasSecondaryStructure(ssRanges.length > 0);


    console.log('=== Processing Complete ===');
  };

  const appStyle = {
    padding: '20px',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    maxWidth: '1200px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    minHeight: '100vh',
  };

  const headerStyle = {
    marginBottom: '20px',
    paddingBottom: '15px',
    borderBottom: '2px solid #eee',
  };

  const titleStyle = {
    margin: '0 0 5px 0',
    color: '#1a1a2e',
    fontSize: '28px',
  };

  const subtitleStyle = {
    margin: 0,
    color: '#666',
    fontSize: '14px',
    fontWeight: 'normal',
  };

  const mainLayoutStyle = {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
  };

  const sidebarStyle = {
    flex: '0 0 280px',
    minWidth: '250px',
  };

  const viewerAreaStyle = {
    flex: '1 1 600px',
    minWidth: '400px',
  };

  const emptyStateStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '400px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '2px dashed #dee2e6',
  };

  const emptyMessageStyle = {
    textAlign: 'center',
    color: '#888',
  };

  return (
    <div style={appStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>🧬 Protein Structure Visualizer</h1>
        <p style={subtitleStyle}>
          Upload a PDB file to visualize protein backbone structure in 3D
        </p>
      </header>

      <main style={mainLayoutStyle}>
        <aside style={sidebarStyle}>
          <FileUpload onFileLoaded={handleFileLoaded} />

          {header && (
            <StructureInfo
              header={header}
              chainDetails={proteinInfo ? proteinInfo.chainDetails : []}
            />
          )}

          {proteinInfo && (
            <Controls 
              proteinInfo={proteinInfo}
              showBackbone={showBackbone}
              onShowBackboneChange={setShowBackbone}
              showAtoms={showAtoms}
              onShowAtomsChange={setShowAtoms}
              showSecondaryStructure={showSecondaryStructure}
              onShowSecondaryStructureChange={setShowSecondaryStructure}
              hasSecondaryStructure={hasSecondaryStructure}
              colorScheme={colorScheme}
              onColorSchemeChange={setColorScheme}
            />
          )}
        </aside>

        <section style={viewerAreaStyle}>
          {backboneAtoms ? (
            <ProteinViewer 
              backboneAtoms={backboneAtoms}
              showBackbone={showBackbone}
              showAtoms={showAtoms}
              showSecondaryStructure={showSecondaryStructure && hasSecondaryStructure}
              colorScheme={colorScheme}
            />
          ) : (
            <div style={emptyStateStyle}>
              <div style={emptyMessageStyle}>
                <p style={{ fontSize: '48px', margin: '0 0 10px 0' }}>🔬</p>
                <p style={{ fontSize: '18px', margin: '0 0 5px 0' }}>No protein loaded</p>
                <p style={{ fontSize: '14px', margin: 0 }}>
                  Upload a PDB file to get started
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
