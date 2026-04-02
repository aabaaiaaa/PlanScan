import type { CapturedPhoto, ScaleReference, BuildingModel } from '../types'
import type { OpenCV } from '../types/opencv'
import type { MatchedPair } from './featureDetection'
import type { PointCloud } from './triangulation'
import { findMatchesAcrossPhotos } from './featureDetection'
import { estimateCameraPoses } from './poseEstimation'
import { generatePointCloud } from './triangulation'
import { extractRoomGeometry } from './geometryExtraction'

// ---------------------------------------------------------------------------
// Progress types
// ---------------------------------------------------------------------------

export type ReconstructionStage =
  | 'validating'
  | 'feature-detection'
  | 'pose-estimation'
  | 'triangulation'
  | 'geometry-extraction'
  | 'complete'

export const STAGE_LABELS: Record<ReconstructionStage, string> = {
  'validating': 'Validating input...',
  'feature-detection': 'Detecting and matching features...',
  'pose-estimation': 'Estimating camera poses...',
  'triangulation': 'Triangulating 3D points...',
  'geometry-extraction': 'Extracting room geometry...',
  'complete': 'Reconstruction complete',
}

const ORDERED_STAGES: ReconstructionStage[] = [
  'validating',
  'feature-detection',
  'pose-estimation',
  'triangulation',
  'geometry-extraction',
  'complete',
]

export interface ReconstructionProgress {
  stage: ReconstructionStage
  stageLabel: string
  stageIndex: number
  totalStages: number
  /** 0–100 overall percentage */
  percent: number
}

export type ProgressCallback = (progress: ReconstructionProgress) => void

// ---------------------------------------------------------------------------
// Validation & error types
// ---------------------------------------------------------------------------

export interface ReconstructionError {
  code: 'TOO_FEW_PHOTOS' | 'INSUFFICIENT_OVERLAP' | 'NO_SCALE_REFERENCE' | 'RECONSTRUCTION_FAILED'
  message: string
}

export interface ReconstructionWarning {
  code: 'NO_SCALE_REFERENCE' | 'LOW_MATCH_COUNT'
  message: string
}

export interface ReconstructionResult {
  model: BuildingModel | null
  warnings: ReconstructionWarning[]
  errors: ReconstructionError[]
}

/** Minimum photos required to attempt reconstruction */
const MIN_PHOTOS = 2

/** Minimum matched pairs needed for a usable reconstruction */
const MIN_MATCHED_PAIRS = 1

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProgress(stage: ReconstructionStage): ReconstructionProgress {
  const stageIndex = ORDERED_STAGES.indexOf(stage)
  const totalStages = ORDERED_STAGES.length - 1 // 'complete' doesn't count as a working stage
  const percent = Math.round((stageIndex / totalStages) * 100)
  return {
    stage,
    stageLabel: STAGE_LABELS[stage],
    stageIndex,
    totalStages,
    percent,
  }
}

/**
 * Yield control back to the browser event loop so the UI can repaint.
 * This keeps the main thread responsive between heavy pipeline stages.
 */
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate the input photos before starting reconstruction.
 * Returns errors for blocking issues and warnings for non-blocking issues.
 */
