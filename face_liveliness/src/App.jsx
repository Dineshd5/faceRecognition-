/**
 * App.jsx — Root Component
 * =========================
 * This is the "conductor" of the entire app.
 * It connects:
 *   - useWebcam (camera access)
 *   - useFaceMesh (AI landmark detection)
 *   - useLiveness (analysis & scoring)
 * 
 * And renders:
 *   - <video> element (camera feed)
 *   - <canvas> overlay (landmarks)
 *   - Status panel (liveness results)
 *
 * LAYOUT ARCHITECTURE:
 * ┌────────────────────────────────────────────────┐
 * │              Header                             │
 * ├──────────────────────┬─────────────────────────┤
 * │   Camera + Canvas    │   Liveness Dashboard    │
 * │   (stacked layers)   │   (checks + score)      │
 * └──────────────────────┴─────────────────────────┘
 */

import { useRef, useEffect } from 'react';
import { useWebcam }          from './hooks/useWebcam';
import { useFaceMesh }        from './hooks/useFaceMesh';
import { useLiveness }        from './hooks/useLiveness';
import { useSessionStorage }  from './hooks/useSessionStorage';
import { SessionHistory }     from './components/SessionHistory';
import './App.css';

function App() {
  // ── Canvas Ref ────────────────────────────────────────────────
  // The canvas is separate from the video — we draw landmarks on it
  const canvasRef = useRef(null);

  // ── Hook 1: Webcam ────────────────────────────────────────────
  const { videoRef, isReady: isVideoReady, error: cameraError } = useWebcam();

  // ── Hook 3: Liveness ─────────────────────────────────────────
  const { livenessData, processFrame, resetLiveness } = useLiveness();

  // ── Hook 2: FaceMesh ──────────────────────────────────────────
  const { isModelLoaded, fps } = useFaceMesh(
    videoRef, canvasRef, isVideoReady, processFrame
  );

  // ── Hook 4: Session Storage ───────────────────────────────────
  // Manages localStorage read/write for verification history
  const { sessions, saveSession, clearHistory, deleteSession } = useSessionStorage();

  // Track when the current verification session started
  // useRef because we don't want a re-render when it changes
  const sessionStartRef = useRef(Date.now());
  // Track whether we already auto-saved this session (avoid double-save)
  const savedThisSessionRef = useRef(false);

  /**
   * captureFaceSnapshot()
   * ----------------------
   * Draws the current video frame onto a temporary off-screen canvas,
   * then encodes it as a base64 JPEG string.
   *
   * WHY capture from <video> and not the landmark <canvas>?
   * → The landmark canvas only has the dot drawings (transparent bg)
   * → We want the actual face image for recognition comparison
   * → We use the video element as the image source
   *
   * WHY base64?
   * → localStorage can only store strings
   * → base64 is a text encoding of binary image data
   * → Face recognition APIs (face-api.js, AWS Rekognition) all accept base64
   * → Format: "data:image/jpeg;base64,/9j/4AAQ..." (a very long string)
   *
   * QUALITY 0.85 = 85% JPEG quality
   * → Good balance: recognizable face detail + reasonable storage size (~15-40KB)
   * → 100% quality would be ~100KB+ per frame — too large for localStorage
   *
   * @returns {string|null} base64 data URL, or null if video isn't ready
   */
  const captureFaceSnapshot = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null; // video not loaded yet

    // Create a temporary off-screen canvas to draw onto
    // This canvas never appears in the DOM — it's just for pixel manipulation
    const offscreen = document.createElement('canvas');
    offscreen.width  = video.videoWidth  || 640;
    offscreen.height = video.videoHeight || 480;

    const ctx = offscreen.getContext('2d');

    // Mirror the image to match what user sees (video is CSS-flipped)
    // Without this, the saved image would be a mirror-image
    ctx.translate(offscreen.width, 0);
    ctx.scale(-1, 1); // flip horizontally
    ctx.drawImage(video, 0, 0); // draw current video frame

    // Convert canvas pixels → base64 JPEG string
    // 'image/jpeg' is more compact than 'image/png' for photos
    return offscreen.toDataURL('image/jpeg', 0.85);
  };

  /**
   * Auto-save when liveness score first reaches 70+ (LIVE verdict).
   * Captures a face snapshot at the exact moment of verification.
   */
  useEffect(() => {
    if (livenessData.verdict === 'live' && !savedThisSessionRef.current) {
      const durationSec = (Date.now() - sessionStartRef.current) / 1000;
      // Capture the face image at the moment of successful verification
      const faceSnapshot = captureFaceSnapshot();
      saveSession(livenessData, durationSec, faceSnapshot);
      savedThisSessionRef.current = true;
    }
  }, [livenessData.verdict]);

  /**
   * exportSessionsAsJSON()
   * -----------------------
   * Downloads all stored sessions as a .json file.
   * This is the data your face recognition app can consume.
   *
   * Each session includes:
   * {
   *   id, timestamp, score, verdict, checks,
   *   blinkCount, duration,
   *   faceSnapshot: "data:image/jpeg;base64,..."  ← actual face image!
   * }
   *
   * HOW downloads work in browser (no server needed):
   * 1. Create a Blob (binary data object) from the JSON string
   * 2. Create a temporary object URL pointing to that Blob
   * 3. Create an <a> tag, set href to that URL, click it programmatically
   * 4. Revoke the URL to free memory
   */
  const exportSessionsAsJSON = () => {
    const json    = JSON.stringify(sessions, null, 2); // pretty-print with 2-space indent
    const blob    = new Blob([json], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const anchor  = document.createElement('a');
    anchor.href     = url;
    anchor.download = `liveness_data_${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url); // free the memory
  };

  // ── Verdict display helpers ───────────────────────────────────
  const getVerdictConfig = (verdict) => {
    switch (verdict) {
      case 'live':      return { label: '✅ LIVE HUMAN VERIFIED',    color: '#00ff88', glow: '#00ff8855' };
      case 'uncertain': return { label: '⚠️  CHECKING...',           color: '#ffd93d', glow: '#ffd93d55' };
      case 'checking':  return { label: '🔍 DETECTING...',           color: '#74b9ff', glow: '#74b9ff55' };
      default:          return { label: '👁️  LOOK AT CAMERA',        color: '#a0aec0', glow: 'transparent' };
    }
  };

  const verdict = getVerdictConfig(livenessData.verdict);

  // ── Direction Icon ────────────────────────────────────────────
  const directionIcon = {
    center: '⬤',
    left:   '◀',
    right:  '▶',
    up:     '▲',
    down:   '▼',
  }[livenessData.headDirection] || '⬤';

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">👁️</span>
          <span className="logo-text">LivenessAI</span>
        </div>
        <div className="header-badges">
          {/* FPS badge */}
          <span className={`badge ${fps > 20 ? 'badge-green' : 'badge-yellow'}`}>
            {fps} FPS
          </span>
          {/* Model status badge */}
          <span className={`badge ${isModelLoaded ? 'badge-green' : 'badge-blue'}`}>
            {isModelLoaded ? '🧠 Model Ready' : '⏳ Loading AI...'}
          </span>
          {/* Export button — disabled when no sessions yet */}
          <button
            className={`export-btn ${sessions.length === 0 ? 'export-btn-disabled' : ''}`}
            onClick={exportSessionsAsJSON}
            disabled={sessions.length === 0}
            title={sessions.length === 0 ? 'Complete a verification first' : `Export ${sessions.length} session(s) as JSON`}
          >
            ⬇️ Export JSON ({sessions.length})
          </button>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="app-main">

        {/* ── Camera Panel ─────────────────────────────────────── */}
        <section className="camera-panel">
          <div className="camera-label">LIVE FEED</div>

          {/* Camera container: video + canvas layered on top of each other */}
          <div className="camera-container">
            {/* The actual webcam video stream */}
            <video
              ref={videoRef}
              className="camera-video"
              width="640"
              height="480"
              muted        /* Mute to prevent feedback loop */
              playsInline  /* Required for iOS devices */
            />

            {/* 
              Canvas overlay: transparent layer for drawing landmarks.
              position: absolute → sits exactly on top of video.
              pointer-events: none → clicks pass through to video below.
            */}
            <canvas
              ref={canvasRef}
              className="landmark-canvas"
              width="640"
              height="480"
            />

            {/* Loading overlay when camera isn't ready */}
            {!isVideoReady && (
              <div className="camera-loading">
                <div className="loading-spinner" />
                <p>Requesting camera access...</p>
                <p className="hint">Make sure to click "Allow" in the browser popup</p>
              </div>
            )}

            {/* Camera error overlay */}
            {cameraError && (
              <div className="camera-error">
                <span>📵</span>
                <p>Camera Error</p>
                <small>{cameraError}</small>
              </div>
            )}

            {/* Scanning animation overlay (shown when model is active) */}
            {isModelLoaded && isVideoReady && (
              <div className="scan-overlay">
                <div className="scan-line" />
                <div className="corner top-left"  />
                <div className="corner top-right" />
                <div className="corner bot-left"  />
                <div className="corner bot-right" />
              </div>
            )}
          </div>

          {/* EAR debug value */}
          <div className="debug-bar">
            <span>EAR: <strong>{livenessData.earValue}</strong></span>
            <span>Smile Ratio: <strong>{livenessData.smileRatio}</strong></span>
            <span>Head: <strong>{directionIcon} {livenessData.headDirection}</strong></span>
          </div>
        </section>

        {/* ── Liveness Dashboard ───────────────────────────────── */}
        <aside className="dashboard">

          {/* Verdict Card */}
          <div className="verdict-card" style={{ '--glow': verdict.glow }}>
            <p className="verdict-label" style={{ color: verdict.color }}>
              {verdict.label}
            </p>

            {/* Score meter */}
            <div className="score-container">
              <div className="score-label">Liveness Score</div>
              <div className="score-bar-bg">
                <div
                  className="score-bar-fill"
                  style={{
                    width: `${livenessData.score}%`,
                    background: livenessData.score >= 70
                      ? 'linear-gradient(90deg, #00b894, #00ff88)'
                      : livenessData.score >= 40
                      ? 'linear-gradient(90deg, #fdcb6e, #ffd93d)'
                      : 'linear-gradient(90deg, #74b9ff, #6c5ce7)',
                  }}
                />
              </div>
              <div className="score-number">{livenessData.score}<span>/100</span></div>
            </div>
          </div>

          {/* Checks Panel */}
          <div className="checks-panel">
            <h3 className="checks-title">Detection Checks</h3>

            <CheckItem
              done={livenessData.checks.blinked}
              icon="👁️"
              label="Blink Detected"
              detail={`${livenessData.blinkCount} blink${livenessData.blinkCount !== 1 ? 's' : ''} counted`}
              points={30}
            />

            <CheckItem
              done={livenessData.checks.movedHead}
              icon="↔️"
              label="Head Turned L/R"
              detail="Look left or right"
              points={25}
            />

            <CheckItem
              done={livenessData.checks.movedVertical}
              icon="↕️"
              label="Head Moved Up/Down"
              detail="Nod your head"
              points={20}
            />

            <CheckItem
              done={livenessData.checks.smiled}
              icon="😊"
              label="Smile Detected"
              detail={livenessData.isSmiling ? 'Smiling now! 😄' : 'Please smile'}
              points={25}
            />
          </div>

          {/* Instructions Panel */}
          <div className="instructions-panel">
            <h3>📋 Instructions</h3>
            <ol>
              <li className={livenessData.checks.blinked ? 'done' : ''}>
                Blink your eyes naturally
              </li>
              <li className={livenessData.checks.movedHead ? 'done' : ''}>
                Turn your head left or right
              </li>
              <li className={livenessData.checks.movedVertical ? 'done' : ''}>
                Nod your head up or down
              </li>
              <li className={livenessData.checks.smiled ? 'done' : ''}>
                Smile at the camera 😊
              </li>
            </ol>
          </div>

          {/* Reset button — also saves partial session before resetting */}
          <button
            className="reset-btn"
            onClick={() => {
              // Save whatever was detected so far (even if incomplete)
              if (!savedThisSessionRef.current && livenessData.score > 0) {
                const durationSec = (Date.now() - sessionStartRef.current) / 1000;
                const faceSnapshot = captureFaceSnapshot(); // capture face on manual reset too
                saveSession(livenessData, durationSec, faceSnapshot);
              }
              resetLiveness();
              sessionStartRef.current    = Date.now();
              savedThisSessionRef.current = false;
            }}
          >
            🔄 Restart Verification
          </button>

          {/* Educational callout */}
          <div className="info-card">
            <strong>💡 Did you know?</strong>
            <p>
              A printed photo cannot blink, turn, or smile naturally.
              This is how banking apps catch spoofing attempts!
            </p>
          </div>

          {/* ── Session History ────────────────────────────────── */}
          {/*
            DATA FLOW:
            localStorage → useSessionStorage.sessions
                        → passed as props here
                        → rendered by SessionHistory
          */}
          <SessionHistory
            sessions={sessions}
            onClear={clearHistory}
            onDelete={deleteSession}
            onExport={exportSessionsAsJSON}
          />
        </aside>
      </main>
    </div>
  );
}

/**
 * CheckItem — A single liveness check row
 * @param {boolean} done - Whether this check passed
 * @param {string}  icon - Emoji icon
 * @param {string}  label - Check name
 * @param {string}  detail - Hint text
 * @param {number}  points - Points awarded
 */
function CheckItem({ done, icon, label, detail, points }) {
  return (
    <div className={`check-item ${done ? 'check-done' : ''}`}>
      <div className="check-icon">{done ? '✅' : icon}</div>
      <div className="check-info">
        <div className="check-label">{label}</div>
        <div className="check-detail">{detail}</div>
      </div>
      <div className="check-points">+{points}pts</div>
    </div>
  );
}

export default App;
