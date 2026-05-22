/**
 * useWebcam.js — Custom React Hook
 * ==================================
 * Manages webcam access, video stream lifecycle, and cleanup.
 *
 * CONCEPT: Why a Custom Hook?
 * ----------------------------
 * In React, a "hook" is a function that lets you reuse stateful logic.
 * Instead of copy-pasting webcam code into every component, we isolate
 * it here and just call `useWebcam()` wherever needed.
 *
 * CONCEPT: getUserMedia() API
 * ----------------------------
 * This is the browser API that gives JavaScript access to camera/microphone.
 * - It's async (requires await) because asking for permission takes time
 * - Returns a MediaStream object — a live feed of video/audio data
 * - The stream is then attached to a <video> element to display it
 *
 * CONCEPT: useRef vs useState for video
 * ---------------------------------------
 * - useState causes React to RE-RENDER when value changes
 * - A re-render at 30fps would be catastrophic for performance!
 * - useRef stores a mutable reference WITHOUT triggering re-renders
 * - The video element reference never changes, only its .srcObject does
 *
 * CONCEPT: useEffect cleanup
 * ---------------------------
 * When the component unmounts (user navigates away), we MUST stop
 * the camera. Otherwise:
 *   - The green camera indicator light stays on forever
 *   - Memory leak: stream keeps sending data nobody reads
 *   - Browser resource leak
 */

import { useEffect, useRef, useState } from 'react';

/**
 * useWebcam hook
 * Provides a ref to attach to a <video> element and status state.
 *
 * @returns {{ videoRef, isReady, error, startCamera, stopCamera }}
 */
export function useWebcam() {
  // useRef: holds reference to the <video> DOM element
  // This does NOT cause re-renders when changed
  const videoRef = useRef(null);

  // useRef: holds the MediaStream so we can stop it on cleanup
  const streamRef = useRef(null);

  // useState: status flags that DO need to trigger re-renders
  // (because we want to show loading/error UI)
  const [isReady, setIsReady] = useState(false);  // camera is live and playing
  const [error, setError]     = useState(null);    // error message if access denied

  /**
   * Requests camera access and attaches the stream to the video element.
   *
   * WHY facingMode: 'user'?
   * → 'user' = front camera (selfie cam) — what we want for liveness
   * → 'environment' = back camera — for scanning QR codes etc.
   *
   * WHY width: 640, height: 480?
   * → Balance between resolution (better detection) and performance (FPS)
   * → Higher resolution = more pixels for MediaPipe to process = slower
   */
  const startCamera = async () => {
    try {
      setError(null); // clear any previous error
      setIsReady(false);

      // Request camera permission
      // This triggers the browser's "Allow camera access?" popup
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:      { ideal: 640 },   // preferred width (browser picks closest available)
          height:     { ideal: 480 },   // preferred height
          facingMode: 'user',            // front camera
          frameRate:  { ideal: 30 },    // 30fps target
        },
        audio: false, // we don't need audio for liveness detection
      });

      // Store stream reference for later cleanup
      streamRef.current = stream;

      // Attach stream to video element
      // .srcObject is the modern way (vs the older .src URL approach)
      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Wait for video to be ready to play
        // 'loadedmetadata' fires when the browser knows the video dimensions
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play(); // start playing
          setIsReady(true);        // tell React we're ready
        };
      }
    } catch (err) {
      // Common errors:
      // NotAllowedError   → User denied camera permission
      // NotFoundError     → No camera found on device
      // NotReadableError  → Camera in use by another app
      console.error('Camera error:', err);
      setError(err.message || 'Camera access failed');
    }
  };

  /**
   * Stops all camera tracks and releases the stream.
   * A "track" is one individual stream (we have one video track).
   */
  const stopCamera = () => {
    if (streamRef.current) {
      // Stop every track in the stream
      // This is what turns off the green camera light
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsReady(false);
  };

  // Start camera when hook mounts, cleanup when it unmounts
  useEffect(() => {
    startCamera(); // auto-start on mount

    // Cleanup function: runs when component using this hook is removed from DOM
    return () => {
      stopCamera(); // turn off camera on cleanup
    };
  }, []); // empty deps array = run once on mount only

  return {
    videoRef,    // attach this to <video ref={videoRef}>
    isReady,     // true when camera feed is live
    error,       // error string or null
    startCamera, // call this to restart camera
    stopCamera,  // call this to stop camera
  };
}
