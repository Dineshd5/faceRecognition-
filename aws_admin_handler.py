import json
import base64
import boto3
import os
import re

rekognition = boto3.client('rekognition')
EVENT_COLLECTION = os.environ.get('EVENT_COLLECTION', 'event_collection')

def sanitize_external_id(filename):
    clean_id = re.sub(r'[^a-zA-Z0-9_.\-:]', '_', filename)
    return clean_id[:255]

def handler(event, context):
    try:
        http_method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method')
        print(f"Received HTTP Method: {http_method}")
        
        # 1. Handle CORS Preflight
        if event.get('httpMethod') == 'OPTIONS' or event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
            requested_headers = event.get('headers', {}).get('access-control-request-headers', 'Content-Type, content-type')
            return {
                'statusCode': 200, 
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': requested_headers,
                    'Access-Control-Allow-Methods': '*'
                },
                'body': 'OK'
            }
            
        # 2. Parse payload
        body_str = event.get('body', '{}')
        if event.get('isBase64Encoded'):
            body_str = base64.b64decode(body_str).decode('utf-8')
            
        body = json.loads(body_str)
        filename = body.get('filename', 'unknown_photo.jpg')
        image_base64 = body.get('image')
        
        if not image_base64:
            return {
                'statusCode': 400, 
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'No image provided'})
            }
            
        # 3. Decode base64
        if ',' in image_base64:
            image_base64 = image_base64.split(',', 1)[1]
        image_bytes = base64.b64decode(image_base64)
        # 4. Save the actual photo to Amazon S3
        from botocore.client import Config
        s3 = boto3.client('s3', region_name='us-east-1', config=Config(signature_version='s3v4'))
        S3_BUCKET = os.environ.get('S3_BUCKET', 'face-app-photos-dinesh-998877')
        
        # Ensure bucket exists (creates it if it doesn't)
        try:
            s3.head_bucket(Bucket=S3_BUCKET)
        except:
            # us-east-1 is the default region and does not take a LocationConstraint
            s3.create_bucket(Bucket=S3_BUCKET)
            
        safe_filename = sanitize_external_id(filename)
            
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=safe_filename,
            Body=image_bytes,
            ContentType='image/jpeg'
        )
        
        # 5. Ensure collection exists
        try:
            rekognition.describe_collection(CollectionId=EVENT_COLLECTION)
        except rekognition.exceptions.ResourceNotFoundException:
            rekognition.create_collection(CollectionId=EVENT_COLLECTION)

        # 6. Index faces into Event Collection
        response = rekognition.index_faces(
            CollectionId=EVENT_COLLECTION,
            Image={'Bytes': image_bytes},
            ExternalImageId=safe_filename,
            MaxFaces=100,
            QualityFilter='AUTO'
        )
        
        face_records = response.get('FaceRecords', [])
        
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'message': 'Successfully saved to S3 and indexed face',
                'filename': safe_filename,
                'facesFound': len(face_records)
            })
        }
        
    except Exception as e:
        print("Error:", str(e))
        return {
            'statusCode': 500, 
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e)})
        }

lambda_handler = handler
