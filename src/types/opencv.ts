/**
 * Type declarations for OpenCV.js APIs used in feature detection and matching.
 * These cover the subset of the cv namespace we rely on.
 */

export interface CvMat {
  rows: number
  cols: number
  data: Uint8Array
  data32F: Float32Array
  data64F: Float64Array
  delete(): void
  isContinuous(): boolean
  type(): number
  row(i: number): CvMat
}

export interface CvKeyPoint {
  pt: { x: number; y: number }
  size: number
  angle: number
  response: number
  octave: number
}

export interface CvKeyPointVector {
  size(): number
  get(i: number): CvKeyPoint
  delete(): void
}

export interface CvDMatch {
  queryIdx: number
  trainIdx: number
  distance: number
}

export interface CvDMatchVector {
  size(): number
  get(i: number): CvDMatch
  delete(): void
}

export interface CvDMatchVectorVector {
  size(): number
  get(i: number): CvDMatchVector
  delete(): void
}

export interface CvORB {
  detectAndCompute(
    image: CvMat,
    mask: CvMat,
    keypoints: CvKeyPointVector,
    descriptors: CvMat
  ): void
  delete(): void
}

export interface CvBFMatcher {
  knnMatch(
    queryDescriptors: CvMat,
    trainDescriptors: CvMat,
    matches: CvDMatchVectorVector,
    k: number
  ): void
  delete(): void
}

export interface OpenCV {
  Mat: new () => CvMat
  KeyPointVector: new () => CvKeyPointVector
  DMatchVectorVector: new () => CvDMatchVectorVector
  ORB: new (nfeatures?: number) => CvORB
  BFMatcher: new (normType: number, crossCheck: boolean) => CvBFMatcher

  matFromImageData(imageData: ImageData): CvMat
  matFromArray(rows: number, cols: number, type: number, array: number[]): CvMat
  cvtColor(src: CvMat, dst: CvMat, code: number): void
  findFundamentalMat(
    points1: CvMat,
    points2: CvMat,
    method: number,
    ransacReprojThreshold: number,
    confidence: number,
    mask: CvMat
  ): CvMat
  findEssentialMat(
    points1: CvMat,
    points2: CvMat,
    cameraMatrix: CvMat,
    method: number,
    prob: number,
    threshold: number,
    mask: CvMat
  ): CvMat
  recoverPose(
    E: CvMat,
    points1: CvMat,
    points2: CvMat,
    cameraMatrix: CvMat,
    R: CvMat,
    t: CvMat,
    mask: CvMat
  ): number

  // Constants
  NORM_HAMMING: number
  COLOR_RGBA2GRAY: number
  FM_RANSAC: number
  RANSAC: number
  CV_32FC2: number
  CV_64F: number
}
