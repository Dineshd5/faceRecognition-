/**
 * headPose.js
 * ===========
 * Detects head movement direction by tracking the nose tip landmark.
 *
 * CONCEPT: Head Movement Detection
 * ---------------------------------
 * Imagine the nose tip (landmark #1) as a GPS dot on your face.
 * When you turn your head:
 *   - Left:  the nose moves to the LEFT on screen  (x increases)
 *   - Right: the nose moves to the RIGHT on screen (x decreases)
 *   - Up:    the nose moves UP on screen           (y decreases)
 *   - Down:  the nose moves DOWN on screen         (y increases)
 *
 * Coordinate system (MediaPipe normalized):
 *   x: 0.0 = left edge of frame, 1.0 = right edge
 *   y: 0.0 = top of frame,       1.0 = bottom
 *
 * Strategy:
 *   1. Capture "baseline" nose position when face is first detected (center)
 *   2. Each frame, compare current position to baseline
 *   3. If delta exceeds threshold → declare a direction
 */

// Threshold for detecting head movement (in normalized coordinates)
// 0.05 = 5% of frame width/height — tune this for sensitivity
const MOVEMENT_THRESHOLD = 0.05;

// Nose tip landmark index in MediaPipe FaceMesh
// Landmark #1 is the very tip of the nose — most stable center point
const NOSE_TIP_INDEX = 1;

// Chin (used to also measure head tilt axis)
const CHIN_INDEX = 152;

// Forehead (top of face)
const FOREHEAD_INDEX = 10;

/**
 * Gets the normalized {x, y} position of the nose tip.
 *
 * @param {Array} landmarks - Full 468 normalized landmarks
 * @returns {{ x: number, y: number }}
 */
export function getNosePosition(landmarks) {
  const nose = landmarks[NOSE_TIP_INDEX];
  return { x: nose.x, y: nose.y };
}

/**
 * Detects the head movement direction based on current vs. baseline nose position.
 *
 * @param {Array} landmarks - Current 468 landmarks
 * @param {{ x: number, y: number }} baseline - Nose position when face was first detected
 * @returns {{ direction: string, deltaX: number, deltaY: number }}
 *   direction: 'center' | 'left' | 'right' | 'up' | 'down'
 */
export function detectHeadMovement(landmarks, baseline) {
  const current = getNosePosition(landmarks);

  // How much has the nose moved from the baseline?
  const deltaX = current.x - baseline.x; // + = moved right on screen, - = moved left
  const deltaY = current.y - baseline.y; // + = moved down, - = moved up

  // Note on X direction intuition:
  // When you look LEFT, your nose moves toward the LEFT of the screen,
  // which means SMALLER x value, so deltaX is NEGATIVE.
  // This might feel counterintuitive — the nose moves opposite to your gaze direction.

  let direction = 'center';

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    // Horizontal movement dominates
    if (deltaX < -MOVEMENT_THRESHOLD) direction = 'left';  // nose moved left → looking left
    if (deltaX > MOVEMENT_THRESHOLD)  direction = 'right'; // nose moved right → looking right
  } else {
    // Vertical movement dominates
    if (deltaY < -MOVEMENT_THRESHOLD) direction = 'up';    // nose moved up → looking up
    if (deltaY > MOVEMENT_THRESHOLD)  direction = 'down';  // nose moved down → looking down
  }

  return { direction, deltaX, deltaY };
}

/**
 * Calculates a simple head tilt angle using the eye corners.
 * This is used to detect if the head is tilted sideways (roll).
 *
 * Uses: Math.atan2(dy, dx) → gives angle in radians, convert to degrees
 *
 * @param {Array} landmarks - Full 468 landmarks
 * @returns {number} Tilt angle in degrees (-180 to 180)
 */
export function getHeadTilt(landmarks) {
  // Left eye outer corner: landmark 33
  // Right eye outer corner: landmark 263
  const leftEye  = landmarks[33];
  const rightEye = landmarks[263];

  const dy = rightEye.y - leftEye.y;
  const dx = rightEye.x - leftEye.x;

  // atan2 returns angle in radians from -π to π
  // Convert to degrees
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = angleRad * (180 / Math.PI);

  return angleDeg;
  // 0°  → level head
  // +15° → tilted right
  // -15° → tilted left
}
