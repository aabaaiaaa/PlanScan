import type { CameraPose, Point3D } from '../types'
import type { OpenCV, CvMat } from '../types/opencv'
import type { MatchedPair } from './featureDetection'

/** Minimum number of matched points required for reliable pose estimation */
const MIN_POINTS_FOR_POSE = 8

/**
 * Create an identity 3x3 rotation matrix in row-major order (9 elements).
 */
export function identityRotation(): number[] {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1]
}

/**
 * Multiply two 3x3 matrices stored in row-major order.
 * Result = A * B
 */
export function multiplyMatrices3x3(a: number[], b: number[]): number[] {
  const result: number[] = new Array(9)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      result[r * 3 + c] =
        a[r * 3 + 0] * b[0 * 3 + c] +
        a[r * 3 + 1] * b[1 * 3 + c] +
        a[r * 3 + 2] * b[2 * 3 + c]
    }
  }
  return result
}

/**
 * Multiply a 3x3 rotation matrix (row-major) by a 3D point.
 */
export function rotatePoint(rotation: number[], point: Point3D): Point3D {
  return {
    x: rotation[0] * point.x + rotation[1] * point.y + rotation[2] * point.z,
    y: rotation[3] * point.x + rotation[4] * point.y + rotation[5] * point.z,
    z: rotation[6] * point.x + rotation[7] * point.y + rotation[8] * point.z,
  }
}

/**
 * Transpose a 3x3 matrix stored in row-major order.
 */
export function transposeMatrix3x3(m: number[]): number[] {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]
}

/**
 * Estimate camera intrinsics from image dimensions.
 *
 * Uses the common approximation:
 * - focal length = max(width, height)
 * - principal point at image center
 *
 * @returns The 3x3 intrinsics matrix K as a flat row-major array
 */
export function estimateCameraIntrinsics(
  imageWidth: number,
  imageHeight: number
): number[] {
  const f = Math.max(imageWidth, imageHeight)
  const cx = imageWidth / 2
  const cy = imageHeight / 2
  return [f, 0, cx, 0, f, cy, 0, 0, 1]
}

/** Relative pose between two camera views */
export interface RelativePose {
  /** 3x3 rotation matrix in row-major order */
  rotation: number[]
  /** Unit translation vector */
  translation: Point3D
  /** Number of inlier points from pose recovery */
  inlierCount: number
}

/**
 * Estimate the relative camera pose between two views from matched feature points.
 *
 * Computes the essential matrix from point correspondences and decomposes it
 * into a rotation and unit translation using OpenCV's findEssentialMat + recoverPose.
 *
 * @param cv - OpenCV.js instance
 * @param matchedPair - Feature matches between two photos
 * @param cameraMatrix - 3x3 camera intrinsics matrix (as OpenCV Mat)
 * @returns The relative pose (R, t), or null if estimation fails
 */
export function estimateRelativePose(
  cv: OpenCV,
  matchedPair: MatchedPair,
  cameraMatrix: CvMat
): RelativePose | null {
  if (matchedPair.pointsA.length < MIN_POINTS_FOR_POSE) {
    return null
  }

  // Build point arrays for OpenCV
  const pts1Data = new Float32Array(matchedPair.pointsA.length * 2)
  const pts2Data = new Float32Array(matchedPair.pointsB.length * 2)
  for (let i = 0; i < matchedPair.pointsA.length; i++) {
    pts1Data[i * 2] = matchedPair.pointsA[i].x
    pts1Data[i * 2 + 1] = matchedPair.pointsA[i].y
    pts2Data[i * 2] = matchedPair.pointsB[i].x
    pts2Data[i * 2 + 1] = matchedPair.pointsB[i].y
  }

  const pts1 = new cv.Mat()
  const pts2 = new cv.Mat()
  Object.assign(pts1, { rows: matchedPair.pointsA.length, cols: 1, data32F: pts1Data })
  Object.assign(pts2, { rows: matchedPair.pointsB.length, cols: 1, data32F: pts2Data })

  const mask = new cv.Mat()
  let E: CvMat | null = null
  const R = new cv.Mat()
  const t = new cv.Mat()

  try {
    // Compute essential matrix using RANSAC
    E = cv.findEssentialMat(pts1, pts2, cameraMatrix, cv.RANSAC, 0.999, 1.0, mask)

    if (!E || E.rows < 3 || E.cols < 3) {
      return null
    }

    // Decompose essential matrix into rotation and translation
    const inlierCount = cv.recoverPose(E, pts1, pts2, cameraMatrix, R, t, mask)

    if (inlierCount < MIN_POINTS_FOR_POSE) {
      return null
    }

    // Extract rotation (3x3 doubles, row-major)
    const rData = R.data64F
    const rotation: number[] = []
    for (let i = 0; i < 9; i++) {
      rotation.push(rData[i])
    }

    // Extract translation (3x1 doubles)
    const tData = t.data64F
    const translation: Point3D = { x: tData[0], y: tData[1], z: tData[2] }

    return { rotation, translation, inlierCount }
  } finally {
    pts1.delete()
    pts2.delete()
    mask.delete()
    R.delete()
    t.delete()
    if (E) E.delete()
  }
}

