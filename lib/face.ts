'use client'

// Extracts the face descriptor (the numeric encoding used for recognition)
// from a photo, in the browser. Registering a photo without this leaves the
// employee unrecognised by the scanners, so both employee forms run it at
// save time instead of leaving it to the first scanner session.

let modelsLoaded = false

async function loadFaceApi() {
  const faceapi = await import('face-api.js')
  if (!modelsLoaded && !faceapi.nets.tinyFaceDetector.isLoaded) {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ])
  }
  modelsLoaded = true
  return faceapi
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img')
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    setTimeout(() => reject(new Error('timeout')), 15000)
    img.src = src
  })
}

/**
 * Returns the descriptor as a JSON string ready to store, or null when no
 * face could be detected in the photo.
 */
export async function extractFaceDescriptor(photoDataUrl: string): Promise<string | null> {
  try {
    const faceapi = await loadFaceApi()
    const img = await loadImage(photoDataUrl)
    // Larger inputSize than the live scanner: a still photo is worth the
    // extra accuracy, and this runs once.
    const det = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor()
    if (!det) return null
    return JSON.stringify(Array.from(det.descriptor))
  } catch {
    return null
  }
}
