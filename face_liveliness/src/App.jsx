import { useRef, useEffect, useState } from 'react';
import { useWebcam }             from './hooks/useWebcam';
import { useFaceMesh }           from './hooks/useFaceMesh';
import { useLiveness }           from './hooks/useLiveness';
import './App.css';

function App() {
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

  const captureFaceSnapshot = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const offscreen = document.createElement('canvas');
    offscreen.width  = video.videoWidth  || 640;
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

  const handleCapture = () => {
    const snap = captureFaceSnapshot();
    setCapturedImage(snap);
    setStep('result');
  };

  const handleRestart = () => {
    resetLiveness();
    setCapturedImage(null);
    setFinalScore(0);
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
                <span style={{fontSize: '18px'}}>ⓘ</span>
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
              <div className="instruction-badge" style={{background: '#0ea5e9'}}>Look straight for photo</div>
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
              <div style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px', fontSize: '12px'}}>
                Loading AI...
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
        <div className="footer" style={{background: 'transparent', display: 'flex', justifyContent: 'center', paddingBottom: '32px'}}>
        </div>
      )}

      {step === 'capture' && (
        <div className="footer">
          <button 
            className="primary-btn" 
            onClick={handleCapture}
            style={{backgroundColor: '#0284c7'}}
          >
            📸 Capture Photo
          </button>
        </div>
      )}

      {step === 'result' && (
        <div className="result-screen">
          
          <h2 className="result-title">Liveness Result</h2>

          <div className="result-card">
            <div className="result-row">
              <strong>Session ID:</strong>
              <div style={{color: '#6b7280', marginTop: '4px', wordBreak: 'break-all'}}>{sessionId}</div>
            </div>
          </div>

          <div className="result-row">
            <strong>Result:</strong> Check successful
          </div>
          <div className="result-row">
            <strong>Liveness confidence score:</strong> 
            <span className="score-pill">{finalScore.toFixed(4)}</span>
          </div>

          <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: '32px'}}>
            {capturedImage && (
              <img src={capturedImage} alt="Captured Face" className="captured-image" />
            )}
          </div>

          <div className="footer" style={{padding: '0', marginTop: '32px'}}>
            <button className="primary-btn" onClick={handleRestart}>
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
