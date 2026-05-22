/**
 * useSessionStorage.js — Custom React Hook
 * ==========================================
 * Saves completed liveness verification results to localStorage.
 *
 * CONCEPT: localStorage vs sessionStorage vs cookies
 * ---------------------------------------------------
 *  Storage type   | Survives page refresh | Survives browser close | Size limit
 *  ─────────────────────────────────────────────────────────────────────────────
 *  React state    |         ❌            |           ❌           | RAM only
 *  sessionStorage |         ✅            |           ❌           | ~5MB
 *  localStorage   |         ✅            |           ✅           | ~10MB
 *  IndexedDB      |         ✅            |           ✅           | 50MB+
 *  Cookie         |         ✅            |  Depends on expiry     | ~4KB
 *
 * WHY localStorage for this project?
 * - Verification results are small (< 1KB per record)
 * - We want history to survive browser restarts
 * - No backend setup required for learning Phase 1
 *
 * CONCEPT: localStorage only stores STRINGS
 * ------------------------------------------
 * localStorage.setItem('key', value)
 * value MUST be a string. Objects must be converted:
 *   JSON.stringify(obj)  → converts object to JSON string
 *   JSON.parse(str)      → converts JSON string back to object
 *
 * localStorage is like a key-value dictionary:
 *   { "liveness_sessions": "[{...}, {...}]" }
 *
 * DATA SHAPE we store:
 * {
 *   id:        "abc123",          // unique ID per session
 *   timestamp: "2024-01-15T...",  // ISO date string
 *   score:     85,                // 0-100 liveness score
 *   verdict:   "live",            // 'live' | 'uncertain' | 'waiting'
 *   checks: {
 *     blinked:       true,
 *     movedHead:     true,
 *     movedVertical: false,
 *     smiled:        true,
 *   },
 *   blinkCount:    3,
 *   duration:      12,            // seconds taken to verify
 * }
 */

import { useState, useCallback, useEffect } from 'react';

// The key we use in localStorage to store all sessions
const STORAGE_KEY = 'liveness_sessions';

// Maximum number of sessions to keep (oldest get removed)
const MAX_SESSIONS = 50;

/**
 * Generates a simple unique ID for each session.
 * In production you'd use uuid or crypto.randomUUID()
 *
 * @returns {string} e.g. "ls_1705312456789_x7k2"
 */
function generateId() {
  return `ls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Reads all stored sessions from localStorage.
 * Returns empty array if nothing stored yet.
 *
 * @returns {Array} Array of session objects
 */
function readFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // If nothing stored yet, raw === null → return empty array
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    // JSON.parse throws if data is corrupted
    // This is a real-world edge case — always handle it!
    console.warn('localStorage read error:', err);
    return [];
  }
}

/**
 * Writes sessions array to localStorage.
 *
 * @param {Array} sessions
 */
function writeToStorage(sessions) {
  try {
    // Keep only the most recent MAX_SESSIONS entries
    // .slice(-MAX_SESSIONS) takes the LAST N items from the array
    const trimmed = sessions.slice(-MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    // localStorage can throw if storage quota is exceeded
    // (rare, but happens on private/incognito mode sometimes)
    console.error('localStorage write error:', err);
  }
}

/**
 * useSessionStorage hook
 * Manages liveness verification history in localStorage.
 *
 * @returns {{ sessions, saveSession, clearHistory, sessionCount }}
 */
export function useSessionStorage() {
  // Initialize state from localStorage (runs once on mount)
  const [sessions, setSessions] = useState(() => readFromStorage());

  /**
   * Saves a completed liveness verification session.
   *
   * Call this when the user hits score ≥ 70 (verified) OR
   * when they manually reset (to save partial session).
   *
   * @param {Object} livenessData - The full livenessData object from useLiveness
   * @param {number} durationSec - How many seconds the session took
   * @returns {Object} The saved session object
   */
  const saveSession = useCallback((livenessData, durationSec = 0, faceSnapshot = null) => {
    const newSession = {
      id:        generateId(),
      timestamp: new Date().toISOString(), // ISO 8601 format — universal, sortable
      score:     livenessData.score,
      verdict:   livenessData.verdict,
      checks:    { ...livenessData.checks }, // spread to avoid reference sharing
      blinkCount:  livenessData.blinkCount,
      earValue:    livenessData.earValue,
      smileRatio:  livenessData.smileRatio,
      duration:    Math.round(durationSec),

      // ── Face Recognition Data ─────────────────────────────────
      // faceSnapshot: base64 JPEG of the user's face at verification time.
      // This is the "actual data" your face recognition system can compare.
      //
      // How to use it in a face recognition app:
      //   1. Direct comparison: feed to face-api.js or AWS Rekognition
      //   2. Enrollment: store as the "reference face" for a user
      //   3. Verification: compare against a stored reference face
      //
      // Format: "data:image/jpeg;base64,/9j/4AAQSkZJRgAB..." (very long string)
      // Convert to a file: fetch(faceSnapshot).then(r => r.blob()) → File object
      faceSnapshot: faceSnapshot, // null if camera wasn't ready
    };

    setSessions(prev => {
      const updated = [...prev, newSession]; // append new session to array
      writeToStorage(updated);               // persist to localStorage
      return updated;                        // update React state
    });

    return newSession;
  }, []);

  /**
   * Clears all stored sessions from localStorage and state.
   */
  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSessions([]);
  }, []);

  /**
   * Deletes a single session by ID.
   * @param {string} id - Session ID to remove
   */
  const deleteSession = useCallback((id) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      writeToStorage(updated);
      return updated;
    });
  }, []);

  return {
    sessions,       // Array of all stored sessions (for UI rendering)
    saveSession,    // Call with livenessData to save
    clearHistory,   // Wipe all history
    deleteSession,  // Remove one session by ID
    sessionCount: sessions.length,
  };
}
