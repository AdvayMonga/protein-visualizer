/**
 * 3D viewport for the protein, built on react-three-fiber.
 *
 * Sets up the canvas, camera, lighting, and OrbitControls, and hosts the Protein
 * component that builds the actual Three.js geometry.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { createBackboneLine, createAtomSpheres, getMaxDimension, getBoundingRadius } from '../utils/proteinGeometry';

/**
 * Builds the protein geometry into a THREE.Group.
 *
 * The geometry helpers return raw Three.js objects rather than R3F elements, so the
 * group is populated imperatively in an effect and rebuilt whenever the inputs change.
 */
function Protein({ backboneAtoms, showBackbone, showAtoms, colorScheme }) {
  const groupRef = useRef();

  useEffect(() => {
    if (!backboneAtoms || backboneAtoms.length === 0) return;
    if (!groupRef.current) return;

    // Drop the previous structure and free its GPU resources before rebuilding.
    while (groupRef.current.children.length > 0) {
      const child = groupRef.current.children[0];
      groupRef.current.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    if (showBackbone) {
      const backboneLine = createBackboneLine(backboneAtoms);
      groupRef.current.add(backboneLine);
    }

    if (showAtoms) {
      const spheres = createAtomSpheres(backboneAtoms, colorScheme);
      spheres.forEach(sphere => groupRef.current.add(sphere));
    }

    console.log(`Rendered protein: ${backboneAtoms.length} residues, showBackbone=${showBackbone}, showAtoms=${showAtoms}, colorScheme=${colorScheme}`);

    return () => {
      if (groupRef.current) {
        groupRef.current.children.forEach(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }
    };
  }, [backboneAtoms, showBackbone, showAtoms, colorScheme]);

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

function ProteinViewer({ backboneAtoms, showBackbone = true, showAtoms = true, colorScheme = 'residue' }) {
  // Pull the camera back proportionally to the protein so it fits the frame at any size.
  const cameraDistance = useMemo(() => {
    if (!backboneAtoms || backboneAtoms.length === 0) return 50;
    const maxDim = getMaxDimension(backboneAtoms);
    return Math.max(30, maxDim * 2);
  }, [backboneAtoms]);

  const boundingRadius = useMemo(() => {
    if (!backboneAtoms || backboneAtoms.length === 0) return 25;
    return getBoundingRadius(backboneAtoms);
  }, [backboneAtoms]);

  const containerStyle = {
    width: '100%',
    height: '600px',
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    overflow: 'hidden',
  };

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

        {backboneAtoms && backboneAtoms.length > 0 && (
          <Protein 
            backboneAtoms={backboneAtoms}
            showBackbone={showBackbone}
            showAtoms={showAtoms}
            colorScheme={colorScheme}
          />
        )}

        {/* Left-drag rotates, right-drag pans, scroll zooms. */}
        <OrbitControls 
          enableDamping={true}
          dampingFactor={0.05}
          minDistance={5}
          maxDistance={500}
        />
      </Canvas>
    </div>
  );
}

export default ProteinViewer;
