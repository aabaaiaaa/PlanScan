import type { Point2D } from '../types'
import type {
  OpenCV,
  CvMat,
  CvKeyPointVector,
  CvDMatchVectorVector,
} from '../types/opencv'

/** A detected keypoint in an image */
export interface Keypoint {
  x: number
  y: number
  size: number
  angle: number
  response: number
  octave: number
}

/** A single feature match between two images */
export interface FeatureMatch {
  /** Index of keypoint in the first image */
  queryIdx: number
  /** Index of keypoint in the second image */
  trainIdx: number
  /** Match distance (lower = better) */
  distance: number
}

/** Features detected in a single photo */
export interface ImageFeatures {
  photoIndex: number
  keypoints: Keypoint[]
  /** Raw OpenCV descriptor Mat — kept for matching, must be deleted after use */
  descriptors: CvMat | null
}

/** A matched pair of photos with their inlier matches */
export interface MatchedPair {
  photoIndexA: number
  photoIndexB: number
  matches: FeatureMatch[]
  keypointsA: Keypoint[]
  keypointsB: Keypoint[]
  /** Matched point coordinates in image A */
  pointsA: Point2D[]
  /** Matched point coordinates in image B */
  pointsB: Point2D[]
}

/** Default Lowe's ratio for the ratio test */
const DEFAULT_RATIO_THRESHOLD = 0.75

/** Minimum number of matches to consider a pair valid */
const MIN_MATCH_COUNT = 8

/** Maximum number of ORB features to detect per image */
const MAX_FEATURES = 1000

/**
 * Convert keypoints from OpenCV's KeyPointVector to our Keypoint array.
 */
function extractKeypoints(kpVec: CvKeyPointVector): Keypoint[] {
  const keypoints: Keypoint[] = []
  for (let i = 0; i < kpVec.size(); i++) {
    const kp = kpVec.get(i)
    keypoints.push({
      x: kp.pt.x,
      y: kp.pt.y,
      size: kp.size,
      angle: kp.angle,
      response: kp.response,
      octave: kp.octave,
    })
  }
  return keypoints
}

/**
 * Detect ORB features in an image.
 *
 * @param cv - The OpenCV.js instance
 * @param imageData - Raw image data (from canvas getImageData)
 * @param photoIndex - Index of the photo in the session
 * @returns Detected features with keypoints and descriptors
 */
export function detectFeatures(
  cv: OpenCV,
  imageData: ImageData,
  photoIndex: number
): ImageFeatures {
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

  const keypoints = new cv.KeyPointVector()
  const descriptors = new cv.Mat()
  const mask = new cv.Mat()
  const orb = new cv.ORB(MAX_FEATURES)

  orb.detectAndCompute(gray, mask, keypoints, descriptors)

  const kpArray = extractKeypoints(keypoints)

  // Clean up intermediate mats
  src.delete()
  gray.delete()
  mask.delete()
  keypoints.delete()
  orb.delete()

  return {
    photoIndex,
    keypoints: kpArray,
    descriptors: kpArray.length > 0 ? descriptors : (() => { descriptors.delete(); return null })(),
  }
}

/**
 * Apply Lowe's ratio test to KNN matches (k=2).
 * Keeps only matches where the best match is significantly better than the second-best.
 */
export function applyRatioTest(
  knnMatches: CvDMatchVectorVector,
  ratioThreshold: number = DEFAULT_RATIO_THRESHOLD
): FeatureMatch[] {
  const goodMatches: FeatureMatch[] = []
  for (let i = 0; i < knnMatches.size(); i++) {
    const matchPair = knnMatches.get(i)
    if (matchPair.size() >= 2) {
      const best = matchPair.get(0)
      const secondBest = matchPair.get(1)
      if (best.distance < ratioThreshold * secondBest.distance) {
        goodMatches.push({
          queryIdx: best.queryIdx,
          trainIdx: best.trainIdx,
          distance: best.distance,
        })
      }
    }
  }
  return goodMatches
}

/**
 * Filter matches using RANSAC via the fundamental matrix.
 * Removes geometric outliers — matches that don't fit a consistent epipolar geometry.
 *
 * @returns Only the inlier matches
 */
