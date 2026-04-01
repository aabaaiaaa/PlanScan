import type { Point2D, ScaleReference } from '../types'

/** Calculate the Euclidean distance between two 2D points in pixels */
export function pixelDistance(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Calculate the pixel-to-real-world ratio from a scale reference.
 * Returns the real-world length per pixel (e.g., 0.05 means each pixel = 0.05 of the chosen unit).
 * Returns 0 if the pixel distance is zero (degenerate line).
 */
export function calculatePixelToRealWorldRatio(scaleReference: ScaleReference): number {
  const dist = pixelDistance(scaleReference.startPoint, scaleReference.endPoint)
  if (dist === 0) return 0
  return scaleReference.length / dist
}
