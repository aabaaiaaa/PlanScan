import { describe, it, expect, vi } from 'vitest'
import type { OpenCV, CvMat } from '../types/opencv'
import type { MatchedPair } from './featureDetection'
import {
  identityRotation,
  multiplyMatrices3x3,
  rotatePoint,
  transposeMatrix3x3,
  estimateCameraIntrinsics,
  estimateRelativePose,
  chainPose,
  estimateCameraPoses,
} from './poseEstimation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockMat(overrides?: Partial<CvMat>): CvMat {
  return {
    rows: 0,
    cols: 0,
    data: new Uint8Array(),
    data32F: new Float32Array(),
    data64F: new Float64Array(),
    delete: vi.fn(),
    isContinuous: () => true,
    type: () => 0,
    row: () => makeMockMat(),
    ...overrides,
  }
}

/** Rotation matrix around the Y axis by `angle` radians (row-major). */
function rotationY(angle: number): number[] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [c, 0, s, 0, 1, 0, -s, 0, c]
}

/** Create a matched pair fixture with `numPoints` point correspondences. */
function makeMatchedPair(
  indexA: number,
  indexB: number,
  numPoints: number = 20
): MatchedPair {
  const shift = 10 * (indexB - indexA)
  const pointsA = []
  const pointsB = []
  const matches = []
  const keypointsA = []
  const keypointsB = []

  for (let i = 0; i < numPoints; i++) {
    const x = 50 + i * 20
    const y = 50 + (i % 5) * 30
    pointsA.push({ x, y })
    pointsB.push({ x: x + shift, y: y + 1 })
    matches.push({ queryIdx: i, trainIdx: i, distance: 15 })
    keypointsA.push({ x, y, size: 31, angle: 0, response: 100, octave: 0 })
    keypointsB.push({
      x: x + shift,
      y: y + 1,
      size: 31,
      angle: 0,
      response: 100,
      octave: 0,
    })
  }

  return {
    photoIndexA: indexA,
    photoIndexB: indexB,
    matches,
    keypointsA,
    keypointsB,
    pointsA,
    pointsB,
  }
}

/**
 * Create a mock OpenCV instance for pose estimation tests.
 * recoverPose returns a small Y rotation + X translation each time.
 */
function createMockCv(): OpenCV {
  const angle = 0.05 // ~3 degrees
  const relR = rotationY(angle)
  const relT = { x: 1.0, y: 0, z: 0 }

  return {
    Mat: vi.fn(() => makeMockMat()) as unknown as OpenCV['Mat'],
    KeyPointVector: vi.fn() as unknown as OpenCV['KeyPointVector'],
    DMatchVectorVector: vi.fn() as unknown as OpenCV['DMatchVectorVector'],
    ORB: vi.fn() as unknown as OpenCV['ORB'],
    BFMatcher: vi.fn() as unknown as OpenCV['BFMatcher'],
    matFromImageData: vi.fn(() => makeMockMat()),
    cvtColor: vi.fn(),
    findFundamentalMat: vi.fn(() => makeMockMat()),
    findEssentialMat: vi.fn(
      (_p1: CvMat, _p2: CvMat, _K: CvMat, _method: number, _prob: number, _thresh: number, _mask: CvMat) =>
        makeMockMat({ rows: 3, cols: 3 })
    ),
    recoverPose: vi.fn(
      (_E: CvMat, _p1: CvMat, _p2: CvMat, _K: CvMat, R: CvMat, t: CvMat, _mask: CvMat) => {
        Object.assign(R, { data64F: new Float64Array(relR) })
        Object.assign(t, { data64F: new Float64Array([relT.x, relT.y, relT.z]) })
        return 15
      }
    ),
    NORM_HAMMING: 4,
    COLOR_RGBA2GRAY: 11,
    FM_RANSAC: 8,
    RANSAC: 8,
    CV_32FC2: 13,
    CV_64F: 6,
  }
}

// ---------------------------------------------------------------------------
// Tests: Pure math helpers
// ---------------------------------------------------------------------------

