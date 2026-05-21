import { useRef, useEffect, useState } from 'react';
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

  useEffect(() => {
    if (step === 'checking' && livenessData.verdict === 'live') {
      setFinalScore(livenessData.score);
      setSessionId(crypto.randomUUID());
      setStep('capture');
    }
  }, [livenessData.verdict, step]);

  const handleStart = () => {
    resetLiveness();
    setStep('checking');
  };

  const handleCapture = async () => {
    const snap = captureFaceSnapshot();
    setCapturedImage(snap);
    setStep('result');

    // ── Upload to AWS Lambda ──
    setIsUploading(true);
    setUploadMessage('Uploading photo to AWS...');
    try {
      // ⚠️ IMPORTANT: Replace this with your actual API Gateway URL or Lambda Function URL
      const AWS_API_URL = 'https://tu5r2yfqlfptjvdoww332m22rq0rsvdm.lambda-url.eu-west-1.on.aws/';



      const response = await fetch(AWS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId,
          image: snap, // Base64 encoded JPEG
          livenessScore: finalScore
        }),
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status: ${response.status}`);
      }

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
    if (!livenessData.checks.blinked) {
      instructionBadge = 'Blink naturally';
    } else if (!livenessData.checks.movedHead) {
      instructionBadge = 'Turn head L/R';
    } else if (!livenessData.checks.movedVertical) {
      instructionBadge = 'Nod up/down';
    } else if (!livenessData.checks.smiled) {
      instructionBadge = 'Smile!';
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

          {/* SINGLE, STABLE CAMERA WRAPPER */}
          <div className="camera-wrapper">
            {step === 'checking' && instructionBadge && (
              <div className="instruction-badge">{instructionBadge}</div>
            )}
            {step === 'capture' && (
              <div className="instruction-badge" style={{ background: '#0ea5e9' }}>Look straight for photo</div>
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
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', color: 'white', zIndex: 20 }}>
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
                  background: isUploading ? 'rgba(59, 130, 246, 0.1)' : (uploadMessage.includes('✅') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'),
                  color: isUploading ? '#93c5fd' : (uploadMessage.includes('✅') ? '#34d399' : '#fca5a5'),
                  border: `1px solid ${isUploading ? 'rgba(59, 130, 246, 0.2)' : (uploadMessage.includes('✅') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)')}`,
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
              <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'left' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '15px' }}>Identity Matched!</h4>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>
                  <strong>User ID:</strong> {matchData.userId}
                </p>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>
                  <strong>Photos Found:</strong> <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{matchData.matchesFound}</span>
                </p>
                
                {matchData.matchedPhotos && matchData.matchedPhotos.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px', marginTop: '16px' }}>
                    {matchData.matchedPhotos.map((photo, idx) => (
                      <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {photo.url ? (
                          <div style={{ width: '100%', aspectRatio: '1', background: '#0f172a', position: 'relative' }}>
                            <img src={photo.url} alt={`Match ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(16, 185, 129, 0.9)', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
                              {photo.similarity}%
                            </div>
                          </div>
                        ) : (
                          <div style={{ width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b' }}>
                            <span style={{ fontSize: '24px' }}>📸</span>
                          </div>
                        )}
                        <div style={{ padding: '12px' }}>
                          <div style={{ color: '#cbd5e1', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }} title={photo.photoId}>
                            {photo.photoId}
                          </div>
                          {!photo.url && <div style={{ color: '#34d399', fontSize: '13px', fontWeight: 'bold' }}>Match: {photo.similarity}%</div>}
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
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (password.length >= 4 && email.includes('@')) {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Invalid email or password');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="result-screen" style={{ width: '100%', maxWidth: '400px', textAlign: 'center', padding: '40px 32px' }}>
          <h2 className="result-title" style={{ fontSize: '24px' }}>User Login</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '32px' }}>
            Please sign in to verify your identity.
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '14px', background: 'rgba(15, 23, 42, 0.6)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '14px', background: 'rgba(15, 23, 42, 0.6)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
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

  return <FaceAppCore />;
}
