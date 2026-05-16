from deepface import DeepFace
print('Testing OpenCV...')
try:
    res1 = DeepFace.represent('RajiniKanthGroup.jpg', enforce_detection=True)
    print(f'OpenCV found: {len(res1)}')
except Exception as e: print(e)

print('Testing MTCNN...')
try:
    res2 = DeepFace.represent('RajiniKanthGroup.jpg', enforce_detection=True, detector_backend='mtcnn')
    print(f'MTCNN found: {len(res2)}')
except Exception as e: print(e)

print('Testing RetinaFace...')
try:
    res3 = DeepFace.represent('RajiniKanthGroup.jpg', enforce_detection=True, detector_backend='retinaface')
    print(f'RetinaFace found: {len(res3)}')
except Exception as e: print(e)
