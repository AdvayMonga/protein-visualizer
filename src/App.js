/**
 * App.js - Main Application Component
 * ====================================
 * 
 * This is the root component of the Protein Structure Visualizer application.
 * It orchestrates all the other components and manages the application state.
 * 
 * Application Architecture:
 * -------------------------
 * 
 *                    ┌─────────────────┐
 *                    │      App        │
 *                    │  (State Owner)  │
 *                    └────────┬────────┘
 *                             │
 *          ┌──────────────────┼──────────────────┐
 *          │                  │                  │
 *   ┌──────▼──────┐   ┌───────▼───────┐   ┌──────▼──────┐
 *   │ FileUpload  │   │   Controls    │   │ProteinViewer│
 *   │ (Input)     │   │   (UI)        │   │   (3D)      │
 *   └─────────────┘   └───────────────┘   └─────────────┘
 * 
 * Data Flow:
 * 1. User uploads PDB file via FileUpload component
 * 2. FileUpload reads file and passes raw text to App
 * 3. App parses the PDB text and extracts backbone atoms
 * 4. App centers the protein at origin
 * 5. App passes centered atoms to ProteinViewer
 * 6. ProteinViewer creates 3D geometry and renders it
 * 
 * State Management:
 * - This app uses React's built-in useState hook
 * - For larger apps, consider Redux or Context API
 * - State "lives" in App and flows down to children as props
 * 
 * React Hooks Used:
 * - useState: For managing component state (atoms, protein info)
 */

import React, { useState } from 'react';
import './App.css';

// Import our custom components
import FileUpload from './components/FileUpload';
import ProteinViewer from './components/ProteinViewer';
import Controls from './components/Controls';

// Import utility functions for parsing and geometry
import { parsePDB, getBackboneAtoms, getProteinInfo } from './utils/pdbParser';
import { centerProtein } from './utils/proteinGeometry';

/**
 * App - The main application component
 * 
 * This component:
 * 1. Manages application state (loaded protein data)
 * 2. Handles the file loading workflow
 * 3. Coordinates between FileUpload, Controls, and ProteinViewer
 */
function App() {
  // ============================================
  // STATE MANAGEMENT
  // ============================================
  
  /**
   * backboneAtoms - The centered CA atoms for visualization
   * 
   * useState returns an array with two elements:
   * - First element: The current state value
   * - Second element: A function to update the state
   * 
   * Initial value is null (no protein loaded yet)
   */
  const [backboneAtoms, setBackboneAtoms] = useState(null);
  
  /**
   * proteinInfo - Statistics about the loaded protein
   * Contains: totalAtoms, residueCount, chainCount, chains
   */
  const [proteinInfo, setProteinInfo] = useState(null);
  
  /**
   * Display options - Control what's shown in the viewer
   */
  const [showBackbone, setShowBackbone] = useState(true);
  const [showAtoms, setShowAtoms] = useState(true);
  
  // ============================================
  // EVENT HANDLERS
  // ============================================
  
  /**
   * handleFileLoaded - Processes the uploaded PDB file
   * 
   * This is called by the FileUpload component when a file is loaded.
   * It's a "callback prop" pattern - we define the function here and
   * pass it down to the child component.
   * 
   * Processing steps:
   * 1. Parse the PDB text to extract all atoms
   * 2. Extract only the backbone (CA) atoms
   * 3. Center the protein at the origin
   * 4. Update state to trigger re-render
   * 
   * @param {string} pdbText - The raw text content of the PDB file
   */
  const handleFileLoaded = (pdbText) => {
    console.log('=== Processing PDB File ===');
    
    // Step 1: Parse the PDB file
    // This converts raw text into structured atom objects
    const allAtoms = parsePDB(pdbText);
    console.log(`Parsed ${allAtoms.length} total atoms`);
    
    // Step 2: Extract backbone (CA) atoms only
    // This simplifies visualization to one point per residue
    let backbone = getBackboneAtoms(allAtoms);
    console.log(`Found ${backbone.length} backbone (CA) atoms`);
    
    // Step 3: Center the protein at the origin
    // This ensures the protein appears in the center of the view
    backbone = centerProtein(backbone);
    
    // Step 4: Get protein statistics for the info panel
    const info = getProteinInfo(allAtoms);
    console.log('Protein info:', info);
    
    // Step 5: Update state - this triggers a re-render
    // React will re-render all components that depend on these values
    setBackboneAtoms(backbone);
    setProteinInfo(info);
    
    console.log('=== Processing Complete ===');
  };
  
  // ============================================
  // STYLES
  // ============================================
  
  // Container for the entire app
  const appStyle = {
    padding: '20px',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    maxWidth: '1200px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    minHeight: '100vh',
  };
  
  // Header style
  const headerStyle = {
    marginBottom: '20px',
    paddingBottom: '15px',
    borderBottom: '2px solid #eee',
  };
  
  // Title style
  const titleStyle = {
    margin: '0 0 5px 0',
    color: '#1a1a2e',
    fontSize: '28px',
  };
  
  // Subtitle style
  const subtitleStyle = {
    margin: 0,
    color: '#666',
    fontSize: '14px',
    fontWeight: 'normal',
  };
  
  // Layout for main content (sidebar + viewer)
  const mainLayoutStyle = {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
  };
  
  // Sidebar containing upload and controls
  const sidebarStyle = {
    flex: '0 0 280px',
    minWidth: '250px',
  };
  
  // Main viewer area
  const viewerAreaStyle = {
    flex: '1 1 600px',
    minWidth: '400px',
  };
  
  // Empty state message
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
  
  // ============================================
  // RENDER
  // ============================================
  
  return (
    <div style={appStyle}>
      {/* 
        Header Section
        Contains the app title and description
      */}
      <header style={headerStyle}>
        <h1 style={titleStyle}>🧬 Protein Structure Visualizer</h1>
        <p style={subtitleStyle}>
          Upload a PDB file to visualize protein backbone structure in 3D
        </p>
      </header>
      
      {/* 
        Main Content Area
        Two-column layout: sidebar (controls) + viewer
      */}
      <main style={mainLayoutStyle}>
        {/* 
          Sidebar - Upload and Controls
          Fixed width, contains FileUpload and Controls components
        */}
        <aside style={sidebarStyle}>
          {/* File upload component */}
          <FileUpload onFileLoaded={handleFileLoaded} />
          
          {/* 
            Controls panel - only show when a protein is loaded
            This prevents showing empty controls
          */}
          {proteinInfo && (
            <Controls 
              proteinInfo={proteinInfo}
              showBackbone={showBackbone}
              onShowBackboneChange={setShowBackbone}
              showAtoms={showAtoms}
              onShowAtomsChange={setShowAtoms}
            />
          )}
        </aside>
        
        {/* 
          Main Viewer Area
          Shows either the 3D viewer or an empty state message
        */}
        <section style={viewerAreaStyle}>
          {backboneAtoms ? (
            /* 
              ProteinViewer - The 3D visualization
              Rendered when we have backbone atoms to display
            */
            <ProteinViewer backboneAtoms={backboneAtoms} />
          ) : (
            /* 
              Empty State - Shown before any file is loaded
              Provides visual feedback that nothing is loaded yet
            */
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
      
      {/* 
        Footer (Optional)
        Could add credits, links, version info, etc.
      */}
      <footer style={{ marginTop: '30px', textAlign: 'center', color: '#999', fontSize: '12px' }}>
        <p>
          Built with React, Three.js, and React Three Fiber
        </p>
      </footer>
    </div>
  );
}

// Export the App component as default
// This is used by index.js to render the app
export default App;
