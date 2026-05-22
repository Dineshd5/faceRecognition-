import json
import base64
import boto3
import uuid
import os

# Initialize AWS Rekognition client
# This uses the Lambda execution role permissions automatically
rekognition = boto3.client('rekognition')

# Configuration from environment variables
EVENT_COLLECTION = os.environ.get('EVENT_COLLECTION', 'event_collection')
USER_COLLECTION = os.environ.get('USER_COLLECTION', 'user_collection')
MATCH_THRESHOLD = float(os.environ.get('MATCH_THRESHOLD', '95.0'))

def handler(event, context):
    try:
        # 1. Handle CORS Preflight (OPTIONS request) from the browser
        if event.get('httpMethod') == 'OPTIONS' or event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
            return build_response(200, 'OK')
            
        # 2. Parse the incoming JSON payload from the React App
        body_str = event.get('body', '{}')
        # API Gateway sometimes base64 encodes the body, handle that
        if event.get('isBase64Encoded'):
            body_str = base64.b64decode(body_str).decode('utf-8')
            
        body = json.loads(body_str)
        
        image_base64 = body.get('image')
        session_id = body.get('sessionId')
        liveness_score = body.get('livenessScore', 0)
        
        if not image_base64:
            return build_response(400, {'error': 'No image provided'})
            
        # ── STEP 5: Face Liveness Security Gate ──
        if liveness_score < 70:
            return build_response(403, {'error': 'Liveness check failed. Rejecting selfie.'})
            
        # 3. Decode the base64 selfie image into raw bytes in memory
        # The React app sends "data:image/jpeg;base64,/9j/4AAQ..."
        if ',' in image_base64:
            image_base64 = image_base64.split(',', 1)[1]
            
        image_bytes = base64.b64decode(image_base64)
        
        def ensure_collection(collection_id):
            try:
                rekognition.describe_collection(CollectionId=collection_id)
            except rekognition.exceptions.ResourceNotFoundException:
                rekognition.create_collection(CollectionId=collection_id)
                print(f"Auto-created collection: {collection_id}")

        # Ensure collections exist so we don't crash if CloudShell was skipped
        ensure_collection(EVENT_COLLECTION)
        ensure_collection(USER_COLLECTION)
        
        # ── STEP 5.5: Check if user already exists (Search user_collection) ──
        existing_user_id = None
        try:
            user_search_response = rekognition.search_faces_by_image(
                CollectionId=USER_COLLECTION,
                Image={'Bytes': image_bytes},
                FaceMatchThreshold=90.0,
                MaxFaces=1
            )
            matches = user_search_response.get('FaceMatches', [])
            if len(matches) > 0:
                # User already exists! Grab their saved ID.
                existing_user_id = matches[0].get('Face', {}).get('ExternalImageId')
        except Exception as e:
            # If the user_collection is completely empty (0 faces), AWS throws an InvalidParameterException.
            # We can safely ignore it, it just means they are the very first user!
            pass

        # ── STEP 6: SearchFacesByImage (event_collection) ──
        # Search the event photos to see if this user appears in any of them
        # Note: Rekognition accepts image 'Bytes' directly, no S3 required!
        search_response = rekognition.search_faces_by_image(
            CollectionId=EVENT_COLLECTION,
            Image={'Bytes': image_bytes},
            FaceMatchThreshold=MATCH_THRESHOLD,
            MaxFaces=100
        )
        
        # ── STEP 6: Generate Pre-signed URLs for Matches ──
        from botocore.client import Config
        s3 = boto3.client('s3', region_name='us-east-1', config=Config(signature_version='s3v4'))
        S3_BUCKET = os.environ.get('S3_BUCKET', 'face-app-photos-dinesh-998877')
        
        matched_photos = []
        for match in search_response.get('FaceMatches', []):
            face = match.get('Face', {})
            photo_key = face.get('ExternalImageId')
            similarity = match.get('Similarity')
            if photo_key:
                # Generate a pre-signed URL valid for 1 hour (3600 seconds)
                try:
                    presigned_url = s3.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': S3_BUCKET, 'Key': photo_key},
                        ExpiresIn=3600
                    )
                except Exception as e:
                    print(f"Error generating presigned URL for {photo_key}: {e}")
                    presigned_url = None

                matched_photos.append({
                    'photoId': photo_key,
                    'similarity': round(similarity, 2),
                    'url': presigned_url
                })
                
        # ── STEP 8: IndexFaces (user_collection) ONLY IF NEW USER ──
        if existing_user_id:
            user_id = existing_user_id
            is_new_user = False
        else:
            # Brand new user: Store the verified face fingerprint as a master identity
            user_id = f"user_{uuid.uuid4().hex[:8]}"
            is_new_user = True
            
            index_response = rekognition.index_faces(
                CollectionId=USER_COLLECTION,
                Image={'Bytes': image_bytes},
                ExternalImageId=user_id,
                MaxFaces=1, # It's a selfie, should only have 1 primary face
                QualityFilter='AUTO'
            )
        
        # ── STEP 9: Delete Selfie ──
        # Because we passed the image as 'Bytes' directly to Rekognition in RAM, 
        # it was never saved to S3 or disk in the first place! 
        # As soon as this function returns, the selfie is destroyed. 
        # Ultimate privacy achieved automatically.
        
        # ── STEP 7: Save Matches & Return to Frontend ──
        # In a real app, you would save user_id and matched_photos to MongoDB/Postgres here
        
        return build_response(200, {
            'message': 'Verification complete',
            'userId': user_id,
            'isNewUser': is_new_user,
            'livenessScore': liveness_score,
            'matchesFound': len(matched_photos),
            'matchedPhotos': matched_photos
        })
        
    except Exception as e:
        print("Error:", str(e))
        return build_response(500, {'error': 'Internal server error', 'details': str(e)})

def build_response(status_code, body_dict):
    """Helper to build AWS Lambda Function URL compatible responses"""
    return {
        'statusCode': status_code,
        'body': json.dumps(body_dict) if isinstance(body_dict, dict) else body_dict
    }

# Compatibility alias for default lambda handler
lambda_handler = handler
