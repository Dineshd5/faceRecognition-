import argparse
import os
import cv2
import matplotlib.pyplot as plt
from deepface import DeepFace
import uuid
import psycopg2
import numpy as np

# --- POSTGRES DATABASE CONFIGURATION ---
# IMPORTANT: Update these credentials to match your local PostgreSQL setup
DB_HOST = "localhost"
DB_NAME = "deepface"  
DB_USER = "postgres"
DB_PASS = "883842" 
DB_PORT = "5432"

# VGG-Face uses 2622 dimensional vectors
VECTOR_DIMENSIONS = 2622
# DeepFace Cosine similarity threshold for VGG-Face (bumped up slightly for better matches)
THRESHOLD = 0.55

# Local folder just for storing the actual images for visualization
IMG_STORE = "db"

def get_db_connection():
    """Connect to PostgreSQL."""
    conn = psycopg2.connect(host=DB_HOST, database=DB_NAME, user=DB_USER, password=DB_PASS, port=DB_PORT)
    return conn

def init_db():
    """Initializes the image folder and PostgreSQL table."""
    if not os.path.exists(IMG_STORE):
        os.makedirs(IMG_STORE)
        
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Create table with standard array column (works without extensions!)
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS face_embeddings (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255),
                embedding REAL[]
            )
        """)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Database Initialization Error: {e}")
        print("Make sure PostgreSQL is running, credentials are correct, and the 'pgvector' extension is installed on your Postgres server!")

def extract_embedding(img_path):
    """Uses DeepFace to extract the mathematical face vector."""
    try:
        # represent returns a list of dictionaries (one for each face found)
        # We assume single face for profile photos
        results = DeepFace.represent(img_path=img_path, model_name="VGG-Face", enforce_detection=True, detector_backend="retinaface")
        if len(results) > 0:
            return results[0]["embedding"]
    except Exception as e:
        print(f"Error extracting embedding: {e}")
    return None

def add_photo(photo_path, filename=None):
    """Adds a photo to the Postgres DB and copies the image locally."""
    init_db()
    if not os.path.exists(photo_path):
        print(f"Error: Photo '{photo_path}' not found.")
        return
    
    if filename is None:
        filename = os.path.basename(photo_path)
        
    # Prevent Duplicate DB Entries
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM face_embeddings WHERE filename = %s", (filename,))
    if cur.fetchone():
        print(f"'{filename}' already exists in PostgreSQL. Skipping.")
        cur.close()
        conn.close()
        return
    cur.close()
    conn.close()
        
    destination = os.path.join(IMG_STORE, filename)
    
    # 1. Save image locally for display purposes later
    if os.path.abspath(photo_path) != os.path.abspath(destination):
        import shutil
        shutil.copy2(photo_path, destination)
    
    # 2. Extract Vector Embedding
    print(f"Extracting facial embeddings for {filename}...")
    embedding = extract_embedding(destination)
    
    if embedding is None:
        print("No face detected, cannot add to database.")
        return

    # 3. Save to PostgreSQL
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Insert the array into the REAL[] column
        cur.execute(
            "INSERT INTO face_embeddings (filename, embedding) VALUES (%s, %s)",
            (filename, embedding)
        )
        conn.commit()
        cur.close()
        conn.close()
        print(f"✅ Successfully saved '{filename}' into PostgreSQL Database!")
    except Exception as e:
        print(f"PostgreSQL Error: {e}")

def add_all_photos(directory):
    """Adds all images from a given directory into the Postgres DB."""
    if not os.path.exists(directory):
        print(f"Error: Directory '{directory}' not found.")
        return
        
    valid_exts = {".jpg", ".jpeg", ".png"}
    for filename in os.listdir(directory):
        ext = os.path.splitext(filename)[1].lower()
        if ext in valid_exts:
            photo_path = os.path.join(directory, filename)
            add_photo(photo_path, filename=filename)

def search_photo(photo_path):
    """Searches for faces in the photo using PostgreSQL vector search."""
    init_db()
    if not os.path.exists(photo_path):
        print(f"Error: Photo '{photo_path}' not found.")
        return
        
    print(f"Scanning '{photo_path}' and running Vector Search in Postgres...")
    
    original_img = cv2.imread(photo_path)
    original_img = cv2.cvtColor(original_img, cv2.COLOR_BGR2RGB)
    
    try:
        # 1. Extract ALL faces and their embeddings in one go using retinaface
        results = DeepFace.represent(img_path=photo_path, model_name="VGG-Face", enforce_detection=True, align=True, detector_backend="retinaface")
        print(f"\n✅ Total of {len(results)} faces identified in the group photo.\n")
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        for i, face_obj in enumerate(results):
            area = face_obj['facial_area']
            x, y, w, h = area['x'], area['y'], area['w'], area['h']
            embedding = face_obj['embedding']
            
            # Crop just for visualization/saving
            orig_bgr = cv2.cvtColor(original_img, cv2.COLOR_RGB2BGR)
            y1, y2 = max(0, y), min(orig_bgr.shape[0], y+h)
            x1, x2 = max(0, x), min(orig_bgr.shape[1], x+w)
            face_crop = orig_bgr[y1:y2, x1:x2]
            
            # 2. RUN SEARCH IN PYTHON MEMORY
            cur.execute("SELECT filename, embedding FROM face_embeddings")
            rows = cur.fetchall()
            
            matches = []
            target_emb = np.array(embedding)
            
            for row in rows:
                db_filename = row[0]
                db_emb = np.array(row[1])
                
                # Calculate Cosine Distance
                cosine_similarity = np.dot(target_emb, db_emb) / (np.linalg.norm(target_emb) * np.linalg.norm(db_emb))
                distance = 1.0 - cosine_similarity
                
                if distance <= THRESHOLD:
                    matches.append((db_filename, distance))
            
            # Sort all found matches by distance (closest first)
            matches.sort(key=lambda x: x[1])
            
            # Check if we have at least one match
            if matches:
                # We will display up to top 2 matches as references
                top_matches = matches[:2]
                
                best_match = top_matches[0][0]
                best_distance = top_matches[0][1]
                
                print(f"\n✅ Match found for Face #{i+1}!")
                print(f"Top Match: {best_match} (Distance: {best_distance:.4f})")
                if len(top_matches) > 1:
                    print(f"2nd Ref:   {top_matches[1][0]} (Distance: {top_matches[1][1]:.4f})")
                
                # Visualization
                cv2.rectangle(original_img, (x1, y1), (x2, y2), (0, 255, 0), 3)
                cv2.putText(original_img, f"Match: {best_match}", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0,255,0), 2)
                
                # Load images to display
                ref_images = []
                for m_filename, m_dist in top_matches:
                    m_path = os.path.join(IMG_STORE, m_filename)
                    if os.path.exists(m_path):
                        m_img = cv2.cvtColor(cv2.imread(m_path), cv2.COLOR_BGR2RGB)
                        ref_images.append((m_img, m_filename))
                        
                if ref_images:
                    # Create subplots for original + up to 2 references
                    fig, axes = plt.subplots(1, len(ref_images) + 1, figsize=(6 + 4 * len(ref_images), 6))
                    
                    # Ensure axes is iterable (it is, because N >= 2)
                    axes[0].imshow(original_img)
                    axes[0].set_title(f"Group Photo (Face #{i+1})")
                    axes[0].axis('off')
                    
                    for idx, (img, name) in enumerate(ref_images):
                        axes[idx + 1].imshow(img)
                        axes[idx + 1].set_title(f"Ref {idx+1}: {name}")
                        axes[idx + 1].axis('off')
                        
                    plt.show()
            else:
                print(f"\n❌ No database match found for Face #{i+1}.")
                # Auto-save unknown face directly to postgres!
                new_filename = f"unknown_face_{uuid.uuid4().hex[:8]}.jpg"
                
                # Insert into DB using the embedding we already extracted
                cur.execute(
                    "INSERT INTO face_embeddings (filename, embedding) VALUES (%s, %s)",
                    (new_filename, embedding)
                )
                conn.commit()
                
                # Save image locally
                save_path = os.path.join(IMG_STORE, new_filename)
                cv2.imwrite(save_path, face_crop)
                
                print(f"✅ Auto-saved unknown face as '{new_filename}' to PostgreSQL.")
                
                cv2.rectangle(original_img, (x1, y1), (x2, y2), (255, 0, 0), 3)
                cv2.putText(original_img, "Saved as Unknown", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 0, 0), 2)
                
                plt.figure(figsize=(8, 6))
                plt.imshow(original_img)
                plt.title(f"Face #{i+1} Auto-saved to Postgres")
                plt.axis('off')
                plt.show()
            
        cur.close()
        conn.close()

    except Exception as e:
        print(f"Search Error: {e}")

def blur_others(target_name, group_photo):
    """Blurs all faces in the group photo EXCEPT the person matching the target_name in DB."""
    if not os.path.exists(group_photo):
        print(f"Error: Group photo '{group_photo}' not found.")
        return
        
    print(f"Fetching profile '{target_name}' from PostgreSQL...")
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT embedding FROM face_embeddings WHERE filename = %s", (target_name,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    
    if row:
        target_emb = np.array(row[0])
    else:
        print(f"Profile not in DB. Checking if '{target_name}' is a local file...")
        if not os.path.exists(target_name):
            print(f"Error: Target '{target_name}' not found in Database OR as a local file.")
            return
        
        emb_list = extract_embedding(target_name)
        if emb_list is None:
            print("No face found in the target photo.")
            return
        target_emb = np.array(emb_list)
        
    print(f"Scanning group photo '{group_photo}' to blur others...")
    original_img = cv2.imread(group_photo)
    original_img_rgb = cv2.cvtColor(original_img, cv2.COLOR_BGR2RGB)
    
    try:
        results = DeepFace.represent(img_path=group_photo, model_name="VGG-Face", enforce_detection=True, align=True, detector_backend="retinaface")
        print(f"✅ Found {len(results)} total faces in the group photo.")
        
        target_emb_np = np.array(target_emb)
        match_found = False
        
        for face_obj in results:
            area = face_obj['facial_area']
            x, y, w, h = area['x'], area['y'], area['w'], area['h']
            face_emb = np.array(face_obj['embedding'])
            
            # Calculate Cosine Distance
            cosine_similarity = np.dot(target_emb_np, face_emb) / (np.linalg.norm(target_emb_np) * np.linalg.norm(face_emb))
            distance = 1.0 - cosine_similarity
            
            # Ensure boundaries are within image
            y1, y2 = max(0, y), min(original_img_rgb.shape[0], y+h)
            x1, x2 = max(0, x), min(original_img_rgb.shape[1], x+w)
            
            if distance <= THRESHOLD:
                match_found = True
                # Highlight the matched face
                cv2.rectangle(original_img_rgb, (x1, y1), (x2, y2), (0, 255, 0), 3)
                cv2.putText(original_img_rgb, "Target", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
            else:
                # Blur this non-matching face
                roi = original_img_rgb[y1:y2, x1:x2]
                blurred_roi = cv2.GaussianBlur(roi, (99, 99), 30)
                original_img_rgb[y1:y2, x1:x2] = blurred_roi
                
        if not match_found:
            print("Warning: The target person was NOT found in the group photo!")
            
        # Display the result
        plt.figure(figsize=(10, 8))
        plt.imshow(original_img_rgb)
        plt.title(f"Group Photo (Only Target '{os.path.basename(target_name)}' visible)")
        plt.axis('off')
        plt.show()
        
        # Save blurred image
        save_path = "blurred_" + os.path.basename(group_photo)
        cv2.imwrite(save_path, cv2.cvtColor(original_img_rgb, cv2.COLOR_BGR2RGB))
        print(f"✅ Saved the blurred image as '{save_path}'")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PostgreSQL Face Recognition Matcher")
    subparsers = parser.add_subparsers(dest="command")
    
    parser_add = subparsers.add_parser("add")
    parser_add.add_argument("photo", type=str)
    
    parser_add_all = subparsers.add_parser("add-all")
    parser_add_all.add_argument("directory", type=str)
    
    parser_search = subparsers.add_parser("search")
    parser_search.add_argument("photo", type=str)
    
    parser_blur = subparsers.add_parser("blur-others")
    parser_blur.add_argument("target", type=str, help="The reference photo of the person to keep")
    parser_blur.add_argument("group", type=str, help="The group photo to blur others in")
    
    args = parser.parse_args()
    
    if args.command == "add":
        add_photo(args.photo)
    elif args.command == "add-all":
        add_all_photos(args.directory)
    elif args.command == "search":
        search_photo(args.photo)
    elif args.command == "blur-others":
        blur_others(args.target, args.group)
    else:
        parser.print_help()
