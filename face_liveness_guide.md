# 🧠 Face Liveness Detection — Deep Learning Guide
### *Built with React + MediaPipe FaceMesh + JavaScript*

> **Mentor Philosophy**: Every line of code exists for a reason. We learn *why* before *how*.

---

## 📋 Table of Contents
- [Core Concepts Before We Code](#core-concepts)
- [Phase 1 — Project Setup + Webcam](#phase-1)
- [Phase 2 — Face Detection + Landmarks](#phase-2)
- [Phase 3 — Blink Detection (EAR)](#phase-3)
- [Phase 4 — Head Movement Detection](#phase-4)
- [Phase 5 — Smile Detection](#phase-5)
- [Phase 6 — Liveness Engine](#phase-6)

---

## 🎓 Core Concepts Before We Code {#core-concepts}

### 1. Face Detection vs Face Landmarks vs Face Recognition

Think of your face as a **map of a city**:

| Concept | Analogy | What it does |
|---|---|---|
| **Face Detection** | "There IS a city on the map" | Just finds the bounding box — is a face present? |
| **Face Landmarks** | "Here are the streets, buildings, parks" | Finds 468 specific points on the face |
| **Face Recognition** | "I know this specific city — it's Mumbai" | Identifies *who* the face belongs to |
| **Liveness Detection** | "Is this city *real* or a photograph of a map?" | Determines if the face is a live human |

### 2. What is a Replay Attack?

Imagine a security guard checks your photo ID. A criminal holds up a **photo of you** from your Instagram. The guard might be fooled.

This is a **replay attack** (or spoof attack):
- Someone holds a **printed photo** in front of the camera
- Someone holds a **video playing on a phone** in front of the camera
- Someone uses a **3D mask** of your face

**Liveness detection** is the guard saying: *"Blink for me. Turn your head. Smile."* — things a flat photo cannot do.

### 3. How Real Banking Apps Prevent Spoofing

| Technique | How it Works |
|---|---|
| **Active Liveness** | App asks user to blink/smile/turn (our approach) |
| **Passive Liveness** | AI analyzes texture, reflection, depth without asking |
| **Infrared sensors** | Hardware detects real skin (iPhone Face ID) |
| **3D depth cameras** | Structured light maps 3D face shape |
| **Challenge-response** | Random instructions like "look left, now blink" |

### 4. How AI Models Run in the Browser

```
Traditional AI:               Browser AI (Our approach):
Your Device → API → Cloud  vs  Your Device → Model (local)
    (slow, needs internet)           (fast, private)
```

**MediaPipe FaceMesh** is a pre-trained neural network compressed to run entirely in your browser using:
- **WebAssembly (WASM)**: Compiled C++ code running near-native speed in browser
- **WebGL**: GPU acceleration for matrix operations
- The model file is ~3MB and downloaded once, then cached

### 5. How Browser Video Streams Work (Mental Model)

```
Webcam Hardware
     ↓
Camera Driver (OS level)
     ↓
Browser MediaDevices API
     ↓
getUserMedia() → MediaStream object
     ↓
<video> element renders frames at 30fps
     ↓
<canvas> captures individual frames
     ↓
MediaPipe processes each frame as an image
     ↓
Returns 468 (x,y,z) landmark points
```

---

## Phase 1 — Project Setup + Webcam Access {#phase-1}

### 🏗️ Folder Structure

```
face_liveliness/
├── public/
│   └── index.html          # Single HTML file (React mounts here)
├── src/
│   ├── components/
│   │   ├── WebcamFeed/
│   │   │   ├── WebcamFeed.jsx     # Camera access + video element
│   │   │   └── WebcamFeed.css
│   │   ├── Canvas/
│   │   │   ├── LandmarkCanvas.jsx # Canvas for drawing landmarks
│   │   │   └── LandmarkCanvas.css
│   │   ├── LivenessResult/
│   │   │   ├── LivenessResult.jsx  # Shows result UI
│   │   │   └── LivenessResult.css
│   ├── hooks/
│   │   ├── useWebcam.js           # Custom hook: webcam logic
│   │   ├── useFaceMesh.js         # Custom hook: MediaPipe logic
│   │   └── useLiveness.js         # Custom hook: detection logic
│   ├── utils/
│   │   ├── earCalculator.js       # Eye Aspect Ratio math
│   │   ├── headPose.js            # Head movement math
│   │   └── smileDetector.js       # Smile calculation
│   ├── App.jsx                    # Root component
│   ├── App.css                    # Global styles
│   └── index.js                   # Entry point
├── package.json
└── README.md
```

**Why this structure?**
- **components/**: Each UI piece is isolated — easier to debug, reuse, and test
- **hooks/**: Business logic separated from UI — this is the "React way"
- **utils/**: Pure math functions — no React, easily unit-testable

### 📦 Dependencies Explained

```json
{
  "@mediapipe/face_mesh": "FaceMesh model + landmark detection",
  "@mediapipe/camera_utils": "Helper to feed webcam to MediaPipe",
  "@mediapipe/drawing_utils": "Helper to draw landmarks on canvas"
}
```

### 🧩 Phase 1 Key Concepts

**`getUserMedia()`** — The browser API that asks permission to access camera:
```js
// This is what happens under the hood when you click "Allow"
const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: 640, height: 480, facingMode: 'user' }
  // facingMode: 'user' = front camera (selfie)
  // facingMode: 'environment' = back camera
});
```

**`useRef` vs `useState`** in React for video:
- `useState` causes a **re-render** every time it changes → BAD for 30fps video
- `useRef` stores a mutable reference that **doesn't trigger re-render** → GOOD for video elements

**React hook flow for webcam**:
```
Component mounts
     ↓
useEffect runs (once, because deps = [])
     ↓
getUserMedia() called
     ↓
stream assigned to video element via ref
     ↓
video plays
     ↓
Component unmounts → stream.getTracks().forEach(t => t.stop()) ← CLEANUP!
```

> ⚠️ **Common Beginner Mistake**: Forgetting to stop the camera stream when component unmounts.
> The green camera light stays on forever. Always clean up in `useEffect` return.

---

## Phase 2 — Face Detection + MediaPipe Landmarks {#phase-2}

### 🗺️ Understanding the 468 Landmarks

MediaPipe FaceMesh gives you **468 (x, y, z) points** on your face. Imagine a mesh net laid over your face.

```
Key landmark groups (indices):
├── Eyes:      Left [33,7,163,144,...] Right [362,382,381,...]
├── Eyebrows:  Left [70,63,105,66,107] Right [336,296,334,293,300]
├── Nose:      [1, 2, 5, 4, 19, 94...]
├── Mouth:     [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291...]
├── Jaw:       [10, 338, 297, 332, 284, 251, 389, 356...]
└── Face oval: [10, 338, 297, 332, 284, 251...]
```

**The coordinate system**:
- `x`: Left-right (0.0 = left edge of frame, 1.0 = right edge)
- `y`: Top-bottom (0.0 = top, 1.0 = bottom)
- `z`: Depth (negative = closer to camera)

### 🔄 How MediaPipe Processes Frames

```
Every ~33ms (30fps):
1. Camera captures frame (image snapshot)
2. Image sent to FaceMesh model
3. Model runs inference (neural network forward pass)
4. Returns 468 {x, y, z} normalized coordinates
5. We draw them on canvas
6. Next frame...
```

**Why canvas overlay?**
The `<video>` element can only show video — you can't draw on it.
We layer a transparent `<canvas>` on TOP of the video and draw landmarks there.

```
<div style="position: relative">
  <video />           ← Shows camera feed
  <canvas />          ← Transparent overlay, draws landmarks
</div>
```

---

## Phase 3 — Blink Detection with EAR {#phase-3}

### 👁️ Eye Aspect Ratio (EAR) — The Math of Blinking

**Real-world analogy**: Think of your eye as a football shape. When open, it's wide (high ratio). When blinking, it becomes a flat line (ratio ≈ 0).

**EAR Formula** (Soukupová & Čech, 2016):

```
        |p2-p6| + |p3-p5|
EAR = ─────────────────────
            2 × |p1-p4|

Where p1-p6 are 6 eye landmark points:

         p2    p3
    p1 ·  ·  ·  · p4
         p5    p6
```

**Landmark indices for Left Eye**:
```js
const LEFT_EYE = [362, 385, 387, 263, 373, 380];
//                p1   p2   p3   p4   p5   p6
```

**Euclidean distance** between two landmarks:
```js
function distance(a, b) {
  return Math.sqrt(
    Math.pow(b.x - a.x, 2) + 
    Math.pow(b.y - a.y, 2)
  );
  // This is just Pythagoras theorem: √(Δx² + Δy²)
}
```

**EAR thresholds**:
- EAR > 0.25 → Eye is **OPEN**
- EAR < 0.20 → Eye is **CLOSED** (blink detected!)
- Consecutive frames below threshold = definite blink

### 🎬 Frame-by-Frame Analysis

```
Frame 1: EAR = 0.32 → OPEN
Frame 2: EAR = 0.31 → OPEN
Frame 3: EAR = 0.15 → CLOSED ← blink starts
Frame 4: EAR = 0.08 → CLOSED
Frame 5: EAR = 0.28 → OPEN ← blink ends → BLINK DETECTED!
```

We count consecutive frames where EAR < threshold using a **counter variable** (not useState — too slow).

---

## Phase 4 — Head Movement Detection {#phase-4}

### 🧭 Using Nose Tip as an Anchor

**Analogy**: Imagine the nose tip (landmark #1) is a GPS dot on your face. As you turn your head, the dot moves left/right/up/down on screen.

**Strategy**: Compare current nose position to the **baseline** (position when face was first detected).

```js
// Baseline captured at start
const baseline = { x: 0.5, y: 0.5 }; // center of frame

// Current position
const current = landmarks[1]; // nose tip

// Deviation from center
const deltaX = current.x - baseline.x;
const deltaY = current.y - baseline.y;

// Directions:
if (deltaX > 0.05) → "Looking LEFT"  (x increases when turning left)
if (deltaX < -0.05) → "Looking RIGHT"
if (deltaY < -0.05) → "Looking UP"    (y decreases going up)
if (deltaY > 0.05) → "Looking DOWN"
```

**Why nose tip?**
- It's the most stable landmark (center of face)
- Moves predictably and linearly with head rotation
- Least affected by expressions

---

## Phase 5 — Smile Detection {#phase-5}

### 😊 Mouth Aspect Ratio (MAR)

**Analogy**: A smile widens the mouth corners and raises the cheeks. We measure the **ratio of mouth width to face width**.

**Key landmarks**:
```
Left corner:  landmark[61]
Right corner: landmark[291]
Top lip:      landmark[13]  (center top)
Bottom lip:   landmark[14]  (center bottom)
```

**Smile metric**:
```js
const mouthWidth = distance(landmarks[61], landmarks[291]);
const faceWidth = distance(landmarks[234], landmarks[454]); // jaw width

const smileRatio = mouthWidth / faceWidth;

// smileRatio > 0.45 → Smiling!
// smileRatio < 0.35 → Neutral/Frowning
```

**Why ratio, not absolute pixels?**
Because people have different face sizes. A ratio normalizes across all faces.

---

## Phase 6 — Liveness Verification Engine {#phase-6}

### 🏦 The Challenge-Response System

**Real-world analogy**: Like a bank's OTP — you need to PROVE you're present.

**Our liveness score system**:

```
Liveness Checks (each worth points):
├── ✅ Blink detected × 2           → +30 points
├── ✅ Head turned left OR right    → +25 points  
├── ✅ Head moved up OR down        → +20 points
├── ✅ Smile detected               → +25 points
└── Total = 100 points

Result:
├── ≥ 80 points → LIVE HUMAN ✅
├── 40-79 pts   → UNCERTAIN ⚠️
└── < 40 pts    → POSSIBLE SPOOF ❌
```

### 🏢 How Real Companies Use This

| Company | Use Case | Tech |
|---|---|---|
| **Aadhaar (UIDAI)** | eKYC verification | Passive liveness + depth |
| **WhatsApp/Meta** | Profile photo verification | ML-based passive liveness |
| **Banks (SBI, HDFC)** | Video KYC | Active liveness challenges |
| **IRCTC** | Tatkal booking fraud | Blink + head pose detection |
| **Airport e-gates** | Automated border control | 3D face + IR liveness |

---

## 🐛 Debugging Strategies

### Common Issues & Fixes

| Problem | Cause | Fix |
|---|---|---|
| Camera black screen | Permission not granted or HTTPS required | Check console, use localhost |
| FaceMesh not loading | CDN/model files not cached | Check Network tab, add loading state |
| Landmarks flickering | No face smoothing | Use `refineLandmarks: true` |
| Memory leak | Stream not stopped on unmount | Add cleanup in useEffect |
| Low FPS | Too much work per frame | Move heavy computation off main thread |
| EAR always 0 | Wrong landmark indices | Log landmarks[33] and verify |

### Debug Mental Model

```
Problem → Check Console (errors?)
        → Check Network (model loaded?)
        → Log landmarks (is FaceMesh running?)
        → Log EAR values (is math correct?)
        → Log state (is React updating?)
```

### Performance Optimization Tips

1. **requestAnimationFrame** — Let browser decide when to process (better than setInterval)
2. **useRef for counters** — Not useState, avoids re-renders inside animation loop
3. **Throttle heavy operations** — Don't run smile check every frame, every 5 frames is enough
4. **Canvas resolution** — Match canvas size to video size exactly to avoid scaling artifacts

---

## 📊 Performance & FPS

**Target**: 24-30 FPS for smooth real-time experience

**FPS Formula**:
```js
// Measure actual FPS
let lastTime = performance.now();
let frameCount = 0;

function onFrame() {
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    console.log(`FPS: ${frameCount}`);
    frameCount = 0;
    lastTime = now;
  }
}
```

**FPS killers**:
- Synchronous heavy computation on main thread
- Too many state updates per second
- Drawing too many canvas elements

---

*Guide updated through Phase 6. Each phase has corresponding code in `src/`.*
