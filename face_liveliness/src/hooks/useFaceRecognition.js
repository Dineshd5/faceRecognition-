/**
 * useFaceRecognition.js — Custom React Hook
 * ==========================================
 * Connects the liveness app to the Python face recognition backend.
 *
 * FLOW:
 *   1. Liveness app verifies a live human (score ≥ 70, verdict = 'live')
 *   2. App captures a faceSnapshot (base64 JPEG from webcam)
 *   3. This hook sends that snapshot to /api/liveness-verify
 *   4. Flask backend decodes it, runs DeepFace, returns a match
 *   5. We surface the result back to the UI
 *
 * WHY a separate hook?
 * → Single Responsibility Principle: liveness logic stays in useLiveness.js,
 *   network/API logic lives here. Easier to test and swap backends.
 */

import { useState, useCallback } from 'react';

// Python Flask server URL — change to your deployed URL in production
const FACE_APP_BASE_URL = 'http://localhost:5000';

/**
 * @typedef {Object} RecognitionResult
 * @property {boolean}  matched       - Did we find a match in the DB?
 * @property {string}   [profile]     - Matched profile filename (e.g. "Surya.jpg")
 * @property {number}   [distance]    - Cosine distance (lower = better match)
 * @property {string}   [message]     - Human-readable status message
 * @property {number}   liveness_score - The score that unlocked recognition
 */

export function useFaceRecognition() {
  const [status, setStatus]   = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [result, setResult]   = useState(null);   // RecognitionResult or null
  const [error,  setError]    = useState(null);   // Error message string

  /**
   * verifyFace()
   * ------------
   * Send a verified live face snapshot to the Flask backend for recognition.
   * Only works when the liveness app has confirmed verdict = 'live'.
   *
   * @param {string} faceSnapshot   - base64 data URL from canvas.toDataURL()
   * @param {Object} livenessData   - full livenessData object from useLiveness
   */
  const verifyFace = useCallback(async (faceSnapshot, livenessData) => {
    if (!faceSnapshot) {
      setError('No face snapshot available');
      return;
    }

    if (livenessData.verdict !== 'live' || livenessData.score < 70) {
      setError('Liveness not verified yet');
      return;
    }

    setStatus('loading');
    setResult(null);
    setError(null);

    try {
      const response = await fetch(`${FACE_APP_BASE_URL}/api/liveness-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64:  faceSnapshot,
          liveness_score: livenessData.score,
          verdict:        livenessData.verdict,
          checks:         livenessData.checks,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || `Server error ${response.status}`);
      }

      setResult(json);
      setStatus('success');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, []);

  /**
   * enrollFace()
   * ------------
   * Register a new person into the face DB using a verified live snapshot.
   * The backend uses DeepFace to extract and store the face embedding.
   *
   * @param {string} faceSnapshot   - base64 data URL from canvas.toDataURL()
   * @param {Object} livenessData   - full livenessData object from useLiveness
   * @param {string} name           - Name for the new profile (e.g. "Dinesh")
   */
  const enrollFace = useCallback(async (faceSnapshot, livenessData, name) => {
    if (!faceSnapshot || !name.trim()) {
      setError('Snapshot and name are required');
      return;
    }

    if (livenessData.verdict !== 'live' || livenessData.score < 70) {
      setError('Liveness not verified — cannot enroll');
      return;
    }

    setStatus('loading');
    setResult(null);
    setError(null);

    try {
      const response = await fetch(`${FACE_APP_BASE_URL}/api/liveness-enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64:  faceSnapshot,
          name:           name.trim(),
          liveness_score: livenessData.score,
          verdict:        livenessData.verdict,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || `Server error ${response.status}`);
      }

      setResult({ ...json, enrolled: true });
      setStatus('success');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, []);

  /** Reset state back to idle (e.g. when user restarts liveness) */
  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  return {
    status,      // 'idle' | 'loading' | 'success' | 'error'
    result,      // RecognitionResult object
    error,       // Error message if status === 'error'
    verifyFace,  // Call after liveness is confirmed
    enrollFace,  // Call to register a new person
    reset,       // Reset to idle
  };
}
