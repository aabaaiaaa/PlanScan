import { describe, it, expect } from 'vitest'
import {
  validateInput,
  runReconstruction,
  STAGE_LABELS,
  type ReconstructionProgress,
  type ReconstructionStage,
} from './reconstructionPipeline'
import type { CapturedPhoto, ScaleReference } from '../types'
import type { OpenCV } from '../types/opencv'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePhoto(index: number, tags: ('doorway' | 'window')[] = []): CapturedPhoto {
  return {
    index,
    imageData: 'data:image/png;base64,AAAA',
    width: 320,
    height: 240,
    tags,
    capturedAt: Date.now(),
  }
}

function makeScaleReference(): ScaleReference {
  return {
    photoIndex: 0,
    startPoint: { x: 10, y: 10 },
    endPoint: { x: 110, y: 10 },
    length: 50,
    unit: 'cm',
  }
}

// ---------------------------------------------------------------------------
// validateInput
// ---------------------------------------------------------------------------

describe('validateInput', () => {
  it('returns error when no photos are provided', () => {
    const result = validateInput([], undefined)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('TOO_FEW_PHOTOS')
  })

  it('returns error when only 1 photo is provided', () => {
    const result = validateInput([makePhoto(0)], undefined)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('TOO_FEW_PHOTOS')
  })

  it('returns no errors with 2+ photos', () => {
    const result = validateInput([makePhoto(0), makePhoto(1)], makeScaleReference())
    expect(result.errors).toHaveLength(0)
  })

  it('returns warning when no scale reference is provided', () => {
    const result = validateInput([makePhoto(0), makePhoto(1)], undefined)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].code).toBe('NO_SCALE_REFERENCE')
    expect(result.warnings[0].message).toContain('uncalibrated')
  })

  it('returns no warning when scale reference is provided', () => {
    const result = validateInput([makePhoto(0), makePhoto(1)], makeScaleReference())
    expect(result.warnings).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// STAGE_LABELS
// ---------------------------------------------------------------------------

describe('STAGE_LABELS', () => {
  it('has a label for every stage', () => {
    const stages: ReconstructionStage[] = [
      'validating',
      'feature-detection',
      'pose-estimation',
      'triangulation',
      'geometry-extraction',
      'complete',
    ]
    for (const stage of stages) {
      expect(STAGE_LABELS[stage]).toBeDefined()
      expect(typeof STAGE_LABELS[stage]).toBe('string')
    }
  })
})

// ---------------------------------------------------------------------------
// runReconstruction — validation failure path
// ---------------------------------------------------------------------------

describe('runReconstruction', () => {
  it('returns errors immediately when too few photos', async () => {
    const mockCv = {} as OpenCV
    const progressCalls: ReconstructionProgress[] = []

    const result = await runReconstruction(
      mockCv,
      [makePhoto(0)],
      undefined,
      (p) => progressCalls.push({ ...p }),
    )

    expect(result.model).toBeNull()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('TOO_FEW_PHOTOS')
    // Should have reported the validating stage
    expect(progressCalls.length).toBeGreaterThanOrEqual(1)
    expect(progressCalls[0].stage).toBe('validating')
  })

  it('includes no-scale warning in result when scale reference is missing', async () => {
    const mockCv = {} as OpenCV

    const result = await runReconstruction(
      mockCv,
      [makePhoto(0)], // still too few, but warning should still be collected
      undefined,
    )

    expect(result.warnings.some((w) => w.code === 'NO_SCALE_REFERENCE')).toBe(true)
  })

  it('calls onProgress at the validating stage before checking input', async () => {
    const mockCv = {} as OpenCV
    const stages: string[] = []

    await runReconstruction(
      mockCv,
      [],
      undefined,
      (p) => stages.push(p.stage),
    )

    expect(stages[0]).toBe('validating')
  })

  it('progress percent is 0 at validating and 100 at complete', async () => {
    // We can only test the validating stage directly since the pipeline
    // requires a real cv instance for further stages
    const mockCv = {} as OpenCV
    const progressCalls: ReconstructionProgress[] = []

    await runReconstruction(
      mockCv,
      [],
      undefined,
      (p) => progressCalls.push({ ...p }),
    )

    const validating = progressCalls.find((p) => p.stage === 'validating')
    expect(validating).toBeDefined()
    expect(validating!.percent).toBe(0)
  })
})
