import sys, os
import cv2
import base64
import tempfile
import uuid
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask.json.provider import DefaultJSONProvider
from deepface import DeepFace
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix
from app_postgres import init_db, get_db_connection, THRESHOLD

# Force UTF-8 on Windows so print() never raises UnicodeEncodeError
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1)

class NumpyJSONProvider(DefaultJSONProvider):
    """
    Custom Flask JSON provider that handles numpy scalar types.

    WHY THIS IS NEEDED:
    DeepFace and NumPy operations return numpy-specific scalar types
    (numpy.bool_, numpy.int64, numpy.float64) instead of Python's
    native bool/int/float. Python's built-in json module doesn't know
    how to serialize these, causing:
       TypeError: Object of type bool_ is not JSON serializable

    This provider intercepts any unrecognized type and converts it
    to its Python equivalent BEFORE serialization happens.
    """

    @staticmethod
    def default(obj):
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.integer):          # covers int8, int16, int32, int64...
            return int(obj)
        if isinstance(obj, np.floating):         # covers float32, float64...
            return float(obj)
        if isinstance(obj, np.ndarray):          # convert arrays to plain lists
            return obj.tolist()
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


app = Flask(__name__)
# Register the custom numpy-aware JSON provider
app.json_provider_class = NumpyJSONProvider
app.json = NumpyJSONProvider(app)
# Support proxy headers like X-Forwarded-Proto for Nginx
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
# CORS enabled to support frontend communication
CORS(app, resources={r"/api/*": {"origins": "*"}})

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs('db', exist_ok=True)

@app.route('/api/profiles', methods=['GET'])
def get_profiles():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT filename FROM face_embeddings")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        profiles = [r[0] for r in rows]
        return jsonify({'profiles': profiles})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/add-profile', methods=['POST'])