export function filterWithRANSAC(
  cv: OpenCV,
  matches: FeatureMatch[],
  keypointsA: Keypoint[],
  keypointsB: Keypoint[]
): FeatureMatch[] {
  if (matches.length < MIN_MATCH_COUNT) {
    return matches
  }

  // Build point arrays for findFundamentalMat
  const pts1Data = new Float32Array(matches.length * 2)
  const pts2Data = new Float32Array(matches.length * 2)

  for (let i = 0; i < matches.length; i++) {
    const kpA = keypointsA[matches[i].queryIdx]
    const kpB = keypointsB[matches[i].trainIdx]
    pts1Data[i * 2] = kpA.x
    pts1Data[i * 2 + 1] = kpA.y
    pts2Data[i * 2] = kpB.x
    pts2Data[i * 2 + 1] = kpB.y
  }

  const pts1 = new cv.Mat()
  const pts2 = new cv.Mat()
  const mask = new cv.Mat()

  // Create Mat from float data: N rows x 1 col x 2 channels (CV_32FC2)
  Object.assign(pts1, { rows: matches.length, cols: 1, data32F: pts1Data })
  Object.assign(pts2, { rows: matches.length, cols: 1, data32F: pts2Data })

  let F: CvMat | null = null
  try {
    F = cv.findFundamentalMat(pts1, pts2, cv.FM_RANSAC, 3.0, 0.99, mask)

    // Extract inliers from mask
    const inliers: FeatureMatch[] = []
    for (let i = 0; i < matches.length; i++) {
      if (mask.data[i] !== 0) {
        inliers.push(matches[i])
      }
    }

    return inliers.length >= MIN_MATCH_COUNT ? inliers : matches
  } finally {
    pts1.delete()
    pts2.delete()
    mask.delete()
    if (F) F.delete()
  }
}

/**
 * Match features between two images using BFMatcher with Hamming distance
 * (appropriate for ORB binary descriptors), ratio test, and RANSAC filtering.
 */
export function matchFeaturesBetweenPair(
  cv: OpenCV,
  featuresA: ImageFeatures,
  featuresB: ImageFeatures,
  ratioThreshold: number = DEFAULT_RATIO_THRESHOLD
): MatchedPair | null {
  if (!featuresA.descriptors || !featuresB.descriptors) {
    return null
  }

  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false)
  const knnMatches = new cv.DMatchVectorVector()

  bf.knnMatch(featuresA.descriptors, featuresB.descriptors, knnMatches, 2)

  // Step 1: Ratio test
  let goodMatches = applyRatioTest(knnMatches, ratioThreshold)

  // Clean up OpenCV objects
  knnMatches.delete()
  bf.delete()

  if (goodMatches.length < MIN_MATCH_COUNT) {
    return null
  }

  // Step 2: RANSAC geometric filtering
  goodMatches = filterWithRANSAC(
    cv,
    goodMatches,
    featuresA.keypoints,
    featuresB.keypoints
  )

  if (goodMatches.length < MIN_MATCH_COUNT) {
    return null
  }

  // Build output point arrays
  const pointsA: Point2D[] = []
  const pointsB: Point2D[] = []
  for (const m of goodMatches) {
    const kpA = featuresA.keypoints[m.queryIdx]
    const kpB = featuresB.keypoints[m.trainIdx]
    pointsA.push({ x: kpA.x, y: kpA.y })
    pointsB.push({ x: kpB.x, y: kpB.y })
  }

  return {
    photoIndexA: featuresA.photoIndex,
    photoIndexB: featuresB.photoIndex,
    matches: goodMatches,
    keypointsA: featuresA.keypoints,
    keypointsB: featuresB.keypoints,
    pointsA,
    pointsB,
  }
}

/**
 * Run feature detection and matching across all photo pairs in a session.
 *
 * Detects features in each photo, then matches all sequential and nearby pairs.
 * Returns matched pairs that have sufficient inlier matches.
 *
 * @param cv - The OpenCV.js instance
 * @param images - Array of ImageData objects (one per photo)
 * @param ratioThreshold - Lowe's ratio test threshold (default 0.75)
 * @returns Array of matched photo pairs with their feature correspondences
 */
export function findMatchesAcrossPhotos(
  cv: OpenCV,
  images: { imageData: ImageData; photoIndex: number }[],
  ratioThreshold: number = DEFAULT_RATIO_THRESHOLD
): MatchedPair[] {
  if (images.length < 2) {
    return []
  }

  // Step 1: Detect features in all images
  const allFeatures: ImageFeatures[] = images.map(({ imageData, photoIndex }) =>
    detectFeatures(cv, imageData, photoIndex)
  )

  // Step 2: Match pairs — sequential plus nearby pairs (sliding window)
  const matchedPairs: MatchedPair[] = []
  const maxGap = Math.min(3, images.length - 1) // match up to 3 photos ahead

  for (let i = 0; i < allFeatures.length; i++) {
    for (let j = i + 1; j <= Math.min(i + maxGap, allFeatures.length - 1); j++) {
      const pair = matchFeaturesBetweenPair(
        cv,
        allFeatures[i],
        allFeatures[j],
        ratioThreshold
      )
      if (pair) {
        matchedPairs.push(pair)
      }
    }
  }

  // Clean up descriptor Mats
  for (const f of allFeatures) {
    if (f.descriptors) {
      f.descriptors.delete()
      f.descriptors = null
    }
  }

  return matchedPairs
}

/**
 * Release all OpenCV descriptor resources held by ImageFeatures.
 */
export function releaseFeatures(features: ImageFeatures[]): void {
  for (const f of features) {
    if (f.descriptors) {
      f.descriptors.delete()
      f.descriptors = null
    }
  }
}
