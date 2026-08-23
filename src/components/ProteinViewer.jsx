/**
 * 3D viewport for the protein, built on react-three-fiber.
 *
 * Sets up the canvas, camera, lighting, and OrbitControls, and hosts the Protein
 * component that builds the actual Three.js geometry.
 */

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { createBackboneLine, createAtomSpheres, getMaxDimension, getBoundingRadius, getResidueRadius } from '../utils/proteinGeometry';
import { getAtomsByChains } from '../utils/pdbParser';
import {
  isClickNotDrag,
  toNormalizedDeviceCoords,
  firstAtomHit,
  formatAtomLabel,
} from '../utils/picking';

/**
 * Releases the GPU memory held by an object and everything below it.
 *
 * traverse() rather than a direct property check: the backbone is a Group of
 * per-segment meshes, and a Group has no geometry or material of its own, so checking
 * only the top-level object would silently leak every tube inside it.
 */
function disposeObject(object) {
  object.traverse(node => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) node.material.dispose();
  });
}

/**
 * Builds the protein geometry into a THREE.Group.
 *
 * The geometry helpers return raw Three.js objects rather than R3F elements, so the
 * group is populated imperatively in an effect and rebuilt whenever the inputs change.
 * The group ref is owned by ProteinViewer so the picker can raycast against it.
 */
function Protein({ backboneAtoms, showBackbone, showAtoms, showSecondaryStructure, colorScheme, isPredicted, groupRef }) {
  useEffect(() => {
    if (!backboneAtoms || backboneAtoms.length === 0) return;
    if (!groupRef.current) return;

    // Captured for the cleanup below: React nulls the ref before passive effect
    // cleanups run on unmount, so reading it there would free nothing.
    const group = groupRef.current;

    // Drop the previous structure and free its GPU resources before rebuilding.
    while (groupRef.current.children.length > 0) {
      const child = groupRef.current.children[0];
      groupRef.current.remove(child);
      disposeObject(child);
    }

    if (showBackbone) {
      const backboneLine = createBackboneLine(backboneAtoms, { showSecondaryStructure });
      groupRef.current.add(backboneLine);
    }

    if (showAtoms) {
      const spheres = createAtomSpheres(backboneAtoms, colorScheme, { isPredicted });
      spheres.forEach(sphere => groupRef.current.add(sphere));
    }

    console.log(`Rendered protein: ${backboneAtoms.length} residues, showBackbone=${showBackbone}, showAtoms=${showAtoms}, colorScheme=${colorScheme}`);

    return () => {
      group.children.forEach(disposeObject);
    };
  }, [backboneAtoms, showBackbone, showAtoms, showSecondaryStructure, colorScheme, isPredicted, groupRef]);
  return <group ref={groupRef} />;
}

/**
 * Keeps the fog range pinned to where the protein actually is, every frame.
 *
 * A fixed range cannot work here: OrbitControls lets the camera travel between 5 and
 * 500 units, and because the fog color matches the background, anything past the far
 * bound is invisible rather than merely hazy.
 *
 * The bounds are deliberately lopsided - near at the front of the protein, far three
 * radii out. Three.js smoothsteps across the range, so the back of the structure
 * lands around 50% background: enough to read as depth, not enough to erase it.
 *
 * @param {number} radius - Bounding radius of the protein, centered at origin
 */
function DepthFog({ radius }) {
  const { scene, camera } = useThree();

  useFrame(() => {
    if (!scene.fog) return;
    // The protein is centered at the origin, so distance to the origin is distance
    // to its center.
    const distance = camera.position.length();
    scene.fog.near = Math.max(0.1, distance - radius);
    scene.fog.far = distance + radius * 3;
  });

  return <fog attach="fog" args={['#1a1a2e', 1, 1000]} />;
}

/**
 * Turns clicks on the canvas into atom selections. Renders nothing; it exists to hold
 * the effect that owns the listeners.
 *
 * Raycasts manually rather than using R3F's onClick: the spheres are built
 * imperatively with THREE.Mesh and never pass through React, so R3F cannot see them.
 * One ray against the group also costs a single raycast per click instead of a React
 * component per atom.
 *
 * @param {Object} props.groupRef - Ref to the group holding the atom spheres
 * @param {Function} props.onSelect - Called with the picked atom, or null
 */
