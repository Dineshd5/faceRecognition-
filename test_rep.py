from deepface import DeepFace
img_path = "Thalapathy_vijay_varisu.jpeg"
try:
    results = DeepFace.represent(img_path=img_path, model_name="VGG-Face", enforce_detection=True)
    for i, res in enumerate(results):
        print(f"Face {i}: area={res.get('facial_area')}, emb_len={len(res.get('embedding', []))}")
except Exception as e:
    print(e)
