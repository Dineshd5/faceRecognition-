from deepface import DeepFace
import numpy as np

img1 = "ActorSurya.jpg"
img2 = "SuryaKen.jpg"

try:
    res1 = DeepFace.represent(img1, model_name="VGG-Face")[0]['embedding']
    res2 = DeepFace.represent(img2, model_name="VGG-Face", enforce_detection=True, align=True)
    
    print("\n--- Distances ---")
    for i, face in enumerate(res2):
        emb2 = face['embedding']
        target_emb = np.array(res1)
        db_emb = np.array(emb2)
        cosine_similarity = np.dot(target_emb, db_emb) / (np.linalg.norm(target_emb) * np.linalg.norm(db_emb))
        distance = 1.0 - cosine_similarity
        print(f"Face {i+1} Distance to ActorSurya.jpg: {distance:.4f}")
except Exception as e:
    print(e)
