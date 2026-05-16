import psycopg2
conn = psycopg2.connect(host='localhost', database='deepface', user='postgres', password='883842', port='5432')
cur = conn.cursor()
cur.execute("DELETE FROM face_embeddings;")
conn.commit()
cur.close()
conn.close()
