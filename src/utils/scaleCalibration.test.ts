import { describe, it, expect } from 'vitest'
import { pixelDistance, calculatePixelToRealWorldRatio } from './scaleCalibration'
import type { ScaleReference } from '../types'

describe('pixelDistance', () => {
  it('calculates distance between two points', () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('returns 0 for identical points', () => {
    expect(pixelDistance({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(0)
  })

  it('handles horizontal distance', () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(100)
  })

  it('handles vertical distance', () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 0, y: 200 })).toBe(200)
  })

  it('handles negative coordinates', () => {
    expect(pixelDistance({ x: -3, y: -4 }, { x: 0, y: 0 })).toBe(5)
  })
})

describe('calculatePixelToRealWorldRatio', () => {
  it('calculates the correct ratio for a known line', () => {
    // 3-4-5 triangle: pixel distance = 5, real-world length = 50cm
    const ref: ScaleReference = {
      photoIndex: 0,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 3, y: 4 },
      length: 50,
      unit: 'cm',
    }
    // 50 / 5 = 10 cm per pixel
    expect(calculatePixelToRealWorldRatio(ref)).toBe(10)
  })

  it('returns 0 for degenerate line (same start and end)', () => {
    const ref: ScaleReference = {
      photoIndex: 0,
      startPoint: { x: 100, y: 100 },
      endPoint: { x: 100, y: 100 },
      length: 50,
      unit: 'cm',
    }
    expect(calculatePixelToRealWorldRatio(ref)).toBe(0)
  })

  it('works with different units', () => {
    const ref: ScaleReference = {
      photoIndex: 0,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 100, y: 0 },
      length: 1,
      unit: 'm',
    }
    // 1 / 100 = 0.01 m per pixel
    expect(calculatePixelToRealWorldRatio(ref)).toBeCloseTo(0.01)
  })

  it('works with fractional pixel distances', () => {
    const ref: ScaleReference = {
      photoIndex: 0,
      startPoint: { x: 10, y: 20 },
      endPoint: { x: 13, y: 24 },
      length: 25,
      unit: 'inches',
    }
    // distance = 5, ratio = 25/5 = 5
    expect(calculatePixelToRealWorldRatio(ref)).toBe(5)
  })

  it('handles large pixel distances with small real-world lengths', () => {
    const ref: ScaleReference = {
      photoIndex: 0,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 500, y: 0 },
      length: 2,
      unit: 'feet',
    }
    // 2 / 500 = 0.004
    expect(calculatePixelToRealWorldRatio(ref)).toBeCloseTo(0.004)
  })
})
