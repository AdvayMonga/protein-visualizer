/**
 * Atom Picking Helpers
 * ====================
 *
 * Pure geometry and event helpers behind click-to-identify. They are kept
 * separate from the viewer so they can be tested without a WebGL context,
 * which jsdom does not provide.
 */

import * as THREE from 'three';

/**
 * How far the pointer may move between press and release and still count as a
 * click rather than a camera drag, in CSS pixels.
 *
 * Orbit controls rotate on the same button used to select, so without this
 * every rotation would end by selecting whatever happened to be under the
 * cursor. A few pixels of tolerance absorbs the hand movement in a real click.
 */
export const DRAG_THRESHOLD_PX = 5;

/**
 * Decides whether a press/release pair was a click or the end of a drag.
 *
 * @param {{x: number, y: number}} down - Pointer position at press
 * @param {{x: number, y: number}} up - Pointer position at release
 * @param {number} threshold - Maximum movement still considered a click
 * @returns {boolean} - True when the pointer barely moved
 */
export function isClickNotDrag(down, up, threshold = DRAG_THRESHOLD_PX) {
  return Math.hypot(up.x - down.x, up.y - down.y) <= threshold;
}

/**
 * Converts a pointer position into normalized device coordinates.
 *
 * The raycaster works in a space where the canvas spans -1 to +1 on both axes,
 * with +Y upward - the opposite of the browser's downward Y - hence the flip.
 *
 * @param {number} clientX - Pointer X in viewport coordinates
 * @param {number} clientY - Pointer Y in viewport coordinates
 * @param {DOMRect} rect - Bounding rectangle of the canvas
 * @returns {THREE.Vector2} - Position in normalized device coordinates
 */
export function toNormalizedDeviceCoords(clientX, clientY, rect) {
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
}

/**
 * Picks the atom under the pointer, if the pointer is actually over one.
 *
 * Intersections arrive sorted near to far, and only the nearest one is
 * considered. Walking past a non-atom hit to find an atom behind it looks
 * helpful but is wrong: the backbone tube threads through the sphere centres,
 * so between residues the tube is the only thing in front, and skipping it
 * would select whatever sphere the ray met next - routinely an occluded residue
 * on the far side of the structure. Clicking the trace therefore selects
 * nothing, which is what the user sees.
 *
 * Where the tube crosses in front of a sphere the sphere is still nearer, since
 * it is drawn at a larger radius around the same centre line.
 *
 * @param {Array<Object>} intersections - Result of Raycaster.intersectObjects()
 * @returns {Object|null} - The atom record, or null if nothing was hit
 */
export function firstAtomHit(intersections) {
  const nearest = intersections[0];
  return nearest?.object?.userData?.atomInfo ?? null;
}

/**
 * Builds the identifying label for an atom, in the notation used throughout
 * structural biology: residue name, sequence number, then chain.
 *
 * @param {Object} atom - An atom record from the parser
 * @returns {string} - e.g. "THR 17 A"
 */
export function formatAtomLabel(atom) {
  if (!atom) return '';
  // Insertion codes are part of the residue's identity where present, so a bare
  // sequence number is not unique - antibody numbering relies on this
  const insertion = atom.iCode ? atom.iCode : '';
  return `${atom.residue} ${atom.residueNum}${insertion} ${atom.chain}`;
}