/**
 * Chain a relative pose onto an absolute pose to compute a new absolute pose.
 *
 * Given camera A's absolute pose and the relative transform from A to B,
 * computes camera B's absolute pose:
 *   R_B = R_rel * R_A
 *   position_B = position_A + inv(R_A) * translation_rel
 */
export function chainPose(
  absolutePose: CameraPose,
  relativePose: RelativePose
): CameraPose {
  const newRotation = multiplyMatrices3x3(relativePose.rotation, absolutePose.rotation)

  // Transform the relative translation from camera frame to world frame
  // inv(R) = R^T for rotation matrices
  const rotInverse = transposeMatrix3x3(absolutePose.rotation)
  const worldTranslation = rotatePoint(rotInverse, relativePose.translation)

  return {
    position: {
      x: absolutePose.position.x + worldTranslation.x,
      y: absolutePose.position.y + worldTranslation.y,
      z: absolutePose.position.z + worldTranslation.z,
    },
    rotation: newRotation,
  }
}

/**
 * Estimate camera poses for all photos from matched feature pairs.
 *
 * Starts from the first photo at the origin with identity rotation, then
 * traverses the matching graph via BFS to chain relative poses into absolute poses.
 *
 * @param cv - OpenCV.js instance
 * @param matchedPairs - Feature matches between photo pairs (from TASK-006)
 * @param imageWidth - Width of captured images in pixels
 * @param imageHeight - Height of captured images in pixels
 * @param photoIndices - Indices of all photos to estimate poses for
 * @returns Map from photo index to estimated camera pose
 */
export function estimateCameraPoses(
  cv: OpenCV,
  matchedPairs: MatchedPair[],
  imageWidth: number,
  imageHeight: number,
  photoIndices: number[]
): Map<number, CameraPose> {
  const poses = new Map<number, CameraPose>()

  if (photoIndices.length === 0) {
    return poses
  }

  if (matchedPairs.length === 0) {
    // No pairs — only the first photo gets a pose (at origin)
    poses.set(photoIndices[0], {
      position: { x: 0, y: 0, z: 0 },
      rotation: identityRotation(),
    })
    return poses
  }

  // Create camera intrinsics matrix
  const K = estimateCameraIntrinsics(imageWidth, imageHeight)
  const cameraMat = new cv.Mat()
  Object.assign(cameraMat, { rows: 3, cols: 3, data64F: new Float64Array(K) })

  // Compute relative poses for all matched pairs
  const relativePoses = new Map<string, RelativePose>()
  for (const pair of matchedPairs) {
    const pose = estimateRelativePose(cv, pair, cameraMat)
    if (pose) {
      relativePoses.set(`${pair.photoIndexA}-${pair.photoIndexB}`, pose)
    }
  }

  cameraMat.delete()

  // Build adjacency list for graph traversal
  const adjacency = new Map<number, { neighbor: number; key: string; forward: boolean }[]>()
  for (const pair of matchedPairs) {
    const key = `${pair.photoIndexA}-${pair.photoIndexB}`
    if (!relativePoses.has(key)) continue

    if (!adjacency.has(pair.photoIndexA)) adjacency.set(pair.photoIndexA, [])
    if (!adjacency.has(pair.photoIndexB)) adjacency.set(pair.photoIndexB, [])

    adjacency.get(pair.photoIndexA)!.push({ neighbor: pair.photoIndexB, key, forward: true })
    adjacency.get(pair.photoIndexB)!.push({ neighbor: pair.photoIndexA, key, forward: false })
  }

  // BFS from the first photo (identity pose at origin)
  const startIndex = photoIndices[0]
  poses.set(startIndex, {
    position: { x: 0, y: 0, z: 0 },
    rotation: identityRotation(),
  })

  const queue: number[] = [startIndex]
  const visited = new Set<number>([startIndex])

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentPose = poses.get(current)!
    const edges = adjacency.get(current) ?? []

    for (const { neighbor, key, forward } of edges) {
      if (visited.has(neighbor)) continue

      const relPose = relativePoses.get(key)!

      let effectivePose: RelativePose
      if (forward) {
        effectivePose = relPose
      } else {
        // Invert the relative pose: R_inv = R^T, t_inv = -R^T * t
        const rInv = transposeMatrix3x3(relPose.rotation)
        const tInv = rotatePoint(rInv, {
          x: -relPose.translation.x,
          y: -relPose.translation.y,
          z: -relPose.translation.z,
        })
        effectivePose = {
          rotation: rInv,
          translation: tInv,
          inlierCount: relPose.inlierCount,
        }
      }

      poses.set(neighbor, chainPose(currentPose, effectivePose))
      visited.add(neighbor)
      queue.push(neighbor)
    }
  }

  return poses
}
