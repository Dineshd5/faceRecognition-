import os
import cv2
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from deepface import DeepFace
from werkzeug.utils import secure_filename
from app_postgres import init_db, get_db_connection, THRESHOLD

app = Flask(__name__)
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
            
        results = DeepFace.represent(img_path=filepath, model_name="VGG-Face", enforce_detection=True, detector_backend="retinaface")
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
                # Highlight in green
                # cv2.rectangle(original_img, (x1, y1), (x2, y2), (0, 255, 0), 3)
            else:
                # --- SOFT ELLIPTICAL BLUR (IMPROVED) ---
                roi = original_img[y1:y2, x1:x2]
                if roi.size > 0:
                    mask = np.zeros(roi.shape[:2], dtype=np.float32)
                    center = (roi.shape[1] // 2, roi.shape[0] // 2)
                    # Slightly larger axes to cover the whole face area
                    axes = (int(roi.shape[1] * 0.5), int(roi.shape[0] * 0.5))
                    cv2.ellipse(mask, center, axes, 0, 0, 360, 1.0, -1)
                    
                    # Feather the mask
                    mask = cv2.GaussianBlur(mask, (51, 51), 0)
                    mask = np.expand_dims(mask, axis=-1)
                    
                    # Heavier blur for better privacy
                    blurred_roi = cv2.GaussianBlur(roi, (99, 99), 50)
                    
                    blended = (roi * (1 - mask) + blurred_roi * mask).astype(np.uint8)
                    original_img[y1:y2, x1:x2] = blended
                
        import uuid
        blurred_filename = f"blurred_{uuid.uuid4().hex[:8]}_{group_filename}"
        blurred_path = os.path.join(UPLOAD_FOLDER, blurred_filename)
        cv2.imwrite(blurred_path, original_img)
        
        return jsonify({
            'message': 'Success',
            'match_found': match_found,
            'image_url': f"{request.host_url}uploads/{blurred_filename}",
            'total_faces': len(results)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

# Initialize DB on startup
with app.app_context():
    init_db()

if __name__ == '__main__':
    app.run(port=5000, host="0.0.0.0")
