# 📸 PostgreSQL Face Recognition Engine - Complete Guide

Welcome to your brand-new, powerful face recognition engine! This tool is fully backed by PostgreSQL and uses DeepFace (VGG-Face) to create a highly accurate, mathematical "Knowledge Graph" of people's faces.

Below are the complete instructions on how to manage your database and use all the commands.

---

## 1. Setup Your Master Database (`add`)
Before the system can identify anyone, it needs to know who they are. To teach the system a person's face, you must add a **solo photo** (a profile picture containing ONLY that person) to the database.

**Command:**
```powershell
.\.venv\Scripts\python.exe app_postgres.py add "person_name.jpg"
```
**Example:**
```powershell
.\.venv\Scripts\python.exe app_postgres.py add "vjface_.jpg"
```
*What this does: It extracts the exact facial mathematics of the person and permanently saves it into PostgreSQL under that filename.*

---

## 2. Bulk Import Previous Photos (`add-all`)
If you have an entire folder of solo profile pictures, you don't have to add them one by one. You can bulk import them!

**Command:**
```powershell
.\.venv\Scripts\python.exe app_postgres.py add-all "folder_name"
```
**Example:**
```powershell
.\.venv\Scripts\python.exe app_postgres.py add-all "db"
```
*What this does: It scans every image in the folder and adds them to your Postgres database. It is smart enough to skip duplicates.*

---

## 3. Search and Identify Group Photos (`search`)
Once you have your master profiles added, you can run any group photo through the engine. 

**Command:**
```powershell
.\.venv\Scripts\python.exe app_postgres.py search "group_photo.jpg"
```
**Example:**
```powershell
.\.venv\Scripts\python.exe app_postgres.py search "Thalapathy_vijay_varisu.jpeg"
```

**What this does:**
1. Prints exactly how many faces were found in the photo.
2. Identifies anyone it already knows from the database and shows up to **2 reference images** of them!
3. **The Magic:** If it finds a stranger it *doesn't* know, it automatically extracts their face, assigns them a unique ID (e.g., `unknown_face_1234`), and permanently saves them to the database! If they ever appear in another photo, the system will recognize them.

---

## 4. The Privacy Filter (`blur-others`)
If you want to isolate a specific person in a group photo (for privacy or highlighting), you can use the blur tool!

**Command:**
```powershell
.\.venv\Scripts\python.exe app_postgres.py blur-others "target_profile.jpg" "group_photo.jpg"
```
**Example:**
```powershell
.\.venv\Scripts\python.exe app_postgres.py blur-others "vjface_.jpg" "Thalapathy_vijay_varisu.jpeg"
```

**What this does:**
1. It looks up `"vjface_.jpg"` directly in your PostgreSQL database.
2. It scans the group photo and draws a green box around the target person.
3. It heavily **blurs every other face** in the picture.
4. It saves a brand new image locally (e.g., `blurred_Thalapathy_vijay_varisu.jpeg`).

---

## 5. Starting Fresh (The Clean Slate)
If you ever want to wipe the database clean and delete all the saved images/unknown strangers to start from scratch, you can run the quick cleanup script we made.

**Command:**
```powershell
.\.venv\Scripts\python.exe -c "import psycopg2, os, glob; conn=psycopg2.connect(host='localhost', database='deepface', user='postgres', password='883842'); cur=conn.cursor(); cur.execute('DELETE FROM face_embeddings;'); conn.commit(); cur.close(); conn.close(); [os.remove(f) for f in glob.glob('db/*') if f.endswith(('.jpg', '.jpeg', '.png'))]; print('ALL CLEARED!')"
```
