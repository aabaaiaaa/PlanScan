import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReconstructionProgress, UncalibratedBadge } from './ReconstructionProgress'
import type { ReconstructionProgress as ProgressInfo } from '../utils/reconstructionPipeline'

// ---------------------------------------------------------------------------
// ReconstructionProgress component
// ---------------------------------------------------------------------------

describe('ReconstructionProgress', () => {
  it('renders nothing when status is idle', () => {
    const { container } = render(
      <ReconstructionProgress
        status="idle"
        progress={null}
        errors={[]}
        warnings={[]}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows spinner and progress bar when running', () => {
    const progress: ProgressInfo = {
      stage: 'feature-detection',
      stageLabel: 'Detecting and matching features...',
      stageIndex: 1,
      totalStages: 5,
      percent: 20,
    }

    render(
      <ReconstructionProgress
        status="running"
        progress={progress}
        errors={[]}
        warnings={[]}
      />,
    )

    expect(screen.getByTestId('reconstruction-spinner')).toBeDefined()
    expect(screen.getByTestId('reconstruction-stage').textContent).toBe(
      'Detecting and matching features...',
    )
    expect(screen.getByTestId('reconstruction-percent').textContent).toBe('20%')

    const barFill = screen.getByTestId('reconstruction-bar-fill')
    expect(barFill.style.width).toBe('20%')
  })

  it('shows stage label for each pipeline stage', () => {
    const stages: Array<{ stage: ProgressInfo['stage']; label: string }> = [
      { stage: 'validating', label: 'Validating input...' },
      { stage: 'feature-detection', label: 'Detecting and matching features...' },
      { stage: 'pose-estimation', label: 'Estimating camera poses...' },
      { stage: 'triangulation', label: 'Triangulating 3D points...' },
      { stage: 'geometry-extraction', label: 'Extracting room geometry...' },
    ]

    for (const { stage, label } of stages) {
      const progress: ProgressInfo = {
        stage,
        stageLabel: label,
        stageIndex: 0,
        totalStages: 5,
        percent: 0,
      }

      const { unmount } = render(
        <ReconstructionProgress
          status="running"
          progress={progress}
          errors={[]}
          warnings={[]}
        />,
      )

      expect(screen.getByTestId('reconstruction-stage').textContent).toBe(label)
      unmount()
    }
  })

  it('shows success message and dismiss button when complete', () => {
    const onDismiss = vi.fn()

    render(
      <ReconstructionProgress
        status="complete"
        progress={null}
        errors={[]}
        warnings={[]}
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByTestId('reconstruction-complete')).toBeDefined()
    expect(screen.getByText('Reconstruction complete')).toBeDefined()

    fireEvent.click(screen.getByTestId('reconstruction-dismiss'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('shows error messages when status is error', () => {
    render(
      <ReconstructionProgress
        status="error"
        progress={null}
        errors={[
          { code: 'TOO_FEW_PHOTOS', message: 'At least 2 photos are required.' },
        ]}
        warnings={[]}
      />,
    )

    expect(screen.getByTestId('reconstruction-errors')).toBeDefined()
    expect(screen.getByText('At least 2 photos are required.')).toBeDefined()
  })

  it('shows insufficient overlap error message', () => {
    render(
      <ReconstructionProgress
        status="error"
        progress={null}
        errors={[
          {
            code: 'INSUFFICIENT_OVERLAP',
            message: 'Could not find enough matching features between photos.',
          },
        ]}
        warnings={[]}
      />,
    )

    expect(
      screen.getByText('Could not find enough matching features between photos.'),
    ).toBeDefined()
  })

  it('shows retry button on error and calls onRetry', () => {
    const onRetry = vi.fn()

    render(
      <ReconstructionProgress
        status="error"
        progress={null}
        errors={[
          { code: 'TOO_FEW_PHOTOS', message: 'Not enough photos.' },
        ]}
        warnings={[]}
        onRetry={onRetry}
      />,
    )

    fireEvent.click(screen.getByTestId('reconstruction-retry'))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows warnings alongside running state', () => {
    const progress: ProgressInfo = {
      stage: 'feature-detection',
      stageLabel: 'Detecting and matching features...',
      stageIndex: 1,
      totalStages: 5,
      percent: 20,
    }

    render(
      <ReconstructionProgress
        status="running"
        progress={progress}
        errors={[]}
        warnings={[
          {
            code: 'NO_SCALE_REFERENCE',
            message: 'No scale calibration set. Measurements will be in arbitrary units (uncalibrated).',
          },
        ]}
      />,
    )

    expect(screen.getByTestId('reconstruction-warnings')).toBeDefined()
    expect(screen.getByTestId('reconstruction-warning').textContent).toContain(
      'uncalibrated',
    )
  })

  it('shows multiple errors', () => {
    render(
      <ReconstructionProgress
        status="error"
        progress={null}
        errors={[
          { code: 'TOO_FEW_PHOTOS', message: 'Too few photos.' },
          { code: 'RECONSTRUCTION_FAILED', message: 'Pipeline crashed.' },
        ]}
        warnings={[]}
      />,
    )

    const errorElems = screen.getAllByTestId('reconstruction-error')
    expect(errorElems).toHaveLength(2)
  })

  it('has accessible progressbar role', () => {
    const progress: ProgressInfo = {
      stage: 'triangulation',
      stageLabel: 'Triangulating 3D points...',
      stageIndex: 3,
      totalStages: 5,
      percent: 60,
    }

    render(
      <ReconstructionProgress
        status="running"
        progress={progress}
        errors={[]}
        warnings={[]}
      />,
    )

    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('60')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
  })
})

// ---------------------------------------------------------------------------
// UncalibratedBadge
// ---------------------------------------------------------------------------

describe('UncalibratedBadge', () => {
  it('renders nothing when calibrated', () => {
    const { container } = render(<UncalibratedBadge isCalibrated={true} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the uncalibrated badge when not calibrated', () => {
    render(<UncalibratedBadge isCalibrated={false} />)
    expect(screen.getByTestId('uncalibrated-badge')).toBeDefined()
    expect(screen.getByText('uncalibrated')).toBeDefined()
  })

  it('has a tooltip explaining the uncalibrated state', () => {
    render(<UncalibratedBadge isCalibrated={false} />)
    const badge = screen.getByTestId('uncalibrated-badge')
    expect(badge.getAttribute('title')).toContain('arbitrary units')
  })
})
