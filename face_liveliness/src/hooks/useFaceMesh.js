/**
 * useFaceMesh.js — Custom React Hook
 * =====================================
 * Initializes MediaPipe FaceMesh and runs it frame-by-frame on webcam feed.
 *
 * CONCEPT: How MediaPipe Works in the Browser
 * --------------------------------------------
 * MediaPipe FaceMesh is a pre-trained neural network model (~3MB).
 * In the browser, it runs via:
 *   1. WebAssembly (WASM): Compiled C++ code → runs near-native speed
 *   2. WebGL: GPU-accelerated matrix operations
 *
 * Processing pipeline:
 *   Video Frame (image) → Neural Network → 468 (x,y,z) landmark points
 *
 * CONCEPT: The Animation Loop
 * ----------------------------
 * We can't use setInterval for 30fps processing — it's not frame-synchronized.
 * Instead, we use requestAnimationFrame (rAF):
 *   - Browser calls our function EXACTLY when it's about to repaint the screen
 *   - Typically 60fps on a monitor, automatically slows on background tabs
 *   - More efficient than setInterval because it syncs with the display
 *
 * CONCEPT: Model Initialization
 * -------------------------------
 * We use @mediapipe/camera_utils Camera helper which:
 *   1. Reads frames from the video element
 *   2. Sends each frame to FaceMesh
 *   3. Calls our onResults callback with the landmarks
 *
 * Note: We load the MediaPipe model files from a CDN (Google's servers).
 * The model is ~3MB and cached by the browser after first load.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * WHY no import statements for FaceMesh / Camera?
 * -------------------------------------------------
 * @mediapipe/* packages use IIFE bundle format (not ES modules).
 * They are loaded via <script> tags in index.html which attach them
 * to the window object: window.FaceMesh, window.Camera.
 * We access them as globals here instead of importing.
 */

/**
 * useFaceMesh hook
 * Initializes MediaPipe and processes webcam frames.
 *
 * @param {React.RefObject} videoRef - Ref to the playing <video> element
 * @param {React.RefObject} canvasRef - Ref to the <canvas> overlay
 * @param {boolean} isVideoReady - True when video is playing
 * @param {Function} onLandmarks - Callback(landmarks) called each frame
 * @returns {{ isModelLoaded, fps }}
 */
