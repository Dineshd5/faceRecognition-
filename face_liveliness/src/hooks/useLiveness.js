/**
 * useLiveness.js — Custom React Hook
 * =====================================
 * The "brain" of the liveness detection system.
 * Combines blink, head movement, and smile detection into a unified score.
 *
 * CONCEPT: Challenge-Response Liveness
 * --------------------------------------
 * Real banking apps use a technique called "active liveness":
 *   1. Give the user a CHALLENGE: "Blink twice", "Turn left", "Smile"
 *   2. Verify the RESPONSE matches the challenge
 *   3. If matched → live person; if not → spoofing attempt
 *
 * Our simplified version auto-detects all challenges simultaneously
 * and accumulates a "liveness score" from 0 to 100.
 *
 * Liveness Score System:
 *   Blink detected      → +40 points (strongest signal)
 *   Head turned L/R     → +30 points
 *   Head moved Up/Down  → +30 points
 *
 * Verdict:
 *   ≥ 70 → ✅ LIVE
 *   40-69 → ⚠️ UNCERTAIN
 *   < 40  → ❌ POSSIBLE SPOOF
 *
 * CONCEPT: Why useRef for counters inside animation loops?
 * ---------------------------------------------------------
 * The animation loop runs at 30fps. If we used useState for blink counter,
 * React would re-render the component 30 times per second just for that.
 * useRef lets us mutate values without triggering re-renders.
 * We only use setState for values that need to update the UI.
 */

import { useRef, useState, useCallback } from 'react';
import { detectBlink }         from '../utils/earCalculator';
import { detectHeadMovement, getNosePosition } from '../utils/headPose';

// EAR threshold: below this value = eye is closed
const BLINK_EAR_THRESHOLD = 0.21;

// Minimum consecutive CLOSED frames to count as a real blink (not noise)
const MIN_BLINK_FRAMES = 2;

// Maximum closed frames (to avoid counting slow eye closures as multiple blinks)
const MAX_BLINK_FRAMES = 10;

// Liveness score thresholds
const SCORE_LIVE    = 70;
const SCORE_UNCERTAIN = 40;

export function useLiveness() {
  // ── UI State (triggers re-renders) ────────────────────────────
  const [livenessData, setLivenessData] = useState({
    score:           0,
    verdict:         'waiting',   // 'waiting' | 'uncertain' | 'live' | 'spoof'
    blinkCount:      0,
    headDirection:   'center',
    isSmiling:       false,
    earValue:        0,
    smileRatio:      0,
    checks: {
      blinked:       false,
      movedHead:     false,
      movedVertical: false,
    },
  });

  // ── Internal Refs (mutation without re-renders) ───────────────
  // These are mutated inside the 30fps processing loop

  // Blink tracking
  const blinkCountRef       = useRef(0);  // total blinks detected
  const closedFramesRef     = useRef(0);  // consecutive frames with eye closed
  const wasClosedRef        = useRef(false); // was eye closed in previous frame?

  // Nose baseline (captured once, used for all head movement comparisons)
  const noseBaselineRef     = useRef(null);

  // Liveness checks completed (accumulate across frames)
  const checksRef = useRef({
    blinked:       false,
    movedHead:     false,
    movedVertical: false,
  });

  // Throttle: update UI at most every N frames (prevents excessive re-renders)
  const frameCounterRef = useRef(0);
  const UI_UPDATE_EVERY = 3; // update UI every 3 frames (~10fps UI, 30fps detection)

  /**
   * processFrame — called every frame by useFaceMesh
   * This is the main per-frame analysis function.
   *
   * @param {Array|null} landmarks - 468 landmarks or null if no face
   */
  const processFrame = useCallback((landmarks) => {
    // No face detected → reset or keep waiting
    if (!landmarks) {
      frameCounterRef.current++;
      return;
    }

    // ── Step 1: Set Nose Baseline ──────────────────────────────────
    // Capture nose position the first time we see a face
    // This becomes our "center" reference for head movement
    if (!noseBaselineRef.current) {
      noseBaselineRef.current = getNosePosition(landmarks);
    }

    // ── Step 2: Blink Detection ────────────────────────────────────
    const { ear, isBlink } = detectBlink(landmarks, BLINK_EAR_THRESHOLD);

    if (isBlink) {
      closedFramesRef.current++; // eye is closed this frame

      if (
        !wasClosedRef.current &&            // eye was OPEN last frame (start of blink)
        closedFramesRef.current >= MIN_BLINK_FRAMES && // closed for enough frames
        closedFramesRef.current <= MAX_BLINK_FRAMES    // not too long (squinting)
      ) {
        blinkCountRef.current++;       // count a new blink!
        checksRef.current.blinked = true; // mark check as done
        wasClosedRef.current = true;   // remember eye is now closed
      }
    } else {
      // Eye is open
      if (wasClosedRef.current) {
        // Eye just opened → blink cycle complete
        wasClosedRef.current = false;
      }
      closedFramesRef.current = 0; // reset closed frame counter
    }

    // ── Step 3: Head Movement Detection ───────────────────────────
    const { direction, deltaX, deltaY } = detectHeadMovement(
      landmarks,
      noseBaselineRef.current
    );

    // Mark horizontal head movement check
    if (direction === 'left' || direction === 'right') {
      checksRef.current.movedHead = true;
    }

    // Mark vertical head movement check
    if (direction === 'up' || direction === 'down') {
      checksRef.current.movedVertical = true;
    }

    // ── Step 5: Calculate Liveness Score ──────────────────────────
    let score = 0;
    if (checksRef.current.blinked)       score += 40;
    if (checksRef.current.movedHead)     score += 30;
    if (checksRef.current.movedVertical) score += 30;

    // Determine verdict
    let verdict = 'waiting';
    if (score >= SCORE_LIVE)      verdict = 'live';
    else if (score >= SCORE_UNCERTAIN) verdict = 'uncertain';
    else if (blinkCountRef.current > 0) verdict = 'checking';

    // ── Step 6: Throttled UI Update ───────────────────────────────
    frameCounterRef.current++;
    if (frameCounterRef.current % UI_UPDATE_EVERY === 0) {
      // Only update React state every 3 frames
      // This prevents 30 re-renders/second while keeping UI responsive
      setLivenessData({
        score,
        verdict,
        blinkCount:    blinkCountRef.current,
        headDirection: direction,
        earValue:      Math.round(ear * 1000) / 1000, // round to 3 decimal places
        checks:        { ...checksRef.current }, // spread to create new object (React detects change)
      });
    }
  }, []);

  /**
   * Resets all liveness state.
   * Call this to start a fresh verification session.
   */
  const resetLiveness = useCallback(() => {
    // Reset all refs
    blinkCountRef.current    = 0;
    closedFramesRef.current  = 0;
    wasClosedRef.current     = false;
    noseBaselineRef.current  = null;
    frameCounterRef.current  = 0;
    checksRef.current        = {
      blinked: false, movedHead: false, movedVertical: false
    };

    // Reset UI state
    setLivenessData({
      score: 0, verdict: 'waiting', blinkCount: 0,
      headDirection: 'center',
      earValue: 0,
      checks: { blinked: false, movedHead: false, movedVertical: false },
    });
  }, []);

  return {
    livenessData,  // current liveness state for the UI
    processFrame,  // call this every frame with landmarks
    resetLiveness, // call to restart verification
  };
}
