/**
 * ProteinViewer Component
 * =======================
 * 
 * The main 3D visualization component using React Three Fiber.
 * 
 * React Three Fiber (R3F) Overview:
 * --------------------------------
 * React Three Fiber is a React renderer for Three.js. It lets you:
 * - Write Three.js code using React components
 * - Use React features like hooks, state, and effects with 3D graphics
 * - Declaratively build 3D scenes (describe what you want, not how to build it)
 * 
 * Key R3F Components:
 * - <Canvas>: The 3D viewport, creates a WebGL context
 * - <mesh>: A 3D object with geometry and material
 * - <ambientLight>: Light that illuminates all objects equally
 * - <pointLight>: Light that radiates from a point in all directions
 * 
 * @react-three/drei:
 * - Helper components built on top of R3F
 * - <OrbitControls>: Camera controls for rotating/zooming with mouse
 * 
 * Coordinate System:
 * - X-axis: Points right
 * - Y-axis: Points up
 * - Z-axis: Points towards the viewer
 * - Origin (0,0,0): Center of the scene
 * 
 * Camera:
 * - PerspectiveCamera: Creates realistic depth (far objects look smaller)
 * - position: Where the camera is located
 * - fov: Field of view in degrees (larger = wider view)
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { createBackboneLine, createAtomSpheres, getMaxDimension } from '../utils/proteinGeometry';

/**
 * Protein Component (Internal)
 * ----------------------------
 * Renders the protein structure inside the Three.js scene.
 * This is a child of Canvas and has access to Three.js context.
 * 
 * Uses useEffect to handle Three.js objects because:
 * - Three.js objects (Line, Mesh) are not React components
 * - We need to manually add/remove them from the scene
 * - useRef gives us a reference to the Three.js group
 * - useEffect runs when backboneAtoms changes
 * 
 * @param {Object} props - Component props
 * @param {Array} props.backboneAtoms - Array of centered backbone atoms
 */