function AtomPicker({ groupRef, onSelect }) {
  const { camera, gl, raycaster } = useThree();
  
  // Where the press started, so a release far away can be treated as a drag.
  // Held in a ref rather than the effect closure so it survives the listeners
  // being reattached: if that happened between a press and its release, the
  // origin would reset to (0,0) and a drag ending near the top-left corner
  // would measure as a click
  const pressedAt = useRef({ x: 0, y: 0 });
  
  useEffect(() => {
    const canvas = gl.domElement;
    
    const handlePointerDown = (event) => {
      pressedAt.current = { x: event.clientX, y: event.clientY };
    };
    
    const handlePointerUp = (event) => {
      // Left button only. Orbit controls pan with the right button and dolly
      // with the middle one, so without this a short right-click pan - or the
      // click that opens the context menu - would change the selection
      if (event.button !== 0) return;
      
      const releasedAt = { x: event.clientX, y: event.clientY };
      
      // Orbit controls rotate with the same button, so a drag must not select
      if (!isClickNotDrag(pressedAt.current, releasedAt)) return;
      if (!groupRef.current) return;
      
      const rect = canvas.getBoundingClientRect();
      const pointer = toNormalizedDeviceCoords(event.clientX, event.clientY, rect);
      
      raycaster.setFromCamera(pointer, camera);
      // Recursive, because the backbone may be a group of meshes
      const hits = raycaster.intersectObjects(groupRef.current.children, true);
      
      // Clicking empty space clears the selection
      onSelect(firstAtomHit(hits));
    };
    
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, [camera, gl, raycaster, groupRef, onSelect]);
  
  return null;
}

/**
 * SelectedAtomMarker Component (Internal)
 * ---------------------------------------
 * A wireframe cage around the selected atom.
 *
 * Declarative rather than imperative so React Three Fiber disposes it when the
 * selection changes, which is also why it does not live in the imperative group.
 *
 * @param {Object} props - Component props
 * @param {Object|null} props.atom - The selected atom, or null
 * @param {number} props.radius - Marker radius, scaled to the atom spheres
 */
function SelectedAtomMarker({ atom, radius }) {
  if (!atom) return null;
  
  return (
    <mesh position={[atom.x, atom.y, atom.z]}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshBasicMaterial color={0xffffff} wireframe transparent opacity={0.7} />
    </mesh>
  );
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
 * @param {Function} props.onAtomSelect - Optional callback with the picked atom
 * @param {Set<string>|null} props.visibleChains - Chains to draw, or null for all
 * @param {boolean} props.isPredicted - Whether bFactor should be read as pLDDT
 */
function ProteinViewer({ backboneAtoms, showBackbone = true, showAtoms = true, showSecondaryStructure = false, colorScheme = 'residue', isPredicted = false, visibleChains = null, onAtomSelect }) {
  // Owned here rather than inside Protein so the picker can raycast against it.
  const groupRef = useRef();

  const [selectedAtom, setSelectedAtom] = useState(null);
  
  // useCallback keeps the identity stable so the picker does not detach and
  // reattach its listeners on every render
  const handleSelect = useCallback((atom) => {
    setSelectedAtom(atom);
    if (onAtomSelect) onAtomSelect(atom);
  }, [onAtomSelect]);
  
  // A new structure invalidates any previous selection. Routed through
  // handleSelect rather than setSelectedAtom so a parent driving its own panel
  // from onAtomSelect clears too, instead of showing an atom from the old file
  useEffect(() => {
    handleSelect(null);
  }, [backboneAtoms, handleSelect]);

  // Pull the camera back proportionally to the protein so it fits the frame at any
  // size. Based on the full structure, not the visible subset, so the camera does
  // not jump when a chain is toggled.
  const cameraDistance = useMemo(() => {
    if (!backboneAtoms || backboneAtoms.length === 0) return 50;
    const maxDim = getMaxDimension(backboneAtoms);
    return Math.max(30, maxDim * 2);
  }, [backboneAtoms]);

  // Sized off the atom spheres so the marker reads as a cage around one at any
  // structure size, rather than a fixed radius that swallows small proteins and
  // vanishes inside large ones.
  const markerRadius = useMemo(() => {
    if (!backboneAtoms || backboneAtoms.length === 0) return 0.9;
    return getResidueRadius(backboneAtoms) * 1.8;
  }, [backboneAtoms]);


  // Derived from the full structure, not the visible subset, so hiding a chain does
  // not pull the fog in around what is left.
  const boundingRadius = useMemo(() => {
    if (!backboneAtoms || backboneAtoms.length === 0) return 25;
    return getBoundingRadius(backboneAtoms);
  }, [backboneAtoms]);

  // Filtering happens after centering, so hiding a chain leaves the remaining
  // chains where they were instead of re-centering them.
  const visibleAtoms = useMemo(() => {
    if (!backboneAtoms) return backboneAtoms;
    // null means "no filter applied", which differs from an empty set.
    if (visibleChains === null) return backboneAtoms;
    return getAtomsByChains(backboneAtoms, visibleChains);
  }, [backboneAtoms, visibleChains]);

  const containerStyle = {
    width: '100%',
    height: '600px',
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    overflow: 'hidden',
    position: 'relative',  // Anchors the readout and notice over the canvas.
  };

  // Sits over the canvas so the eye does not leave the structure to read what was
  // clicked, as in established molecular viewers.
  const readoutStyle = {
    position: 'absolute',
    top: '12px',
    left: '12px',
    padding: '8px 12px',
    backgroundColor: 'rgba(26, 26, 46, 0.85)',
    border: '1px solid #4a4a6a',
    borderRadius: '4px',
    color: '#e8e8f0',
    fontSize: '13px',
    fontFamily: 'monospace',
    pointerEvents: 'none',  // Never intercept clicks meant for the structure.
  };

  // Hiding every chain leaves a blank dark box indistinguishable from a crash.
  const noticeStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#8a8aa0',
    fontSize: '14px',
    textAlign: 'center',
    pointerEvents: 'none',  };

  return (
    <div style={containerStyle}>
      <Canvas 
        camera={{ 
          position: [0, 0, cameraDistance],
          fov: 75,
          near: 0.1,
          far: 1000,
        }}
      >
        <color attach="background" args={['#1a1a2e']} />

        <DepthFog radius={boundingRadius} />

        {/*
          directionalLight rather than pointLight: point light intensity falls off with
          distance squared, and the protein can be 100+ units across.
        */}
        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 8, 10]} intensity={2} />
        <directionalLight position={[-6, -4, -8]} intensity={0.7} />

        {visibleAtoms && visibleAtoms.length > 0 && (
          <Protein 
            backboneAtoms={visibleAtoms}
            showBackbone={showBackbone}
            showAtoms={showAtoms}
            showSecondaryStructure={showSecondaryStructure}
            colorScheme={colorScheme}
            groupRef={groupRef}
            isPredicted={isPredicted}
          />
        )}

        {/* Click-to-identify, and the marker showing what is selected. */}
        <AtomPicker groupRef={groupRef} onSelect={handleSelect} />
        <SelectedAtomMarker atom={selectedAtom} radius={markerRadius} />

        {/* Left-drag rotates, right-drag pans, scroll zooms. */}
        <OrbitControls 
          enableDamping={true}
          dampingFactor={0.05}
          minDistance={5}
          maxDistance={500}
        />
      </Canvas>
      
      {/* Selection readout, shown only when an atom is selected */}
      {selectedAtom && (
        <div style={readoutStyle}>
          <div style={{ fontWeight: 'bold' }}>{formatAtomLabel(selectedAtom)}</div>
          <div style={{ opacity: 0.75, fontSize: '11px', marginTop: '2px' }}>
            atom {selectedAtom.name} · serial {selectedAtom.serial}
          </div>
        </div>
      )}

      {backboneAtoms && backboneAtoms.length > 0 && visibleAtoms.length === 0 && (
        <div style={noticeStyle}>
          No chains shown — select at least one chain
        </div>
      )}
    </div>
  );
}

export default ProteinViewer;
