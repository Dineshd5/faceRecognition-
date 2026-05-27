import { useRef, useEffect, useState } from 'react';
import QRCodeModule from 'react-qr-code';
const QRCode = QRCodeModule.default || QRCodeModule.QRCode || QRCodeModule;
import { useWebcam } from './hooks/useWebcam';
import { useFaceMesh } from './hooks/useFaceMesh';
import { useLiveness } from './hooks/useLiveness';
import './App.css';

function FaceAppCore() {
  const canvasRef = useRef(null);
  const { videoRef, isReady: isVideoReady, error: cameraError } = useWebcam();
  const { livenessData, processFrame, resetLiveness } = useLiveness();
  const { isModelLoaded, fps } = useFaceMesh(
    videoRef, canvasRef, isVideoReady, processFrame
  );

  // 'intro' | 'checking' | 'capture' | 'result'
  const [step, setStep] = useState('intro');
  const [capturedImage, setCapturedImage] = useState(null);
  const [finalScore, setFinalScore] = useState(0);
  const [sessionId, setSessionId] = useState('');

  // Upload states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [matchData, setMatchData] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState(null);

  const captureFaceSnapshot = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const offscreen = document.createElement('canvas');
    offscreen.width = video.videoWidth || 640;
    offscreen.height = video.videoHeight || 480;
    const ctx = offscreen.getContext('2d');
    ctx.translate(offscreen.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    return offscreen.toDataURL('image/jpeg', 0.85);
  };

  const uploadToAWS = async (snap, currentSessionId, currentScore) => {
    setIsUploading(true);
    setUploadMessage('Uploading photo to AWS...');
    try {
      const AWS_API_URL = import.meta.env.VITE_AWS_LAMBDA_URL;

      const response = await fetch(AWS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          image: snap,
          livenessScore: currentScore
        }),
      });

      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

      const data = await response.json();
      setMatchData(data);
      setUploadMessage('✅ Photo successfully uploaded to AWS!');
    } catch (error) {
      console.error('Error uploading photo:', error);
      setUploadMessage('❌ Failed to upload photo.');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (step === 'checking' && livenessData.verdict === 'live') {
      const newScore = livenessData.score;
      const newSessionId = crypto.randomUUID();
      
      setFinalScore(newScore);
      setSessionId(newSessionId);
      
      // Auto-capture immediately
      const snap = captureFaceSnapshot();
      setCapturedImage(snap);
      setStep('result');
      
      uploadToAWS(snap, newSessionId, newScore);
    }
  }, [livenessData.verdict, step]);

  const handleStart = () => {
    resetLiveness();
    setStep('checking');
  };


  const handleRestart = () => {
    resetLiveness();
    setCapturedImage(null);
    setFinalScore(0);
    setUploadMessage('');
    setMatchData(null);
    setStep('intro');
  };

  // Determine what instruction to show based on remaining checks
  let instructionBadge = null;
  let showFlashing = false;

  if (step === 'checking') {
    if (!livenessData.checks.movedHead) {
      instructionBadge = 'Turn head L/R';
    } else if (!livenessData.checks.movedVertical) {
      instructionBadge = 'Nod up/down';
    } else if (!livenessData.checks.smiled) {
      instructionBadge = 'Smile!';
    } else if (!livenessData.checks.blinked) {
      instructionBadge = 'Blink naturally';
    } else {
      instructionBadge = 'Hold still';
      showFlashing = true; // The hold still state triggers the flashing colors
    }
  }


  return (
    <div className="app">
      {/* Background Flashing */}
      <div className={`flashing-bg ${showFlashing ? 'active' : ''}`}></div>

      {/* Removed status-bar */}

      {step !== 'result' && (
        <div className="close-btn" onClick={handleRestart}>✕</div>
      )}

      {/* Main Content Area */}
      {step !== 'result' && (
        <div className="content" style={{ justifyContent: (step === 'checking' || step === 'capture') ? 'center' : 'flex-start', paddingTop: (step === 'checking' || step === 'capture') ? '60px' : '24px' }}>

          {step === 'intro' && (
            <>
              <div className="warning-box">
                <span style={{ fontSize: '18px' }}>ⓘ</span>
                <div>
                  <span className="title">Photosensitivity warning</span>
                  This check flashes different colors. Use caution if you are photosensitive.
                </div>
              </div>
              <h2 className="main-title">Center your face</h2>
            </>
          )}

          <div className="camera-wrapper">
            {step === 'checking' && instructionBadge && (
              <div className="instruction-badge">{instructionBadge}</div>
            )}

            {/* Face Cutout Guide Overlay */}
            {step === 'checking' && (
              <div className="face-cutout-overlay">
                 <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="face-cutout-svg">
                   <path fillRule="evenodd" clipRule="evenodd" d="M0 0H100V100H0V0ZM50 90C68 90 82 72 82 50C82 28 68 10 50 10C32 10 18 28 18 50C18 72 32 90 50 90Z" fill="rgba(0,0,0,0.55)"/>
                 </svg>
              </div>
            )}

            <video
              ref={videoRef}
              className="camera-video"
              width="640"
              height="480"
              muted
              playsInline
            />
            <canvas
              ref={canvasRef}
              className="landmark-canvas"
              width="640"
              height="480"
            />

            {step === 'intro' && !isModelLoaded && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(4px)', color: '#1E293B', zIndex: 20 }}>
                <div className="spinner"></div>
                <div style={{ fontWeight: '600', fontSize: '15px' }}>Initializing AI Engine...</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Area */}
      {step === 'intro' && (
        <div className="footer">
          <button
            className="primary-btn"
            onClick={handleStart}
            disabled={!isModelLoaded || !isVideoReady}
          >
            Start Video Check
          </button>
        </div>
      )}

      {step === 'checking' && (
        <div className="footer" style={{ background: 'transparent', display: 'flex', justifyContent: 'center', paddingBottom: '32px' }}>
        </div>
      )}

      {step === 'capture' && (
        <div className="footer">
          <button
            className="primary-btn"
            onClick={handleCapture}
            style={{ backgroundColor: livenessData.headDirection === 'center' ? '#0284c7' : '#9ca3af' }}
            disabled={livenessData.headDirection !== 'center'}
          >
            📸 {livenessData.headDirection === 'center' ? 'Capture Photo' : 'Please look straight'}
          </button>
        </div>
      )}

      {step === 'result' && (
        <div className="result-screen">
          <h2 className="result-title">Verification Complete</h2>

          <div className="result-summary-card">
            {capturedImage && (
              <div className="result-image-container">
                <img src={capturedImage} alt="Captured Face" className="captured-image-final" />
                <div className="verified-badge">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
              </div>
            )}

            <div className="result-status">
              <h3 style={{ color: '#34d399', marginBottom: '6px', fontWeight: '700', fontSize: '20px' }}>Check Successful</h3>
              <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.4', marginBottom: '12px' }}>Your face liveness has been confirmed and verified.</p>

              {/* AWS Upload Status Display */}
              {uploadMessage && (
                <div style={{
                  padding: '10px 16px',
                  background: isUploading ? '#EFF6FF' : (uploadMessage.includes('✅') ? '#ECFDF5' : '#FEF2F2'),
                  color: isUploading ? '#1D4ED8' : (uploadMessage.includes('✅') ? '#059669' : '#DC2626'),
                  border: `1px solid ${isUploading ? '#BFDBFE' : (uploadMessage.includes('✅') ? '#A7F3D0' : '#FECACA')}`,
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: '600',
                  display: 'inline-block'
                }}>
                  {isUploading && <span style={{ display: 'inline-block', marginRight: '8px', animation: 'spin 1s linear infinite' }}>⟳</span>}
                  {uploadMessage}
                </div>
              )}
            </div>

            <div className="result-details-grid">
              <div className="detail-item">
                <span className="detail-label">Confidence</span>
                <span className="score-pill">{finalScore.toFixed(4)}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Session ID</span>
                <code className="session-id">{sessionId.split('-')[0]}...{sessionId.split('-')[4]}</code>
              </div>
            </div>

            {/* Display Match Results */}
            {matchData && (
              <div style={{ marginTop: '24px', textAlign: 'left' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#0F172A', fontSize: '16px' }}>Identity Matched!</h4>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', color: '#475569', margin: '0' }}>
                    <strong>User ID:</strong> {matchData.userId}
                  </p>
                  <p style={{ fontSize: '13px', color: '#475569', margin: '0' }}>
                    <strong>Photos Found:</strong> <span style={{ color: '#2563EB', fontWeight: 'bold' }}>{matchData.matchesFound}</span>
                  </p>
                </div>

                {matchData.matchedPhotos && matchData.matchedPhotos.length > 0 ? (
                  <div className="match-card-grid">
                    {matchData.matchedPhotos.map((photo, idx) => (
                      <div key={idx} className="match-card">
                        {photo.url ? (
                          <a href={photo.url} target="_blank" rel="noopener noreferrer" style={{ width: '100%', aspectRatio: '1', background: '#F1F5F9', position: 'relative', display: 'block', textDecoration: 'none' }}>
                            <img src={photo.url} alt={`Match ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(16, 185, 129, 0.9)', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                              {photo.similarity}%
                            </div>
                          </a>
                        ) : (
                          <div style={{ width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9' }}>
                            <span style={{ fontSize: '24px' }}>📸</span>
                          </div>
                        )}
                        <div style={{ padding: '12px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ color: '#475569', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '500' }} title={photo.photoId}>
                            {photo.photoId}
                          </div>
                          {!photo.url && <div style={{ color: '#059669', fontSize: '13px', fontWeight: 'bold' }}>Match: {photo.similarity}%</div>}

                          {photo.url && (
                            <button
                              onClick={() => setQrCodeUrl(photo.url)}
                              style={{
                                width: '100%',
                                background: '#EFF6FF',
                                color: '#2563EB',
                                border: '1px solid #BFDBFE',
                                padding: '6px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>📱</span> Scan to Mobile
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', margin: '0' }}>No matching event photos found yet.</p>
                )}
              </div>
            )}
          </div>

          <div className="footer" style={{ padding: '0', marginTop: 'auto', width: '100%', maxWidth: '420px' }}>
            <button className="primary-btn" onClick={handleRestart} style={{ background: '#f1f5f9', color: '#334155', boxShadow: 'none' }}>
              Start New Check
            </button>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrCodeUrl && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: 'white', padding: '32px', borderRadius: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            textAlign: 'center', maxWidth: '320px', width: '90%'
          }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#0F172A', fontSize: '18px' }}>Scan to Download</h3>
            <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '24px' }}>
              Point your phone's camera at this code to instantly open the photo.
            </p>
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '16px', display: 'inline-block', border: '1px solid #E2E8F0', marginBottom: '24px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              <QRCode
                value={qrCodeUrl}
                size={256}
                level="L"
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                viewBox={`0 0 256 256`}
              />
            </div>
            <button
              onClick={() => setQrCodeUrl(null)}
              style={{ width: '100%', background: '#F1F5F9', color: '#475569', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('user_authenticated') === 'true';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (password.length >= 4 && email.includes('@')) {
      setIsAuthenticated(true);
      localStorage.setItem('user_authenticated', 'true');
      setLoginError('');
    } else {
      setLoginError('Invalid email or password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('user_authenticated');
  };

  if (!isAuthenticated) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="result-screen">
          <h2 className="result-title">User Login</h2>
          <p style={{ color: '#64748B', fontSize: '14px', marginBottom: '32px' }}>
            Please sign in to verify your identity.
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left', width: '100%' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            {loginError && <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: '500' }}>{loginError}</div>}

            <button type="submit" className="primary-btn" style={{ marginTop: '8px' }}>
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <FaceAppCore />
      <button
        onClick={handleLogout}
        style={{ position: 'fixed', bottom: '20px', right: '20px', background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', zIndex: 1000, transition: 'all 0.2s' }}
      >
        Logout
      </button>
    </div>
  );
}
