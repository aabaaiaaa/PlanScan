import type {
  ReconstructionProgress as ProgressInfo,
} from '../utils/reconstructionPipeline'
import type {
  ReconstructionError,
  ReconstructionWarning,
} from '../utils/reconstructionPipeline'
import type { ReconstructionStatus } from '../hooks/useReconstruction'

export interface ReconstructionProgressProps {
  status: ReconstructionStatus
  progress: ProgressInfo | null
  errors: ReconstructionError[]
  warnings: ReconstructionWarning[]
  onRetry?: () => void
  onDismiss?: () => void
}

/**
 * Displays reconstruction progress with a progress bar, stage labels,
 * error messages, and warnings.
 */
export function ReconstructionProgress({
  status,
  progress,
  errors,
  warnings,
  onRetry,
  onDismiss,
}: ReconstructionProgressProps) {
  if (status === 'idle') return null

  return (
    <div className="reconstruction-progress" data-testid="reconstruction-progress">
      {/* Progress bar and stage label while running */}
      {status === 'running' && progress && (
        <div className="reconstruction-progress__running">
          <div className="reconstruction-progress__spinner" data-testid="reconstruction-spinner" />
          <p className="reconstruction-progress__stage" data-testid="reconstruction-stage">
            {progress.stageLabel}
          </p>
          <div className="reconstruction-progress__bar-track" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="reconstruction-progress__bar-fill"
              style={{ width: `${progress.percent}%` }}
              data-testid="reconstruction-bar-fill"
            />
          </div>
          <p className="reconstruction-progress__percent" data-testid="reconstruction-percent">
            {progress.percent}%
          </p>
        </div>
      )}

      {/* Success state */}
      {status === 'complete' && (
        <div className="reconstruction-progress__complete" data-testid="reconstruction-complete">
          <p className="reconstruction-progress__success-message">
            Reconstruction complete
          </p>
          {onDismiss && (
            <button
              className="reconstruction-progress__dismiss-btn"
              onClick={onDismiss}
              data-testid="reconstruction-dismiss"
            >
              View Model
            </button>
          )}
        </div>
      )}

      {/* Error state */}
      {status === 'error' && errors.length > 0 && (
        <div className="reconstruction-progress__errors" data-testid="reconstruction-errors">
          {errors.map((err) => (
            <div key={err.code} className="reconstruction-progress__error" data-testid="reconstruction-error">
              <p className="reconstruction-progress__error-message">{err.message}</p>
            </div>
          ))}
          {onRetry && (
            <button
              className="reconstruction-progress__retry-btn"
              onClick={onRetry}
              data-testid="reconstruction-retry"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Warnings (shown in all non-idle states) */}
      {warnings.length > 0 && (
        <div className="reconstruction-progress__warnings" data-testid="reconstruction-warnings">
          {warnings.map((warn) => (
            <p key={warn.code} className="reconstruction-progress__warning" data-testid="reconstruction-warning">
              {warn.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Small inline badge that shows "Uncalibrated" when the model has no scale reference.
 * Use this next to measurement values in the viewers.
 */
export function UncalibratedBadge({ isCalibrated }: { isCalibrated: boolean }) {
  if (isCalibrated) return null
  return (
    <span
      className="uncalibrated-badge"
      data-testid="uncalibrated-badge"
      title="No scale calibration set. Measurements are in arbitrary units."
    >
      uncalibrated
    </span>
  )
}