function Protein({ backboneAtoms }) {
  // useRef creates a reference that persists across renders
  // We'll attach it to the <group> element to access the Three.js Group object
  const groupRef = useRef();
  
  // useEffect runs side effects after render
  // We use it to create and add Three.js objects to our group
  useEffect(() => {
    // Early return if no atoms to render
    if (!backboneAtoms || backboneAtoms.length === 0) return;
    
    // Safety check - make sure the ref is attached
    if (!groupRef.current) return;
    
    // Clear any previous geometry from the group
    // This is important when a new file is loaded
    // We need to remove old objects before adding new ones
    while (groupRef.current.children.length > 0) {
      // Get the first child
      const child = groupRef.current.children[0];
      // Remove it from the group
      groupRef.current.remove(child);
      // Dispose of geometry and material to free GPU memory
      // This prevents memory leaks when loading multiple files
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    
    // Create and add the backbone line
    // This connects all CA atoms with a green line
    const backboneLine = createBackboneLine(backboneAtoms);
    groupRef.current.add(backboneLine);
    
    // Create and add atom spheres
    // Each CA atom gets a red sphere
    const spheres = createAtomSpheres(backboneAtoms);
    spheres.forEach(sphere => groupRef.current.add(sphere));
    
    // Log success for debugging
    console.log(`Rendered protein: ${backboneAtoms.length} residues, ${spheres.length + 1} objects`);
    
    // Cleanup function runs when component unmounts or before re-running effect
    // This ensures we don't have memory leaks
    return () => {
      // Dispose of all geometries and materials when cleaning up
      if (groupRef.current) {
        groupRef.current.children.forEach(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }
    };
  }, [backboneAtoms]); // Dependency array - effect runs when backboneAtoms changes
  
  // Render a Three.js group
  // <group> is R3F's wrapper for THREE.Group
  // THREE.Group is a container that can hold multiple 3D objects
  // We attach our ref so we can add objects to it in useEffect
  return <group ref={groupRef} />;
}

/**
 * ProteinViewer Component (Main Export)
 * -------------------------------------
 * The main component that sets up the 3D canvas and controls.
 * 
 * Responsibilities:
 * 1. Create the WebGL canvas using R3F's <Canvas>
 * 2. Set up camera with appropriate position and field of view
 * 3. Add lighting so we can see the 3D objects
 * 4. Include OrbitControls for mouse interaction
 * 5. Render the Protein component with atom data
 * 
 * @param {Object} props - Component props
 * @param {Array} props.backboneAtoms - Array of centered backbone CA atoms
 */
function ProteinViewer({ backboneAtoms }) {
  // Calculate appropriate camera distance based on protein size
  // This ensures the protein fits nicely in view regardless of size
  const cameraDistance = useMemo(() => {
    if (!backboneAtoms || backboneAtoms.length === 0) return 50;
    // Get the maximum dimension of the protein
    const maxDim = getMaxDimension(backboneAtoms);
    // Camera should be about 2x the protein size for a good view
    // Minimum of 30 to ensure we're not too close
    return Math.max(30, maxDim * 2);
  }, [backboneAtoms]);
  
  // Container styles
  const containerStyle = {
    width: '100%',
    height: '600px',
    backgroundColor: '#1a1a2e',  // Dark blue-gray background
    borderRadius: '8px',
    overflow: 'hidden',  // Prevent canvas from overflowing rounded corners
  };
  
  return (
    <div style={containerStyle}>
      {/*
        Canvas - The main 3D viewport
        -----------------------------
        This creates a WebGL rendering context and sets up the scene.
        
        Props:
        - camera: Configuration for the perspective camera
          - position: [x, y, z] where the camera is located
          - fov: Field of view in degrees (75 is a good default)
          - near/far: Clipping planes (objects outside range aren't rendered)
        
        Everything inside <Canvas> is rendered in 3D space.
      */}
      <Canvas 
        camera={{ 
          position: [0, 0, cameraDistance],  // Camera on Z-axis, looking at origin
          fov: 75,  // Field of view - 75 degrees is a nice wide view
          near: 0.1,  // Near clipping plane - objects closer than this aren't rendered
          far: 1000,  // Far clipping plane - objects farther than this aren't rendered
        }}
      >
        {/*
          Background Color
          -----------------
          Sets the scene background color.
          You can also use <Environment> from drei for HDR backgrounds.
        */}
        <color attach="background" args={['#1a1a2e']} />
        
        {/*
          Lighting
          --------
          Without lights, 3D objects would appear black (except for materials
          with emissive properties or MeshBasicMaterial).
          
          ambientLight: 
          - Illuminates all objects equally from all directions
          - No shadows, no direction
          - intensity: How bright (0 = off, 1 = full)
          
          pointLight:
          - Radiates light from a single point in all directions
          - Like a light bulb
          - position: Where the light is located
          - Creates highlights on curved surfaces
        */}
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        
        {/*
          The Protein
          -----------
          Our custom component that renders the backbone line and atom spheres.
          Only render if we have atoms to show.
        */}
        {backboneAtoms && backboneAtoms.length > 0 && (
          <Protein backboneAtoms={backboneAtoms} />
        )}
        
        {/*
          OrbitControls
          -------------
          From @react-three/drei, this enables mouse/touch controls:
          - Left click + drag: Rotate the view around the center
          - Right click + drag: Pan the camera
          - Scroll wheel: Zoom in/out
          - Touch: Pinch to zoom, drag to rotate
          
          Props you could add:
          - enableDamping: Smooth camera movement
          - dampingFactor: How much damping (0-1)
          - minDistance/maxDistance: Limit zoom range
          - autoRotate: Slowly spin the view
        */}
        <OrbitControls 
          enableDamping={true}  // Smooth camera movement
          dampingFactor={0.05}  // How much smoothing (lower = more smooth)
          minDistance={5}  // Can't zoom closer than 5 units
          maxDistance={500}  // Can't zoom farther than 500 units
        />
        
        {/*
          Grid Helper (Optional)
          ----------------------
          Uncomment to see a grid on the XZ plane.
          Helpful for understanding scale and orientation.
        */}
        {/* <gridHelper args={[100, 100, '#444', '#222']} /> */}
        
        {/*
          Axes Helper (Optional)
          ----------------------
          Uncomment to see RGB axes: Red=X, Green=Y, Blue=Z
          Helpful for understanding orientation.
        */}
        {/* <axesHelper args={[20]} /> */}
        
      </Canvas>
    </div>
  );
}

// Export the ProteinViewer as the default export
export default ProteinViewer;
