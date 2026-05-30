interface FaceApiType {
  nets: {
    tinyFaceDetector: { loadFromUri: (url: string) => Promise<void> }
    faceLandmark68TinyNet: { loadFromUri: (url: string) => Promise<void> }
    faceRecognitionNet: { loadFromUri: (url: string) => Promise<void> }
  }
  detectSingleFace: (
    input: HTMLVideoElement | HTMLCanvasElement,
    options: unknown
  ) => {
    withFaceLandmarks: () => {
      withFaceDescriptor: () => Promise<{ descriptor: Float32Array } | undefined>
    }
  }
  TinyFaceDetectorOptions: new (opts: { inputSize: number; scoreThreshold: number }) => unknown
  LabeledFaceDescriptors: new (label: string, descriptors: Float32Array[]) => unknown
  FaceMatcher: new (descriptors: unknown[], threshold?: number) => {
    findBestMatch: (descriptor: Float32Array) => { label: string; distance: number }
  }
  euclideanDistance: (a: Float32Array, b: Float32Array) => number
}

declare global {
  interface Window {
    faceapi: FaceApiType
  }
}

export {}