export function validateInput(
  photos: CapturedPhoto[],
  scaleReference?: ScaleReference,
): { errors: ReconstructionError[]; warnings: ReconstructionWarning[] } {
  const errors: ReconstructionError[] = []
  const warnings: ReconstructionWarning[] = []

  if (photos.length < MIN_PHOTOS) {
    errors.push({
      code: 'TOO_FEW_PHOTOS',
      message: `At least ${MIN_PHOTOS} photos are required for reconstruction. You have ${photos.length}.`,
    })
  }

  if (!scaleReference) {
    warnings.push({
      code: 'NO_SCALE_REFERENCE',
      message: 'No scale calibration set. Measurements will be in arbitrary units (uncalibrated).',
    })
  }

  return { errors, warnings }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full reconstruction pipeline with progress reporting.
 *
 * Stages:
 * 1. Validate input
 * 2. Feature detection & matching
 * 3. Camera pose estimation
 * 4. Point cloud triangulation
 * 5. Room geometry extraction
 *
 * Between each stage, yields to the UI thread so the browser stays responsive.
 * Calls onProgress at each stage transition.
 *
 * @param cv - OpenCV.js instance
 * @param photos - Captured photos from the scan session
 * @param scaleReference - Optional scale calibration
 * @param onProgress - Called at each pipeline stage transition
 * @returns Result with the model (or null on failure), warnings, and errors
 */
export async function runReconstruction(
  cv: OpenCV,
  photos: CapturedPhoto[],
  scaleReference: ScaleReference | undefined,
  onProgress?: ProgressCallback,
): Promise<ReconstructionResult> {
  const warnings: ReconstructionWarning[] = []
  const errors: ReconstructionError[] = []

  // --- Stage 0: Validate ---
  onProgress?.(buildProgress('validating'))
  await yieldToUI()

  const validation = validateInput(photos, scaleReference)
  warnings.push(...validation.warnings)

  if (validation.errors.length > 0) {
    errors.push(...validation.errors)
    return { model: null, warnings, errors }
  }

  // Prepare image data for the pipeline
  const images = await Promise.all(
    photos.map(async (p) => ({
      imageData: await photoToImageData(p),
      photoIndex: p.index,
    })),
  )

  const imageWidth = photos[0].width
  const imageHeight = photos[0].height

  // --- Stage 1: Feature detection & matching ---
  onProgress?.(buildProgress('feature-detection'))
  await yieldToUI()

  let matchedPairs: MatchedPair[]
  try {
    matchedPairs = findMatchesAcrossPhotos(cv, images)
  } catch {
    errors.push({
      code: 'RECONSTRUCTION_FAILED',
      message: 'Feature detection failed. The photos may be too blurry or lack distinctive features.',
    })
    return { model: null, warnings, errors }
  }

  if (matchedPairs.length < MIN_MATCHED_PAIRS) {
    errors.push({
      code: 'INSUFFICIENT_OVERLAP',
      message:
        'Could not find enough matching features between photos. Please capture more photos with greater overlap between consecutive shots.',
    })
    return { model: null, warnings, errors }
  }

  if (matchedPairs.length < photos.length / 2) {
    warnings.push({
      code: 'LOW_MATCH_COUNT',
      message: 'Only a few photo pairs matched. The reconstruction may be incomplete. Consider adding more overlapping photos.',
    })
  }

  // --- Stage 2: Pose estimation ---
  onProgress?.(buildProgress('pose-estimation'))
  await yieldToUI()

  const photoIndices = photos.map((p) => p.index)
  let poses: Map<number, import('../types').CameraPose>
  try {
    poses = estimateCameraPoses(cv, matchedPairs, imageWidth, imageHeight, photoIndices)
  } catch {
    errors.push({
      code: 'RECONSTRUCTION_FAILED',
      message: 'Camera pose estimation failed. Try capturing photos with more varied angles.',
    })
    return { model: null, warnings, errors }
  }

  // Assign poses back to photos for geometry extraction
  for (const photo of photos) {
    const pose = poses.get(photo.index)
    if (pose) {
      photo.pose = pose
    }
  }

  // --- Stage 3: Triangulation ---
  onProgress?.(buildProgress('triangulation'))
  await yieldToUI()

  let pointCloud: PointCloud
  try {
    pointCloud = generatePointCloud(matchedPairs, poses, imageWidth, imageHeight, scaleReference)
  } catch {
    errors.push({
      code: 'RECONSTRUCTION_FAILED',
      message: 'Point cloud generation failed. The camera poses may be unreliable.',
    })
    return { model: null, warnings, errors }
  }

  if (pointCloud.points.length === 0) {
    errors.push({
      code: 'INSUFFICIENT_OVERLAP',
      message: 'No 3D points could be triangulated. The photos may not have enough overlap.',
    })
    return { model: null, warnings, errors }
  }

  // --- Stage 4: Geometry extraction ---
  onProgress?.(buildProgress('geometry-extraction'))
  await yieldToUI()

  let model: BuildingModel
  try {
    model = extractRoomGeometry(pointCloud, photos)
  } catch {
    errors.push({
      code: 'RECONSTRUCTION_FAILED',
      message: 'Room geometry extraction failed.',
    })
    return { model: null, warnings, errors }
  }

  // Apply scale reference unit to model
  if (scaleReference && model.isCalibrated) {
    model = { ...model, unit: scaleReference.unit }
  }

  // --- Complete ---
  onProgress?.(buildProgress('complete'))

  return { model, warnings, errors }
}

// ---------------------------------------------------------------------------
// Image data conversion helper
// ---------------------------------------------------------------------------

/**
 * Convert a CapturedPhoto's image (data URL or Blob URL) to an ImageData object.
 * Uses createImageBitmap for proper async decoding of the image data.
 */
async function photoToImageData(photo: CapturedPhoto): Promise<ImageData> {
  const response = await fetch(photo.imageData)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = photo.width
  canvas.height = photo.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, photo.width, photo.height)
  bitmap.close()
  return ctx.getImageData(0, 0, photo.width, photo.height)
}
