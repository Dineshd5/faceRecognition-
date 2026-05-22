/**
 * earCalculator.js
 * ================
 * Calculates the Eye Aspect Ratio (EAR) — the core math behind blink detection.
 *
 * CONCEPT: Eye Aspect Ratio (EAR)
 * --------------------------------
 * Invented by Soukupová & Čech (2016) in their paper on blink detection.
 *
 * Think of your eye like a football shape:
 *   - OPEN eye  → tall football (high ratio)
 *   - CLOSED eye → flat line   (ratio near 0)
 *
 * Formula:
 *              |p2−p6| + |p3−p5|
 *   EAR = ─────────────────────────
 *                 2 × |p1−p4|
 *
 * Where p1-p6 are 6 points around the eye:
 *
 *         p2    p3
 *    p1 ·  ·  ·  · p4
 *         p5    p6
 *
 * Threshold:
 *   EAR > 0.25 → Eye OPEN
 *   EAR < 0.20 → Eye CLOSED → BLINK!
 */

/**
 * Calculates the Euclidean distance between two 2D landmark points.
 *
 * Euclidean distance = √( (x2-x1)² + (y2-y1)² )
 * This is just the Pythagorean theorem applied to coordinates.
 *
 * @param {Object} a - {x, y} normalized landmark point
 * @param {Object} b - {x, y} normalized landmark point
 * @returns {number} distance between the two points
 */
export function euclideanDistance(a, b) {
  const dx = b.x - a.x; // horizontal difference
  const dy = b.y - a.y; // vertical difference
  return Math.sqrt(dx * dx + dy * dy); // Pythagoras!
}

/**
 * Calculates Eye Aspect Ratio for a given eye using 6 landmark points.
 *
 * MediaPipe landmark indices for each eye:
 *   LEFT EYE  → [362, 385, 387, 263, 373, 380]
 *   RIGHT EYE → [33,  160, 158, 133, 153, 144]
 *
 *   Index map: [p1, p2, p3, p4, p5, p6]
 *
 * @param {Array} eyePoints - Array of 6 {x, y, z} landmark objects
 * @returns {number} EAR value (0.0 = fully closed, ~0.3 = fully open)
 */
export function calculateEAR(eyePoints) {
  const [p1, p2, p3, p4, p5, p6] = eyePoints;

  // Vertical distances (how tall the eye is)
  const vertical1 = euclideanDistance(p2, p6); // top-left to bottom-left
  const vertical2 = euclideanDistance(p3, p5); // top-right to bottom-right

  // Horizontal distance (how wide the eye is)
  const horizontal = euclideanDistance(p1, p4);

  // EAR formula: average vertical / horizontal
  const ear = (vertical1 + vertical2) / (2.0 * horizontal);
  return ear;
}

/**
 * Extracts the 6 specific landmark points for an eye from the full 468-point array.
 *
 * Why we extract: MediaPipe gives us 468 points but we only need 6 per eye.
 * The indices below are the standard eye landmark positions in MediaPipe FaceMesh.
 *
 * @param {Array} landmarks - Full array of 468 normalized landmarks
 * @param {string} eye - 'left' or 'right'
 * @returns {Array} Array of 6 {x, y, z} points
 */
export function getEyePoints(landmarks, eye) {
  // These specific indices were defined by MediaPipe's face mesh topology.
  // You can visualize them at: https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/mesh_map.jpg
  const LEFT_EYE_INDICES  = [362, 385, 387, 263, 373, 380];
  const RIGHT_EYE_INDICES = [33,  160, 158, 133, 153, 144];

  const indices = eye === 'left' ? LEFT_EYE_INDICES : RIGHT_EYE_INDICES;

  // Map each index to the actual landmark object
  return indices.map(i => landmarks[i]);
}

/**
 * Determines if a blink occurred based on averaged EAR of both eyes.
 *
 * We average both eyes because:
 *   - Some people wink (one eye)
 *   - Averaging gives more stable readings
 *   - Reduces false positives from head tilt
 *
 * @param {Array} landmarks - Full 468 landmarks
 * @param {number} threshold - EAR below this = blink (default: 0.21)
 * @returns {{ ear: number, isBlink: boolean }}
 */
export function detectBlink(landmarks, threshold = 0.21) {
  const leftEyePoints  = getEyePoints(landmarks, 'left');
  const rightEyePoints = getEyePoints(landmarks, 'right');

  const leftEAR  = calculateEAR(leftEyePoints);
  const rightEAR = calculateEAR(rightEyePoints);

  // Average both eyes
  const avgEAR = (leftEAR + rightEAR) / 2.0;

  return {
    ear: avgEAR,
    isBlink: avgEAR < threshold, // true when eye is closed
  };
}