describe('poseEstimation', () => {
  describe('identityRotation', () => {
    it('returns a 3x3 identity matrix', () => {
      expect(identityRotation()).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1])
    })
  })

  describe('multiplyMatrices3x3', () => {
    it('identity * A = A', () => {
      const A = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      expect(multiplyMatrices3x3(identityRotation(), A)).toEqual(A)
    })

    it('A * identity = A', () => {
      const A = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      expect(multiplyMatrices3x3(A, identityRotation())).toEqual(A)
    })

    it('R * R for a Y rotation doubles the angle', () => {
      const R = rotationY(Math.PI / 4)
      const R2 = multiplyMatrices3x3(R, R)
      const expected = rotationY(Math.PI / 2)
      for (let i = 0; i < 9; i++) {
        expect(R2[i]).toBeCloseTo(expected[i], 10)
      }
    })
  })

  describe('rotatePoint', () => {
    it('identity rotation leaves point unchanged', () => {
      const p = { x: 1, y: 2, z: 3 }
      const result = rotatePoint(identityRotation(), p)
      expect(result.x).toBeCloseTo(1)
      expect(result.y).toBeCloseTo(2)
      expect(result.z).toBeCloseTo(3)
    })

    it('90-degree Y rotation maps (1,0,0) to (0,0,-1)', () => {
      const result = rotatePoint(rotationY(Math.PI / 2), { x: 1, y: 0, z: 0 })
      expect(result.x).toBeCloseTo(0)
      expect(result.y).toBeCloseTo(0)
      expect(result.z).toBeCloseTo(-1)
    })

    it('90-degree Y rotation maps (0,0,1) to (1,0,0)', () => {
      const result = rotatePoint(rotationY(Math.PI / 2), { x: 0, y: 0, z: 1 })
      expect(result.x).toBeCloseTo(1)
      expect(result.y).toBeCloseTo(0)
      expect(result.z).toBeCloseTo(0)
    })
  })

  describe('transposeMatrix3x3', () => {
    it('transposes correctly', () => {
      expect(transposeMatrix3x3([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
        1, 4, 7, 2, 5, 8, 3, 6, 9,
      ])
    })

    it('double transpose returns original', () => {
      const M = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      expect(transposeMatrix3x3(transposeMatrix3x3(M))).toEqual(M)
    })

    it('R * R^T = I for rotation matrices', () => {
      const R = rotationY(0.5)
      const product = multiplyMatrices3x3(R, transposeMatrix3x3(R))
      const I = identityRotation()
      for (let i = 0; i < 9; i++) {
        expect(product[i]).toBeCloseTo(I[i], 10)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Tests: Camera intrinsics
  // ---------------------------------------------------------------------------

  describe('estimateCameraIntrinsics', () => {
    it('uses max(w,h) as focal length with center principal point', () => {
      const K = estimateCameraIntrinsics(640, 480)
      expect(K[0]).toBe(640) // f
      expect(K[4]).toBe(640) // f
      expect(K[2]).toBe(320) // cx
      expect(K[5]).toBe(240) // cy
      expect(K[8]).toBe(1)
      // Off-diagonal and bottom row
      expect(K[1]).toBe(0)
      expect(K[3]).toBe(0)
      expect(K[6]).toBe(0)
      expect(K[7]).toBe(0)
    })

    it('handles portrait orientation', () => {
      const K = estimateCameraIntrinsics(480, 640)
      expect(K[0]).toBe(640)
      expect(K[2]).toBe(240)
      expect(K[5]).toBe(320)
    })

    it('handles square images', () => {
      const K = estimateCameraIntrinsics(300, 300)
      expect(K[0]).toBe(300)
      expect(K[2]).toBe(150)
      expect(K[5]).toBe(150)
    })
  })

  // ---------------------------------------------------------------------------
  // Tests: Relative pose estimation
  // ---------------------------------------------------------------------------

  describe('estimateRelativePose', () => {
    it('returns relative pose for a valid matched pair', () => {
      const cv = createMockCv()
      const pair = makeMatchedPair(0, 1)
      const cameraMat = makeMockMat({ rows: 3, cols: 3 })

      const result = estimateRelativePose(cv, pair, cameraMat)

      expect(result).not.toBeNull()
      expect(result!.rotation).toHaveLength(9)
      expect(result!.translation).toHaveProperty('x')
      expect(result!.translation).toHaveProperty('y')
      expect(result!.translation).toHaveProperty('z')
      expect(result!.inlierCount).toBe(15)
    })

    it('calls findEssentialMat and recoverPose', () => {
      const cv = createMockCv()
      const pair = makeMatchedPair(0, 1)
      const cameraMat = makeMockMat({ rows: 3, cols: 3 })

      estimateRelativePose(cv, pair, cameraMat)

      expect(cv.findEssentialMat).toHaveBeenCalledTimes(1)
      expect(cv.recoverPose).toHaveBeenCalledTimes(1)
    })

    it('returns null when too few points', () => {
      const cv = createMockCv()
      const pair = makeMatchedPair(0, 1, 5)
      const cameraMat = makeMockMat({ rows: 3, cols: 3 })

      expect(estimateRelativePose(cv, pair, cameraMat)).toBeNull()
      expect(cv.findEssentialMat).not.toHaveBeenCalled()
    })

    it('returns null when essential matrix is invalid', () => {
      const cv = createMockCv()
      cv.findEssentialMat = vi.fn(() => makeMockMat({ rows: 0, cols: 0 }))

      const pair = makeMatchedPair(0, 1)
      const cameraMat = makeMockMat({ rows: 3, cols: 3 })

      expect(estimateRelativePose(cv, pair, cameraMat)).toBeNull()
    })

    it('returns null when too few inliers from recoverPose', () => {
      const cv = createMockCv()
      cv.recoverPose = vi.fn(
        (_E: CvMat, _p1: CvMat, _p2: CvMat, _K: CvMat, R: CvMat, t: CvMat, _mask: CvMat) => {
          Object.assign(R, { data64F: new Float64Array(identityRotation()) })
          Object.assign(t, { data64F: new Float64Array([0, 0, 0]) })
          return 3 // too few
        }
      )

      const pair = makeMatchedPair(0, 1)
      const cameraMat = makeMockMat({ rows: 3, cols: 3 })

      expect(estimateRelativePose(cv, pair, cameraMat)).toBeNull()
    })

    it('cleans up all OpenCV Mat objects', () => {
      const cv = createMockCv()
      const deleteFns: ReturnType<typeof vi.fn>[] = []
      const origMat = cv.Mat
      cv.Mat = vi.fn(() => {
        const mat = makeMockMat()
        deleteFns.push(mat.delete as ReturnType<typeof vi.fn>)
        return mat
      }) as unknown as OpenCV['Mat']

      const pair = makeMatchedPair(0, 1)
      const cameraMat = makeMockMat({ rows: 3, cols: 3 })

      estimateRelativePose(cv, pair, cameraMat)

      // pts1, pts2, mask, R, t = 5 mats created + E mat from findEssentialMat
      const deleteCallCount = deleteFns.filter((fn) => fn.mock.calls.length > 0).length
      expect(deleteCallCount).toBeGreaterThanOrEqual(5)

      cv.Mat = origMat
    })
  })

  // ---------------------------------------------------------------------------
  // Tests: Pose chaining
  // ---------------------------------------------------------------------------

  describe('chainPose', () => {
    it('identity relative pose keeps absolute pose unchanged', () => {
      const absolute = {
        position: { x: 1, y: 2, z: 3 },
        rotation: identityRotation(),
      }
      const relative = {
        rotation: identityRotation(),
        translation: { x: 0, y: 0, z: 0 },
        inlierCount: 10,
      }

      const result = chainPose(absolute, relative)

      expect(result.position.x).toBeCloseTo(1)
      expect(result.position.y).toBeCloseTo(2)
      expect(result.position.z).toBeCloseTo(3)
      expect(result.rotation).toEqual(identityRotation())
    })

    it('pure translation adds offset in world space', () => {
      const absolute = {
        position: { x: 0, y: 0, z: 0 },
        rotation: identityRotation(),
      }
      const relative = {
        rotation: identityRotation(),
        translation: { x: 1, y: 0, z: 0 },
        inlierCount: 10,
      }

      const result = chainPose(absolute, relative)

      expect(result.position.x).toBeCloseTo(1)
      expect(result.position.y).toBeCloseTo(0)
      expect(result.position.z).toBeCloseTo(0)
    })

    it('translation is rotated into world frame by inverse of current rotation', () => {
      // Camera is rotated 90 degrees around Y.
      // A local +X translation should become +Z in world space.
      const absolute = {
        position: { x: 0, y: 0, z: 0 },
        rotation: rotationY(Math.PI / 2),
      }
      const relative = {
        rotation: identityRotation(),
        translation: { x: 1, y: 0, z: 0 },
        inlierCount: 10,
      }

      const result = chainPose(absolute, relative)

      expect(result.position.x).toBeCloseTo(0)
      expect(result.position.y).toBeCloseTo(0)
      expect(result.position.z).toBeCloseTo(1)
    })

    it('accumulates translations correctly over multiple chains', () => {
      let pose = {
        position: { x: 0, y: 0, z: 0 } as { x: number; y: number; z: number },
        rotation: identityRotation(),
      }
      const step = {
        rotation: identityRotation(),
        translation: { x: 1, y: 0, z: 0 },
        inlierCount: 10,
      }

      // Chain 3 identical steps
      for (let i = 0; i < 3; i++) {
        pose = chainPose(pose, step)
      }

      expect(pose.position.x).toBeCloseTo(3)
      expect(pose.position.y).toBeCloseTo(0)
      expect(pose.position.z).toBeCloseTo(0)
    })

    it('accumulates rotations correctly', () => {
      const pose = {
        position: { x: 0, y: 0, z: 0 },
        rotation: rotationY(0.1),
      }
      const relative = {
        rotation: rotationY(0.2),
        translation: { x: 0, y: 0, z: 0 },
        inlierCount: 10,
      }

      const result = chainPose(pose, relative)
      const expected = rotationY(0.3)
      for (let i = 0; i < 9; i++) {
        expect(result.rotation[i]).toBeCloseTo(expected[i], 10)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Tests: Full pose estimation pipeline
  // ---------------------------------------------------------------------------

  describe('estimateCameraPoses', () => {
    it('returns empty map for empty input', () => {
      const cv = createMockCv()
      const result = estimateCameraPoses(cv, [], 640, 480, [])
      expect(result.size).toBe(0)
    })

    it('places first photo at origin with identity rotation when no pairs', () => {
      const cv = createMockCv()
      const result = estimateCameraPoses(cv, [], 640, 480, [0])

      expect(result.size).toBe(1)
      const pose = result.get(0)!
      expect(pose.position).toEqual({ x: 0, y: 0, z: 0 })
      expect(pose.rotation).toEqual(identityRotation())
    })

    it('estimates poses for sequential photos with incrementally changing positions', () => {
      const cv = createMockCv()
      const pairs = [
        makeMatchedPair(0, 1),
        makeMatchedPair(1, 2),
        makeMatchedPair(2, 3),
      ]

      const result = estimateCameraPoses(cv, pairs, 640, 480, [0, 1, 2, 3])

      expect(result.size).toBe(4)

      // First photo at origin
      const pose0 = result.get(0)!
      expect(pose0.position.x).toBeCloseTo(0)
      expect(pose0.position.y).toBeCloseTo(0)
      expect(pose0.position.z).toBeCloseTo(0)

      // Each subsequent photo should be further from origin
      const distances = [0, 1, 2, 3].map((i) => {
        const p = result.get(i)!.position
        return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
      })

      expect(distances[0]).toBeCloseTo(0)
      for (let i = 1; i < distances.length; i++) {
        expect(distances[i]).toBeGreaterThan(distances[i - 1])
      }
    })

    it('handles non-sequential pairs via BFS traversal', () => {
      const cv = createMockCv()
      const pairs = [
        makeMatchedPair(0, 1),
        makeMatchedPair(0, 2),
        makeMatchedPair(1, 2),
      ]

      const result = estimateCameraPoses(cv, pairs, 640, 480, [0, 1, 2])

      expect(result.size).toBe(3)
      expect(result.has(0)).toBe(true)
      expect(result.has(1)).toBe(true)
      expect(result.has(2)).toBe(true)
    })

    it('skips disconnected photos that have no matching pairs', () => {
      const cv = createMockCv()
      const pairs = [makeMatchedPair(0, 1)]

      const result = estimateCameraPoses(cv, pairs, 640, 480, [0, 1, 2])

      expect(result.has(0)).toBe(true)
      expect(result.has(1)).toBe(true)
      expect(result.has(2)).toBe(false)
    })

    it('handles failed pose estimation for some pairs', () => {
      const cv = createMockCv()
      let callCount = 0
      cv.findEssentialMat = vi.fn(() => {
        callCount++
        if (callCount === 2) {
          return makeMockMat({ rows: 0, cols: 0 }) // fail
        }
        return makeMockMat({ rows: 3, cols: 3 })
      })

      const pairs = [makeMatchedPair(0, 1), makeMatchedPair(1, 2)]

      const result = estimateCameraPoses(cv, pairs, 640, 480, [0, 1, 2])

      expect(result.has(0)).toBe(true)
      expect(result.has(1)).toBe(true)
      // Photo 2 has no valid connection since pair 1-2 failed
      expect(result.has(2)).toBe(false)
    })

    it('produces geometrically consistent poses for a simulated walkthrough', () => {
      const cv = createMockCv()
      const pairs = [
        makeMatchedPair(0, 1),
        makeMatchedPair(1, 2),
        makeMatchedPair(2, 3),
        makeMatchedPair(3, 4),
      ]

      const result = estimateCameraPoses(cv, pairs, 640, 480, [0, 1, 2, 3, 4])

      expect(result.size).toBe(5)

      // 1. All poses should exist with valid structure
      for (let i = 0; i < 5; i++) {
        expect(result.has(i)).toBe(true)
        const pose = result.get(i)!
        expect(pose.rotation).toHaveLength(9)
        expect(typeof pose.position.x).toBe('number')
        expect(typeof pose.position.y).toBe('number')
        expect(typeof pose.position.z).toBe('number')
      }

      // 2. Sequential photos have monotonically increasing distance from origin
      const distances: number[] = []
      for (let i = 0; i < 5; i++) {
        const p = result.get(i)!.position
        distances.push(Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z))
      }

      expect(distances[0]).toBeCloseTo(0)
      for (let i = 1; i < distances.length; i++) {
        expect(distances[i]).toBeGreaterThan(distances[i - 1])
      }

      // 3. Each rotation is a valid rotation matrix: R * R^T ≈ I
      for (let i = 0; i < 5; i++) {
        const R = result.get(i)!.rotation
        const product = multiplyMatrices3x3(R, transposeMatrix3x3(R))
        const I = identityRotation()
        for (let j = 0; j < 9; j++) {
          expect(product[j]).toBeCloseTo(I[j], 5)
        }
      }

      // 4. Consecutive position deltas should be similar in magnitude
      const deltas: number[] = []
      for (let i = 1; i < 5; i++) {
        const prev = result.get(i - 1)!.position
        const curr = result.get(i)!.position
        const dx = curr.x - prev.x
        const dy = curr.y - prev.y
        const dz = curr.z - prev.z
        deltas.push(Math.sqrt(dx * dx + dy * dy + dz * dz))
      }

      // All step sizes should be approximately equal (within 20%)
      const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length
      for (const d of deltas) {
        expect(d / avgDelta).toBeGreaterThan(0.8)
        expect(d / avgDelta).toBeLessThan(1.2)
      }
    })

    it('cleans up the camera matrix', () => {
      const cv = createMockCv()
      const deleteFns: ReturnType<typeof vi.fn>[] = []
      const origMat = cv.Mat
      cv.Mat = vi.fn(() => {
        const mat = makeMockMat()
        deleteFns.push(mat.delete as ReturnType<typeof vi.fn>)
        return mat
      }) as unknown as OpenCV['Mat']

      const pairs = [makeMatchedPair(0, 1)]
      estimateCameraPoses(cv, pairs, 640, 480, [0, 1])

      const deleteCallCount = deleteFns.filter((fn) => fn.mock.calls.length > 0).length
      expect(deleteCallCount).toBeGreaterThan(0)

      cv.Mat = origMat
    })
  })
})
