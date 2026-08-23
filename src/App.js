/**
 * Root component. Owns all app state and wires FileUpload, Controls, and ProteinViewer together.
 *
 * Flow: FileUpload hands up raw PDB text -> parse -> extract CA backbone -> center at origin
 * -> ProteinViewer renders it.
 */

import React, { useState, useMemo } from 'react';
import './App.css';

import FileUpload from './components/FileUpload';
import ProteinViewer from './components/ProteinViewer';
import Controls from './components/Controls';
import StructureInfo from './components/StructureInfo';

import { parsePDB, parseHeader, getBackboneAtoms, getProteinInfo } from './utils/pdbParser';
import { getCentroid, translateAtoms, looksLikePredictedModel } from './utils/proteinGeometry';
import { parseSecondaryStructure, assignSecondaryStructure } from './utils/secondaryStructure';
import { getLigandAtoms, getLigandSummary, isWater } from './utils/ligands';

/**
 * Chain IDs that actually have a backbone to draw.
 *
 * @param {Object} info - Result of getProteinInfo()
 * @returns {Array<string>} Chains with at least one observed residue
 */
function polymerChains(info) {
  return (info.chainDetails || [])
    .filter(chain => chain.observedResidues > 0)
    .map(chain => chain.chain);
}

function App() {
  // Centered CA atoms for visualization; null until a file is loaded.
  const [backboneAtoms, setBackboneAtoms] = useState(null);
  // Stats for the info panel: totalAtoms, residueCount, chainCount, chains.
  const [proteinInfo, setProteinInfo] = useState(null);
  // Header metadata: idCode, title, method, resolution, rValue, rFree, seqres, modelCount.
  const [header, setHeader] = useState(null);
  const [showBackbone, setShowBackbone] = useState(true);
  const [showAtoms, setShowAtoms] = useState(true);
  // Centered HETATM records: ligands, ions, cofactors and water.
  const [heteroAtoms, setHeteroAtoms] = useState(null);
  const [showLigands, setShowLigands] = useState(true);
  // Off by default: a high resolution structure can carry hundreds of waters.
  const [showWater, setShowWater] = useState(false);
  // One entry per distinct ligand, for the info panel.
  const [ligandSummary, setLigandSummary] = useState([]);
  // Tracked apart from the ligand list, which excludes water.
  const [hasWater, setHasWater] = useState(false);
  // A Set so membership checks stay constant time; complexes have dozens of
  // chains. null means nothing is loaded yet.
  const [visibleChains, setVisibleChains] = useState(null);

  // Whether the temperature factor column holds pLDDT rather than a B-factor. Flips
  // the meaning of the colouring, so it is derived once and passed to both the
  // viewer and the legend.
  const isPredicted = useMemo(() => looksLikePredictedModel(header), [header]);
  
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

    // The centroid comes from the backbone and is then applied to the heteroatoms
    // too: centering a ligand on itself would move it to the origin, out of the
    // binding site it occupies.
    const centroid = getCentroid(backbone);
    backbone = translateAtoms(backbone, centroid);

    // Water is kept here so it can be toggled later.
    const hetero = translateAtoms(
      getLigandAtoms(allAtoms, { includeWater: true }),
      centroid
    );
    const ligands = getLigandSummary(allAtoms);
    console.log(`Found ${hetero.length} heteroatoms`, ligands);

    // Header passed in so observed residues can be compared against SEQRES,
    // which is what reveals unresolved regions.
    const info = getProteinInfo(allAtoms, structureHeader);
    console.log('Protein info:', info);

    setBackboneAtoms(backbone);
    setProteinInfo(info);
    setHeteroAtoms(hetero);
    setLigandSummary(ligands);
    // Separate from the ligand list, which excludes water: a structure whose only
    // heteroatoms are ordered waters would otherwise show no water toggle at all.
    setHasWater(hetero.some(atom => isWater(atom.residue)));
    setHeader(structureHeader);
    // Older entries and predicted models often omit these records entirely.
    setHasSecondaryStructure(ssRanges.length > 0);
    // Every chain starts visible. Taken from chainDetails rather than info.chains,
    // which counts every chain in the file including ones holding only water or
    // ligands - those have no backbone, so a checkbox for them would do nothing.
    setVisibleChains(new Set(polymerChains(info)));

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
              showLigands={showLigands}
              onShowLigandsChange={setShowLigands}
              showWater={showWater}
              onShowWaterChange={setShowWater}
              ligandSummary={ligandSummary}
              hasWater={hasWater}
              colorScheme={colorScheme}
              onColorSchemeChange={setColorScheme}
              visibleChains={visibleChains}
              onVisibleChainsChange={setVisibleChains}
              isPredicted={isPredicted}
            />
          )}
        </aside>

        <section style={viewerAreaStyle}>
          {/* An empty array is truthy, so length has to be checked explicitly.
              Heteroatoms alone also count: a ligand-only or nucleic acid file has
              real coordinates but no CA atoms. */}
          {(backboneAtoms && backboneAtoms.length > 0) ||
          (heteroAtoms && heteroAtoms.length > 0) ? (
            <ProteinViewer 
              backboneAtoms={backboneAtoms}
              showBackbone={showBackbone}
              showAtoms={showAtoms}
              showSecondaryStructure={showSecondaryStructure && hasSecondaryStructure}
              colorScheme={colorScheme}
              visibleChains={visibleChains}
              isPredicted={isPredicted}
              heteroAtoms={heteroAtoms}
              showLigands={showLigands}
              showWater={showWater}
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
