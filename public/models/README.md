# Face-API.js Models

Place the following model files in this directory for face recognition to work.

## Required Files

Download from: https://github.com/justadudewhohacks/face-api.js/tree/master/weights

### Tiny Face Detector
- `tiny_face_detector_model-weights_manifest.json`
- `tiny_face_detector_model-shard1`

### Face Landmark 68 Tiny Net
- `face_landmark_68_tiny_model-weights_manifest.json`
- `face_landmark_68_tiny_model-shard1`

### Face Recognition Net
- `face_recognition_model-weights_manifest.json`
- `face_recognition_model-shard1`
- `face_recognition_model-shard2`

## Download Script

```bash
cd public/models
BASE_URL="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

# Tiny Face Detector
wget $BASE_URL/tiny_face_detector_model-weights_manifest.json
wget $BASE_URL/tiny_face_detector_model-shard1

# Face Landmark 68 Tiny
wget $BASE_URL/face_landmark_68_tiny_model-weights_manifest.json
wget $BASE_URL/face_landmark_68_tiny_model-shard1

# Face Recognition
wget $BASE_URL/face_recognition_model-weights_manifest.json
wget $BASE_URL/face_recognition_model-shard1
wget $BASE_URL/face_recognition_model-shard2
```

## Note

The face recognition feature will show a loading error if these files are not present.
QR Code scanning will work as a fallback without these files.