export function useFaceMesh(videoRef, canvasRef, isVideoReady, onLandmarks) {
  // Track whether the heavy ML model has finished loading
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  // Track real-time FPS for performance monitoring
  const [fps, setFps] = useState(0);

  // useRef for FPS tracking (mutated inside animation loop → no re-render needed)
  const fpsCounterRef  = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());

  // Store FaceMesh and Camera instances to clean them up later
  const faceMeshRef = useRef(null);
  const cameraRef   = useRef(null);

  /**
   * The callback that MediaPipe calls after processing each frame.
   * This is where we receive the 468 face landmarks.
   *
   * IMPORTANT: This runs at ~30fps. Keep it fast — no heavy sync operations!
   *
   * @param {Object} results - MediaPipe results object
   * @param {Array}  results.multiFaceLandmarks - Array of face arrays (each with 468 points)
   */
  const onResults = useCallback((results) => {
    // ── FPS Counter ──────────────────────────────────────────────
    fpsCounterRef.current++;
    const now = performance.now();
    if (now - lastFpsTimeRef.current >= 1000) {
      // One second has passed → record FPS and reset
      setFps(fpsCounterRef.current);
      fpsCounterRef.current  = 0;
      lastFpsTimeRef.current = now;
    }

    // ── Canvas Drawing Setup ──────────────────────────────────────
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Clear previous frame's drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Always draw the static overlay guide first, even if no face is detected
    drawStaticOverlay(ctx, canvas.width, canvas.height);

    // ── Face Detected? ────────────────────────────────────────────
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      // No face detected in this frame — skip processing
      // (happens when user looks away or face is occluded)
      onLandmarks(null);
      return;
    }

    // We only care about the first detected face
    // results.multiFaceLandmarks is an array of faces; [0] = first face
    const landmarks = results.multiFaceLandmarks[0];

    // ── Draw Static Oval Overlay ──────────────────────────────────
    drawStaticOverlay(ctx, canvas.width, canvas.height);

    // ── Pass landmarks to parent for liveness processing ──────────
    // onLandmarks is the callback we received from App.jsx
    onLandmarks(landmarks);

  }, [canvasRef, onLandmarks]);

  /**
   * Draws a professional translucent overlay with a clear oval cutout
   * for the user to align their face within.
   */
  function drawStaticOverlay(ctx, width, height) {
    // 1. Draw dark translucent background over entire canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, width, height);

    // 2. Cut out an oval in the center
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = width * 0.28; // 28% of width
    const radiusY = height * 0.42; // 42% of height
    
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    ctx.fill();
    
    // 3. Reset composite operation to draw the border normally
    ctx.globalCompositeOperation = 'source-over';
    
    // 4. Draw a clean, dashed border around the cutout
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.setLineDash([8, 8]); // Dashed line
    ctx.stroke();
    
    // Reset line dash for anything else that might draw later
    ctx.setLineDash([]);
  }


  // ── Initialize FaceMesh when video is ready ────────────────────
  useEffect(() => {
    // Don't initialize until video is playing
    if (!isVideoReady || !videoRef.current) return;

    /**
     * FaceMesh Configuration Options:
     *
     * maxNumFaces: 1
     *   → Only detect one face (we're doing single-user liveness)
     *   → Detecting more faces = more processing time
     *
     * refineLandmarks: true
     *   → Uses a more accurate model for eyes and lips
     *   → Gives 478 points instead of 468 (extra eye/lip detail)
     *   → Slightly slower but MUCH better EAR accuracy
     *
     * minDetectionConfidence: 0.5
     *   → Only report a face if model is ≥ 50% confident
     *   → Higher = fewer false positives, but may miss some faces
     *
     * minTrackingConfidence: 0.5
     *   → Confidence threshold for tracking (once face is found)
     *   → Tracking is faster than re-detection (uses the previous frame)
     */
    // Access MediaPipe classes from the window global (set by CDN scripts in index.html)
    // Guard: ensure the scripts have loaded before we try to use them
    let initInterval = null;

    const initializeMediaPipe = () => {
      if (!window.FaceMesh || !window.Camera) {
        console.warn('MediaPipe not yet loaded on window — retrying in 500ms...');
        return false;
      }

      const faceMesh = new window.FaceMesh({
      // locateFile tells MediaPipe where to find its WASM + model weight files
      // It fetches them from jsDelivr CDN, which caches them in the browser
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

      faceMesh.setOptions({
        maxNumFaces:            1,
        refineLandmarks:        true,  
        minDetectionConfidence: 0.5,
        minTrackingConfidence:  0.5,
      });

      faceMesh.onResults(onResults);
      faceMeshRef.current = faceMesh;

      const camera = new window.Camera(videoRef.current, {
        onFrame: async () => {
          if (!videoRef.current) return;
          try {
            await faceMesh.send({ image: videoRef.current });
          } catch (e) {}
        },
        width:  640,
        height: 480,
      });

      camera.start().then(() => {
        setIsModelLoaded(true);
      });

      cameraRef.current = camera;
      return true;
    };

    // Try to initialize immediately
    if (!initializeMediaPipe()) {
      // If it fails (CDN not loaded), keep trying every 500ms
      initInterval = setInterval(() => {
        if (initializeMediaPipe()) {
          clearInterval(initInterval);
        }
      }, 500);
    }

    // Cleanup: stop processing when component unmounts
    return () => {
      if (initInterval) clearInterval(initInterval);
      if (cameraRef.current) cameraRef.current.stop();
      if (faceMeshRef.current) faceMeshRef.current.close();
    };
  }, [isVideoReady]); // Re-run if video readiness changes

  return {
    isModelLoaded, // true when ML model is downloaded and running
    fps,           // current frames per second
  };
}