def api_add_profile():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
    
    filename = secure_filename(file.filename)
    filepath = os.path.join('db', filename)
    file.save(filepath)
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM face_embeddings WHERE filename = %s", (filename,))
        if cur.fetchone():
            return jsonify({'message': f"Profile '{filename}' already exists."}), 200
            
        # Use a much lighter settings for adding profiles
        results = DeepFace.represent(img_path=filepath, model_name="VGG-Face", enforce_detection=False, detector_backend="opencv")
        if len(results) > 0:
            embedding = results[0]["embedding"]
            cur.execute("INSERT INTO face_embeddings (filename, embedding) VALUES (%s, %s)", (filename, embedding))
            conn.commit()
            return jsonify({'message': f"Profile '{filename}' added successfully!"}), 200
        else:
            return jsonify({'error': 'No face detected.'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals() and conn:
            cur.close()
            conn.close()

@app.route('/api/blur-others', methods=['POST'])
def api_blur_others():
    target_name = request.form.get('target_name')
    threshold_str = request.form.get('threshold', '0.45')
    
    try:
        threshold = float(threshold_str)
    except ValueError:
        threshold = 0.45
        
    if not target_name:
        return jsonify({'error': 'Target name required'}), 400
        
    if 'group_photo' not in request.files:
        return jsonify({'error': 'No group photo provided'}), 400
    
    file = request.files['group_photo']
    group_filename = secure_filename(file.filename)
    group_path = os.path.join(UPLOAD_FOLDER, group_filename)
    file.save(group_path)
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT embedding FROM face_embeddings WHERE filename = %s", (target_name,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if not row:
            return jsonify({'error': f"Target profile '{target_name}' not found in database."}), 404
            
        target_emb_np = np.array(row[0])
        
        original_img = cv2.imread(group_path)
        if original_img is None:
            return jsonify({'error': 'Invalid image file'}), 400
        
        results = DeepFace.represent(img_path=group_path, model_name="VGG-Face", enforce_detection=True, align=True, detector_backend="retinaface")
        
        match_found = False
        
        for face_obj in results:
            area = face_obj['facial_area']
            x, y, w, h = area['x'], area['y'], area['w'], area['h']
            face_emb = np.array(face_obj['embedding'])
            
            cosine_similarity = np.dot(target_emb_np, face_emb) / (np.linalg.norm(target_emb_np) * np.linalg.norm(face_emb))
            distance = 1.0 - cosine_similarity
            
            # --- PADDED ROI FOR FULL COVERAGE ---
            padding_w = int(w * 0.2)
            padding_h = int(h * 0.2)
            y1, y2 = max(0, y - padding_h), min(original_img.shape[0], y + h + padding_h)
            x1, x2 = max(0, x - padding_w), min(original_img.shape[1], x + w + padding_w)
            
            if distance <= threshold:
                match_found = True
            else:
                # --- SOFT ELLIPTICAL BLUR (IMPROVED) ---
                roi = original_img[y1:y2, x1:x2]
                if roi.size > 0:
                    mask = np.zeros(roi.shape[:2], dtype=np.float32)
                    center = (roi.shape[1] // 2, roi.shape[0] // 2)
                    axes = (int(roi.shape[1] * 0.5), int(roi.shape[0] * 0.5))
                    cv2.ellipse(mask, center, axes, 0, 0, 360, 1.0, -1)
                    mask = cv2.GaussianBlur(mask, (51, 51), 0)
                    mask = np.expand_dims(mask, axis=-1)
                    blurred_roi = cv2.GaussianBlur(roi, (99, 99), 50)
                    blended = (roi * (1 - mask) + blurred_roi * mask).astype(np.uint8)
                    original_img[y1:y2, x1:x2] = blended
                
        import uuid
        blurred_filename = f"blurred_{uuid.uuid4().hex[:8]}_{group_filename}"
        blurred_path = os.path.join(UPLOAD_FOLDER, blurred_filename)
        cv2.imwrite(blurred_path, original_img)
        
        # Use dynamic scheme (http/https) to avoid broken images on localhost
        image_url = f"{request.scheme}://{request.host}/uploads/{blurred_filename}"
        
        return jsonify({
            'message': 'Success',
            'match_found': match_found,
            'image_url': image_url,
            'total_faces': len(results)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route('/api/search-photo', methods=['POST'])
def search_photo():
    """
    POST /api/search-photo
    ──────────────────────
    Upload any photo (group photo, event photo, etc.).
    DeepFace detects ALL faces in it and matches each against
    the PostgreSQL embeddings database.

    Request: multipart/form-data  { photo: <file> }

    Response:
    {
      "total_faces": 3,
      "results": [
        {
          "face_index": 1,
          "matched": true,
          "name": "Surya.jpg",
          "confidence": 84.2,
          "distance": 0.158,
          "box": { "x": 120, "y": 45, "w": 98, "h": 112 }
        },
        {
          "face_index": 2,
          "matched": false,
          "name": null,
          "confidence": null,
          "distance": null,
          "box": { "x": 300, "y": 60, "w": 90, "h": 105 }
        }
      ]
    }
    """
    import json
    from flask import Response as FlaskResponse

    print("\n[search-photo] --- Request received ---", flush=True)

    if 'photo' not in request.files:
        return jsonify({'error': 'No photo provided'}), 400

    file = request.files['photo']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    filename  = secure_filename(file.filename)
    photo_path = os.path.join(UPLOAD_FOLDER, f"search_{uuid.uuid4().hex[:8]}_{filename}")
    file.save(photo_path)
    print(f"[search-photo] Saved photo: {photo_path}", flush=True)

    def safe(val):
        """Convert any numpy scalar to a native Python type for JSON safety."""
        if isinstance(val, np.bool_):    return bool(val)
        if isinstance(val, np.integer):  return int(val)
        if isinstance(val, np.floating): return float(val)
        if isinstance(val, np.ndarray):  return val.tolist()
        return val

    try:
        # ── 1. Detect ALL faces ──────────────────────────────────────
        print("[search-photo] Running DeepFace.represent()...", flush=True)
        face_results = DeepFace.represent(
            img_path=photo_path,
            model_name="VGG-Face",
            enforce_detection=False,
            align=True,
            detector_backend="opencv"
        )
        print(f"[search-photo] Detected {len(face_results)} face(s)", flush=True)

        if not face_results:
            return FlaskResponse(
                json.dumps({'total_faces': 0, 'results': []}),
                mimetype='application/json', status=200
            )

        # ── 2. Load all DB embeddings once ───────────────────────────
        print("[search-photo] Loading DB embeddings...", flush=True)
        conn    = get_db_connection()
        cur     = conn.cursor()
        cur.execute("SELECT filename, embedding FROM face_embeddings")
        db_rows = cur.fetchall()
        cur.close()
        conn.close()
        print(f"[search-photo] Loaded {len(db_rows)} DB profiles", flush=True)

        # ── 3. Match each face against the DB ────────────────────────
        output = []
        for i, face_obj in enumerate(face_results):
            area     = face_obj['facial_area']
            face_emb = np.array(face_obj['embedding'])

            best_match    = None
            best_distance = float('inf')

            for row in db_rows:
                db_name = row[0]
                db_emb  = np.array(row[1])
                cos_sim  = float(np.dot(face_emb, db_emb) / (
                    np.linalg.norm(face_emb) * np.linalg.norm(db_emb)
                ))
                dist = float(1.0 - cos_sim)
                if dist < best_distance:
                    best_distance = dist
                    best_match    = db_name

            matched    = bool(best_distance <= THRESHOLD and best_match is not None)
            confidence = round(float((1.0 - best_distance) * 100), 1) if matched else None
            distance   = round(float(best_distance), 4) if matched else None

            print(f"[search-photo] Face #{i+1}: matched={matched}, name={best_match}, dist={best_distance:.4f}", flush=True)

            output.append({
                'face_index': int(i + 1),
                'matched':    matched,
                'name':       best_match if matched else None,
                'confidence': confidence,
                'distance':   distance,
                'box': {
                    'x': safe(area['x']),
                    'y': safe(area['y']),
                    'w': safe(area['w']),
                    'h': safe(area['h']),
                }
            })

        # ── 4. Blur unknown faces in original image ─────────────────
        print("[search-photo] Generating blurred image...", flush=True)
        orig_img = cv2.imread(photo_path)

        if orig_img is not None:
            for face_data in output:
                if not face_data['matched']:
                    box = face_data['box']
                    x, y, w, h = box['x'], box['y'], box['w'], box['h']

                    # Add padding so blur covers hairline/chin
                    pw = int(w * 0.25)
                    ph = int(h * 0.25)
                    y1 = max(0, y - ph);          y2 = min(orig_img.shape[0], y + h + ph)
                    x1 = max(0, x - pw);          x2 = min(orig_img.shape[1], x + w + pw)

                    roi = orig_img[y1:y2, x1:x2]
                    if roi.size > 0:
                        # Soft elliptical blur (same as existing blur-others endpoint)
                        mask = np.zeros(roi.shape[:2], dtype=np.float32)
                        center = (roi.shape[1] // 2, roi.shape[0] // 2)
                        axes   = (int(roi.shape[1] * 0.5), int(roi.shape[0] * 0.5))
                        cv2.ellipse(mask, center, axes, 0, 0, 360, 1.0, -1)
                        mask        = cv2.GaussianBlur(mask, (51, 51), 0)
                        mask        = np.expand_dims(mask, axis=-1)
                        blurred_roi = cv2.GaussianBlur(roi, (99, 99), 50)
                        blended     = (roi * (1 - mask) + blurred_roi * mask).astype(np.uint8)
                        orig_img[y1:y2, x1:x2] = blended

            blurred_name = f"blurred_{uuid.uuid4().hex[:8]}_{filename}"
            blurred_path = os.path.join(UPLOAD_FOLDER, blurred_name)
            cv2.imwrite(blurred_path, orig_img)
            blurred_url  = f"{request.scheme}://{request.host}/uploads/{blurred_name}"
            print(f"[search-photo] Blurred image saved: {blurred_name}", flush=True)
        else:
            blurred_url = None

        payload = {
            'total_faces':       len(output),
            'results':           output,
            'blurred_image_url': blurred_url,
        }
        print(f"[search-photo] Done - returning {len(output)} result(s)", flush=True)
        # Use raw json.dumps to bypass Flask JSON provider entirely
        return FlaskResponse(
            json.dumps(payload),
            mimetype='application/json',
            status=200
        )

    except Exception as e:
        import traceback
        print(f"[search-photo] ❌ ERROR: {e}", flush=True)
        traceback.print_exc()
        return FlaskResponse(
            json.dumps({'error': str(e)}),
            mimetype='application/json',
            status=500
        )
    finally:
        if os.path.exists(photo_path):
            os.remove(photo_path)


# ─────────────────────────────────────────────────────────────
#  LIVENESS INTEGRATION ENDPOINTS
#  These receive verified live face images from the React
#  face_liveliness app and run them through DeepFace recognition.
# ─────────────────────────────────────────────────────────────

def _decode_base64_image(image_base64: str) -> str:
    """
    Converts a base64 data URL (from canvas.toDataURL) into a temp JPEG file.
    Returns the temp file path so DeepFace can read it.

    The React app sends: "data:image/jpeg;base64,/9j/4AAQ..."
    We strip the header and decode the binary image bytes.
    """
    # Strip the data URL prefix ("data:image/jpeg;base64,")
    if ',' in image_base64:
        image_base64 = image_base64.split(',', 1)[1]

    image_bytes = base64.b64decode(image_base64)

    # Write to a temp file that DeepFace can open like a normal image path
    tmp_file = tempfile.NamedTemporaryFile(
        delete=False, suffix='.jpg', dir=UPLOAD_FOLDER
    )
    tmp_file.write(image_bytes)
    tmp_file.close()
    return tmp_file.name


@app.route('/api/liveness-verify', methods=['POST'])
def liveness_verify():
    """
    POST /api/liveness-verify
    ─────────────────────────
    Called by the React liveness app after a user passes liveness checks.
    Receives a verified live face snapshot and matches it against the
    face embeddings database.

    Request JSON:
    {
      "image_base64": "data:image/jpeg;base64,...",
      "liveness_score": 85,
      "verdict": "live",
      "checks": { "blinked": true, "movedHead": true, ... }
    }

    Response JSON (match found):
    {
      "matched": true,
      "profile": "Surya.jpg",
      "distance": 0.21,
      "liveness_score": 85
    }

    Response JSON (no match):
    {
      "matched": false,
      "message": "No matching profile found. You can enroll this face.",
      "liveness_score": 85
    }
    """
    data = request.get_json()
    if not data or 'image_base64' not in data:
        return jsonify({'error': 'image_base64 is required'}), 400

    liveness_score = data.get('liveness_score', 0)
    verdict        = data.get('verdict', '')

    # Safety gate: reject if liveness wasn't actually verified
    if verdict != 'live' or liveness_score < 70:
        return jsonify({'error': 'Liveness not verified. Score must be >= 70 with verdict=live'}), 403

    tmp_path = None
    try:
        # 1. Decode the base64 face image → temp file
        tmp_path = _decode_base64_image(data['image_base64'])

        # 2. Extract face embedding from the snapshot
        results = DeepFace.represent(
            img_path=tmp_path,
            model_name="VGG-Face",
            enforce_detection=False,   # face may not be perfect
            detector_backend="opencv"  # fast backend for webcam frames
        )
        if not results:
            return jsonify({'matched': False, 'message': 'No face detected in the snapshot'}), 200

        snapshot_emb = np.array(results[0]['embedding'])

        # 3. Compare against every stored profile in the DB
        conn = get_db_connection()
        cur  = conn.cursor()
        cur.execute("SELECT filename, embedding FROM face_embeddings")
        rows = cur.fetchall()
        cur.close()
        conn.close()

        best_match    = None
        best_distance = float('inf')

        for row in rows:
            db_filename = row[0]
            db_emb      = np.array(row[1])

            cosine_sim = np.dot(snapshot_emb, db_emb) / (
                np.linalg.norm(snapshot_emb) * np.linalg.norm(db_emb)
            )
            distance = 1.0 - cosine_sim

            if distance < best_distance:
                best_distance = distance
                best_match    = db_filename

        if best_distance <= THRESHOLD and best_match:
            return jsonify({
                'matched':        True,
                'profile':        best_match,
                'distance':       round(best_distance, 4),
                'liveness_score': liveness_score,
            }), 200
        else:
            return jsonify({
                'matched':        False,
                'message':        'No matching profile found. You can enroll this face.',
                'liveness_score': liveness_score,
            }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Always clean up the temp file
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.route('/api/liveness-enroll', methods=['POST'])
def liveness_enroll():
    """
    POST /api/liveness-enroll
    ─────────────────────────
    Enrolls a new face into the database using a verified liveness snapshot.
    Only accepts requests where liveness was genuinely verified.

    Request JSON:
    {
      "image_base64": "data:image/jpeg;base64,...",
      "name": "Dinesh",          # name for the profile (used as filename)
      "liveness_score": 85,
      "verdict": "live"
    }

    Response JSON:
    {
      "success": true,
      "profile": "Dinesh.jpg",
      "message": "Face enrolled successfully!"
    }
    """
    data = request.get_json()
    if not data or 'image_base64' not in data or 'name' not in data:
        return jsonify({'error': 'image_base64 and name are required'}), 400

    liveness_score = data.get('liveness_score', 0)
    verdict        = data.get('verdict', '')

    # Safety gate: only enroll genuinely live faces
    if verdict != 'live' or liveness_score < 70:
        return jsonify({'error': 'Liveness not verified. Cannot enroll.'}), 403

    name     = secure_filename(data['name'])
    filename = f"{name}.jpg"
    tmp_path = None

    try:
        # 1. Decode the base64 face image → temp file
        tmp_path = _decode_base64_image(data['image_base64'])

        # 2. Check for duplicate
        conn = get_db_connection()
        cur  = conn.cursor()
        cur.execute("SELECT 1 FROM face_embeddings WHERE filename = %s", (filename,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': f"Profile '{filename}' already exists."}), 409

        # 3. Extract embedding
        results = DeepFace.represent(
            img_path=tmp_path,
            model_name="VGG-Face",
            enforce_detection=False,
            detector_backend="opencv"
        )
        if not results:
            cur.close()
            conn.close()
            return jsonify({'error': 'No face detected in the snapshot'}), 400

        embedding = results[0]['embedding']

        # 4. Save the actual image to the db/ folder so it's visible in the UI
        db_img_path = os.path.join('db', filename)
        import shutil
        shutil.copy2(tmp_path, db_img_path)

        # 5. Insert into PostgreSQL
        cur.execute(
            "INSERT INTO face_embeddings (filename, embedding) VALUES (%s, %s)",
            (filename, embedding)
        )
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            'success': True,
            'profile': filename,
            'message': f"Face '{name}' enrolled successfully!"
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

# Initialize DB on startup (runs even under Gunicorn)
with app.app_context():
    init_db()

if __name__ == '__main__':
    app.run(port=5000, host="0.0.0.0", debug=True, use_reloader=False)
