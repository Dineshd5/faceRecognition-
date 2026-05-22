/**
 * smileDetector.js
 * ================
 * Detects whether the user is smiling using mouth landmark geometry.
 *
 * CONCEPT: Why mouth width/face width ratio works
 * ------------------------------------------------
 * A smile physically does two things:
 *   1. Pulls mouth corners (lip commissures) outward → wider mouth
 *   2. Raises the cheeks
 *
 * If we measure mouth width in pixels, it changes based on face distance.
 * (A far-away face has a narrower mouth in pixels even though the person smiles.)
 *
 * Solution: Normalize mouth width against face width → ratio stays consistent
 * regardless of how close or far the face is from camera.
 *
 * Smile Ratio = mouthWidth / faceWidth
 *   > 0.45 → Smiling
 *   < 0.38 → Neutral
 *
 * Key landmarks used:
 *   Left mouth corner:  61
 *   Right mouth corner: 291
 *   Left jaw:           234
 *   Right jaw:          454
 *   Top lip center:     13
 *   Bottom lip center:  14
 */

import { euclideanDistance } from './earCalculator';

// Smile detection thresholds — tune these based on testing
const SMILE_RATIO_THRESHOLD = 0.44; // ratio above this = smile

/**
 * Calculates the smile ratio: mouth width / face width.
 *
 * @param {Array} landmarks - Full 468 normalized landmarks
 * @returns {{ ratio: number, isSmiling: boolean, mouthOpenRatio: number }}
 */
export function detectSmile(landmarks) {
  // Mouth corner landmarks
  const leftCorner  = landmarks[61];  // left commissure
  const rightCorner = landmarks[291]; // right commissure

  // Jaw width landmarks (reference for normalization)
  const leftJaw  = landmarks[234];
  const rightJaw = landmarks[454];

  // Lip height landmarks (to detect open vs closed mouth)
  const topLip    = landmarks[13];  // center of upper lip
  const bottomLip = landmarks[14];  // center of lower lip

  // Calculate distances
  const mouthWidth = euclideanDistance(leftCorner, rightCorner);
  const faceWidth  = euclideanDistance(leftJaw, rightJaw);

  // Calculate how open the mouth is (for open-mouth smile detection)
  const mouthHeight  = euclideanDistance(topLip, bottomLip);
  const mouthOpenRatio = mouthHeight / faceWidth;

  // Normalize: ratio independent of face size or camera distance
  const ratio = mouthWidth / faceWidth;

  return {
    ratio,                               // raw smile ratio
    isSmiling: ratio > SMILE_RATIO_THRESHOLD, // boolean result
    mouthOpenRatio,                      // useful for detecting open-mouthed smiles
  };
}

/**
 * Advanced: Detects corner lift — how much mouth corners are raised.
 * A genuine (Duchenne) smile also lifts the cheeks.
 *
 * We compare mouth corner Y positions to the nose-to-chin axis.
 *
 * @param {Array} landmarks
 * @returns {number} Corner lift factor (higher = more lifted = more smile)
 */
export function getMouthCornerLift(landmarks) {
  const leftCorner  = landmarks[61];
  const rightCorner = landmarks[291];
  const noseTip     = landmarks[1];

  // Average Y of mouth corners
  const avgCornerY = (leftCorner.y + rightCorner.y) / 2;

  // When smiling, corners move UP (lower y value in MediaPipe coords)
  // Compare to nose tip as reference
  const lift = noseTip.y - avgCornerY; // positive = corners are above nose level

  return lift;
}
