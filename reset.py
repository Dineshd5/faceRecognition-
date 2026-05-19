import psycopg2
import os
import glob

try:
    # 1. Clear PostgreSQL Table
    conn = psycopg2.connect(host='localhost', database='deepface', user='postgres', password='883842', port='5432')
    cur = conn.cursor()
    cur.execute("DELETE FROM face_embeddings;")
    conn.commit()
    cur.close()
    conn.close()
    print("✅ Database records cleared.")

    # 2. Clear Local Image Folders
    for folder in ['db', 'uploads']:
        files = glob.glob(os.path.join(folder, '*'))
        for f in files:
            if f.endswith(('.jpg', '.jpeg', '.png')):
                os.remove(f)
    print("✅ Local image files cleared.")

except Exception as e:
    print(f"❌ Error: {e}")
