import psycopg2
conn = psycopg2.connect(host='localhost', database='deepface', user='postgres', password='883842')
cur = conn.cursor()
cur.execute("DELETE FROM face_embeddings WHERE filename='vijay face.jpg'")
conn.commit()
cur.close()
conn.close()
print("Fixed! 'vijay face.jpg' was removed from the database.")
