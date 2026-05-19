/**
 * SessionHistory.jsx
 * ===================
 * Displays past liveness sessions with face thumbnails.
 * Each row now shows the actual captured face image from verification.
 *
 * DATA SHAPE of each session:
 * {
 *   id:           "ls_1705312456789_x7k2"
 *   timestamp:    "2024-01-15T10:30:00.000Z"
 *   score:        85
 *   verdict:      "live"
 *   checks:       { blinked, movedHead, movedVertical, smiled }
 *   blinkCount:   3
 *   duration:     12
 *   faceSnapshot: "data:image/jpeg;base64,..."  ← ACTUAL FACE IMAGE
 * }
 */

import './SessionHistory.css';

function formatTime(isoString) {
  return new Date(isoString).toLocaleString('en-IN', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function getVerdictStyle(verdict) {
  switch (verdict) {
    case 'live':      return { color: '#00ff88', icon: '✅', label: 'LIVE' };
    case 'uncertain': return { color: '#ffd93d', icon: '⚠️',  label: 'UNCERTAIN' };
    default:          return { color: '#8b949e', icon: '❓', label: 'INCOMPLETE' };
  }
}

export function SessionHistory({ sessions, onClear, onDelete, onExport }) {
  if (sessions.length === 0) {
    return (
      <div className="history-panel">
        <div className="history-header">
          <h3>📂 Verification History</h3>
        </div>
        <div className="history-empty">
          <span>🗂️</span>
          <p>No sessions saved yet.</p>
          <small>Complete a verification — face snapshot saves automatically.</small>
        </div>
      </div>
    );
  }

  const sorted = [...sessions].reverse();

  return (
    <div className="history-panel">
      <div className="history-header">
        <h3>📂 History <span className="count-badge">{sessions.length}</span></h3>
        <div className="history-actions">
          {/* Export all sessions as JSON — the data your face recognition app consumes */}
          <button className="export-inline-btn" onClick={onExport} title="Download as JSON for face recognition">
            ⬇️ JSON
          </button>
          <button className="clear-btn" onClick={onClear} title="Clear all history">
            🗑️ Clear
          </button>
        </div>
      </div>

      <div className="history-list">
        {sorted.map(session => {
          const vs = getVerdictStyle(session.verdict);
          const checksCount = Object.values(session.checks).filter(Boolean).length;

          return (
            <div key={session.id} className="history-item">

              {/* ── Face Thumbnail ──────────────────────────────── */}
              {/*
                This is the actual face image captured at verification.
                faceSnapshot is a base64 JPEG — you can pass this directly to:
                  - face-api.js: faceapi.detectSingleFace(img)
                  - AWS Rekognition: Bytes: Buffer.from(base64, 'base64')
                  - Azure Face API: request body with base64 string
              */}
              <div className="item-thumbnail">
                {session.faceSnapshot ? (
                  <img
                    src={session.faceSnapshot}
                    alt="Verified face"
                    className="face-thumb"
                    title="Face captured at verification"
                  />
                ) : (
                  <div className="face-thumb-placeholder">👤</div>
                )}
                {/* Verdict badge overlaid on thumbnail */}
                <span className="thumb-badge" style={{ color: vs.color }}>
                  {vs.icon}
                </span>
              </div>

              {/* ── Session Info ────────────────────────────────── */}
              <div className="item-body">
                <div className="item-top-row">
                  <span className="item-verdict" style={{ color: vs.color }}>
                    {vs.label}
                  </span>
                  <span className="item-score-pill">
                    {session.score}<small>/100</small>
                  </span>
                </div>

                <div className="mini-score-bar">
                  <div
                    className="mini-score-fill"
                    style={{
                      width: `${session.score}%`,
                      background: session.score >= 70
                        ? 'var(--accent-green)'
                        : session.score >= 40
                        ? 'var(--accent-yellow)'
                        : 'var(--accent-blue)',
                    }}
                  />
                </div>

                <div className="item-meta-row">
                  <span className="item-time">{formatTime(session.timestamp)}</span>
                  <span className="item-checks">{checksCount}/4 checks</span>
                  {session.duration > 0 && (
                    <span className="item-duration">{session.duration}s</span>
                  )}
                </div>
              </div>

              {/* ── Delete ─────────────────────────────────────── */}
              <button
                className="delete-btn"
                onClick={() => onDelete(session.id)}
                title="Delete this session"
              >×</button>
            </div>
          );
        })}
      </div>

      {/* JSON data structure explanation */}
      <div className="storage-info">
        <span>💾 <code>localStorage</code> · Each session contains a base64 face image</span>
      </div>
    </div>
  );
}
