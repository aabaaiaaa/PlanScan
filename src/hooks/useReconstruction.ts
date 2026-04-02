import { useState, useCallback, useRef } from 'react'
import type { CapturedPhoto, ScaleReference, BuildingModel } from '../types'
import type { OpenCV } from '../types/opencv'
import {
  runReconstruction,
  type ReconstructionProgress,
  type ReconstructionError,
  type ReconstructionWarning,
} from '../utils/reconstructionPipeline'

export type ReconstructionStatus = 'idle' | 'running' | 'complete' | 'error'

export interface UseReconstructionReturn {
  /** Current pipeline status */
  status: ReconstructionStatus
  /** Current progress info (stage, percent, label) */
  progress: ReconstructionProgress | null
  /** The resulting BuildingModel, if reconstruction succeeded */
  model: BuildingModel | null
  /** Non-blocking warnings (e.g., missing scale reference) */
  warnings: ReconstructionWarning[]
  /** Blocking errors (e.g., too few photos) */
  errors: ReconstructionError[]
  /** Start the reconstruction pipeline */
  startReconstruction: (
    cv: OpenCV,
    photos: CapturedPhoto[],
    scaleReference?: ScaleReference,
  ) => Promise<void>
  /** Reset state back to idle */
  reset: () => void
}

/**
 * Hook that manages the async reconstruction pipeline.
 *
 * Tracks progress, errors, and warnings. Keeps the UI responsive
 * by yielding between pipeline stages (handled inside runReconstruction).
 */
export function useReconstruction(): UseReconstructionReturn {
  const [status, setStatus] = useState<ReconstructionStatus>('idle')
  const [progress, setProgress] = useState<ReconstructionProgress | null>(null)
  const [model, setModel] = useState<BuildingModel | null>(null)
  const [warnings, setWarnings] = useState<ReconstructionWarning[]>([])
  const [errors, setErrors] = useState<ReconstructionError[]>([])
  const runningRef = useRef(false)

  const startReconstruction = useCallback(
    async (
      cv: OpenCV,
      photos: CapturedPhoto[],
      scaleReference?: ScaleReference,
    ) => {
      if (runningRef.current) return
      runningRef.current = true

      setStatus('running')
      setProgress(null)
      setModel(null)
      setWarnings([])
      setErrors([])

      try {
        const result = await runReconstruction(
          cv,
          photos,
          scaleReference,
          (prog) => setProgress(prog),
        )

        setWarnings(result.warnings)
        setErrors(result.errors)

        if (result.model) {
          setModel(result.model)
          setStatus('complete')
        } else {
          setStatus('error')
        }
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err)
        setErrors([
          {
            code: 'RECONSTRUCTION_FAILED',
            message: `Reconstruction failed: ${detail}`,
          },
        ])
        setStatus('error')
      } finally {
        runningRef.current = false
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setStatus('idle')
    setProgress(null)
    setModel(null)
    setWarnings([])
    setErrors([])
    runningRef.current = false
  }, [])

  return {
    status,
    progress,
    model,
    warnings,
    errors,
    startReconstruction,
    reset,
  }
}
