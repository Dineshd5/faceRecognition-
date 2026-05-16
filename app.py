import argparse
import os
import shutil
import cv2
import matplotlib.pyplot as plt
from deepface import DeepFace
import uuid

DB_PATH = "db"

def init_db():
    """Initializes the database directory if it doesn't exist."""
    if not os.path.exists(DB_PATH):
        os.makedirs(DB_PATH)
        print(f"Initialized empty database at {DB_PATH}/")

def add_photo(photo_path):
    """Adds a photo to the database and generates embeddings."""
    init_db()
    if not os.path.exists(photo_path):
        print(f"Error: Photo '{photo_path}' not found.")
        return
    
    filename = os.path.basename(photo_path)
    destination = os.path.join(DB_PATH, filename)
    
    # Copy the photo to the DB directory
    shutil.copy2(photo_path, destination)
    print(f"Successfully added '{filename}' to the database.")
    
    # Trigger an embedding update so search is faster later
    print("Generating embeddings for the database (this may take a moment)...")
    try:
        # We do a dummy extraction to let deepface cache representations
        DeepFace.represent(img_path=destination, enforce_detection=False)
        print("Embeddings generated/updated.")
    except Exception as e:
        print(f"Note: Embeddings will be generated on the first search. ({e})")

def search_photo(photo_path):
    """Searches for faces in the uploaded photo against the database."""
    init_db()
    if not os.path.exists(photo_path):
        print(f"Error: Photo '{photo_path}' not found.")
        return
    
    # Check if there are any valid image files in DB
    db_files = [f for f in os.listdir(DB_PATH) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    if len(db_files) == 0:
        print("Database is empty. Please add photos first using the 'add' command.")
        return
        
    print(f"Scanning '{photo_path}' for faces and matching against the database...")
    
    try:
        # Extract faces to get bounding boxes for unknown faces
        faces = DeepFace.extract_faces(
            img_path=photo_path,
            enforce_detection=True,
            detector_backend="opencv"
        )
        
        # DeepFace.find returns a list of DataFrames (one DataFrame per face found in the source image)
        # enforce_detection=True ensures we actually find faces.
        dfs = DeepFace.find(
            img_path=photo_path, 
            db_path=DB_PATH, 
            enforce_detection=True, 
            detector_backend="opencv", # opencv is lightweight and fast for prototyping
            silent=True
        )
        
        # Load original image for visualization
        original_img = cv2.imread(photo_path)
        original_img = cv2.cvtColor(original_img, cv2.COLOR_BGR2RGB)
        
        matches_found = False
        
        for i, df in enumerate(dfs):
            # Each df corresponds to a face detected in the uploaded photo
            if not df.empty:
                matches_found = True
                print(f"\n✅ Match found for Face #{i+1}!")
                
                # The first row is the best match
                best_match = df.iloc[0]
                matched_identity = best_match['identity']
                
                print(f"Matched with database photo: {os.path.basename(matched_identity)}")
                
                # Draw a rectangle around the detected face in the original image (if source coordinates are available)
                if 'source_x' in best_match and 'source_y' in best_match:
                    sx, sy, sw, sh = int(best_match['source_x']), int(best_match['source_y']), int(best_match['source_w']), int(best_match['source_h'])
                    cv2.rectangle(original_img, (sx, sy), (sx+sw, sy+sh), (0, 255, 0), 3)
                    cv2.putText(original_img, f"Match: {os.path.basename(matched_identity)}", (sx, sy-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0,255,0), 2)
                
                # Display the matched image
                matched_img = cv2.imread(matched_identity)
                if matched_img is not None:
                    matched_img = cv2.cvtColor(matched_img, cv2.COLOR_BGR2RGB)
                    
                    # Also draw rectangle on the target image if coordinates exist
                    if 'target_x' in best_match and 'target_y' in best_match:
                         tx, ty, tw, th = int(best_match['target_x']), int(best_match['target_y']), int(best_match['target_w']), int(best_match['target_h'])
                         cv2.rectangle(matched_img, (tx, ty), (tx+tw, ty+th), (0, 255, 0), 3)
                    
                    # Plot side-by-side
                    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6))
                    ax1.imshow(original_img)
                    ax1.set_title(f"Uploaded Photo (Processing Face #{i+1})")
                    ax1.axis('off')
                    
                    ax2.imshow(matched_img)
                    ax2.set_title(f"Best Match from DB: {os.path.basename(matched_identity)}")
                    ax2.axis('off')
                    
                    plt.tight_layout()
                    plt.show()
                else:
                    print(f"Could not load matched image: {matched_identity}")
            else:
                print(f"\n❌ No database match found for Face #{i+1} in the uploaded photo.")
                
                # Auto-save unknown face
                if i < len(faces):
                    area = faces[i]['facial_area']
                    x, y, w, h = area['x'], area['y'], area['w'], area['h']
                    
                    # Original image was converted to RGB, but we need BGR for saving with cv2
                    orig_bgr = cv2.cvtColor(original_img, cv2.COLOR_RGB2BGR)
                    
                    y1, y2 = max(0, y), min(orig_bgr.shape[0], y+h)
                    x1, x2 = max(0, x), min(orig_bgr.shape[1], x+w)
                    face_crop = orig_bgr[y1:y2, x1:x2]
                    
                    if face_crop.size > 0:
                        new_filename = f"unknown_face_{uuid.uuid4().hex[:8]}.jpg"
                        save_path = os.path.join(DB_PATH, new_filename)
                        cv2.imwrite(save_path, face_crop)
                        print(f"✅ Auto-saved unknown face as '{new_filename}' for future recognition.")
                        
                        # Draw red rectangle on original image for visualization
                        cv2.rectangle(original_img, (x1, y1), (x2, y2), (255, 0, 0), 3)
                        cv2.putText(original_img, "Saved as Unknown", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 0, 0), 2)
                        
                        # Show the original image with the new unknown face highlighted
                        plt.figure(figsize=(8, 6))
                        plt.imshow(original_img)
                        plt.title(f"Uploaded Photo - Face #{i+1} Auto-saved")
                        plt.axis('off')
                        plt.tight_layout()
                        plt.show()

        if not matches_found:
            print("\nNo faces in the uploaded photo matched anyone in your database.")
            
    except ValueError as ve:
        if "Face could not be detected" in str(ve):
            print("No faces could be detected in the uploaded photo.")
        else:
            print(f"Value Error: {ve}")
    except Exception as e:
        print(f"An error occurred during search: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Photographer Terminal App - Face Recognition Matcher")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Add command
    parser_add = subparsers.add_parser("add", help="Add a known photo to the database")
    parser_add.add_argument("photo", type=str, help="Path to the photo you want to add to the DB")
    
    # Search command
    parser_search = subparsers.add_parser("search", help="Upload a photo and search for matches in the DB (supports group photos)")
    parser_search.add_argument("photo", type=str, help="Path to the uploaded photo to search against the DB")
    
    args = parser.parse_args()
    
    if args.command == "add":
        add_photo(args.photo)
    elif args.command == "search":
        search_photo(args.photo)
    else:
        parser.print_help()
