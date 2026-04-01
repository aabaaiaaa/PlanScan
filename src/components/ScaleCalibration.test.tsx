import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ScaleCalibration } from './ScaleCalibration'
import { ScanSessionProvider, useScanSession } from '../hooks/useScanSession'
import { useEffect, useState } from 'react'
import type { CapturedPhoto } from '../types'

/** Create a mock photo with the given index */
function createMockPhoto(index: number): CapturedPhoto {
  return {
    index,
    imageData: `data:image/jpeg;base64,photo${index}`,
    width: 640,
    height: 480,
    tags: [],
    capturedAt: Date.now(),
  }
}

/**
 * Wrapper that starts a session and optionally pre-loads photos.
 * Exposes session state via onSession callback.
 */
function TestWrapper({
  children,
  photos = [],
  onSession,
}: {
  children: React.ReactNode
  photos?: CapturedPhoto[]
  onSession?: (ctx: ReturnType<typeof useScanSession>) => void
}) {
  const sessionCtx = useScanSession()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!sessionCtx.session) {
      sessionCtx.dispatch({ type: 'START_SESSION', id: 'test-session' })
    } else if (!ready) {
      // Add photos after session is started
      for (const photo of photos) {
        sessionCtx.dispatch({ type: 'ADD_PHOTO', photo })
      }
      setReady(true)
    }
  }, [sessionCtx, ready, photos])

  useEffect(() => {
    if (onSession && sessionCtx.session) {
      onSession(sessionCtx)
    }
  })

  if (!ready) return null
  return <>{children}</>
}

function renderCalibration(
  photos: CapturedPhoto[] = [],
  onSession?: (s: ReturnType<typeof useScanSession>) => void,
) {
  return render(
    <ScanSessionProvider>
      <TestWrapper photos={photos} onSession={onSession}>
        <ScaleCalibration />
      </TestWrapper>
    </ScanSessionProvider>,
  )
}

/**
 * Mock the image element properties needed for coordinate conversion.
 * The component reads naturalWidth/naturalHeight and getBoundingClientRect.
 */
function mockImageElement() {
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    get: () => 640,
    configurable: true,
  })
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    get: () => 480,
    configurable: true,
  })
  // getBoundingClientRect returns a rect matching 640x480 at (0,0)
  HTMLImageElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
    left: 0,
    top: 0,
    width: 640,
    height: 480,
    right: 640,
    bottom: 480,
    x: 0,
    y: 0,
    toJSON: vi.fn(),
  })
}

describe('ScaleCalibration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockImageElement()
  })

  it('shows a message when no photos are available', async () => {
    await act(async () => {
      renderCalibration([])
    })

    expect(screen.getByText(/no photos captured/i)).toBeInTheDocument()
  })

  it('renders photo selector thumbnails', async () => {
    const photos = [createMockPhoto(0), createMockPhoto(1), createMockPhoto(2)]

    await act(async () => {
      renderCalibration(photos)
    })

    const thumbs = screen.getAllByRole('button', { name: /select photo/i })
    expect(thumbs).toHaveLength(3)
  })

  it('shows the selected photo when a thumbnail is clicked', async () => {
    const photos = [createMockPhoto(0)]

    await act(async () => {
      renderCalibration(photos)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    expect(screen.getByTestId('calibration-image')).toBeInTheDocument()
  })

  it('shows instruction to set start point before any clicks', async () => {
    const photos = [createMockPhoto(0)]

    await act(async () => {
      renderCalibration(photos)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    expect(screen.getByTestId('line-status')).toHaveTextContent(/click on the image to set the start point/i)
  })

  it('updates instruction after first click to prompt for end point', async () => {
    const photos = [createMockPhoto(0)]

    await act(async () => {
      renderCalibration(photos)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    const img = screen.getByTestId('calibration-image')

    await act(async () => {
      fireEvent.click(img, { clientX: 100, clientY: 100 })
    })

    expect(screen.getByTestId('line-status')).toHaveTextContent(/click again to set the end point/i)
  })

  it('shows line drawn message after two clicks', async () => {
    const photos = [createMockPhoto(0)]

    await act(async () => {
      renderCalibration(photos)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    const img = screen.getByTestId('calibration-image')

    await act(async () => {
      fireEvent.click(img, { clientX: 100, clientY: 100 })
    })

    await act(async () => {
      fireEvent.click(img, { clientX: 200, clientY: 200 })
    })

    expect(screen.getByTestId('line-status')).toHaveTextContent(/line drawn/i)
  })

  it('renders the SVG overlay with start point after first click', async () => {
    const photos = [createMockPhoto(0)]

    await act(async () => {
      renderCalibration(photos)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    const img = screen.getByTestId('calibration-image')

    await act(async () => {
      fireEvent.click(img, { clientX: 100, clientY: 100 })
    })

    expect(screen.getByTestId('line-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('line-start')).toBeInTheDocument()
  })

  it('renders the drawn line after two clicks', async () => {
    const photos = [createMockPhoto(0)]

    await act(async () => {
      renderCalibration(photos)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    const img = screen.getByTestId('calibration-image')

    await act(async () => {
      fireEvent.click(img, { clientX: 100, clientY: 100 })
    })

    await act(async () => {
      fireEvent.click(img, { clientX: 200, clientY: 200 })
    })

    expect(screen.getByTestId('drawn-line')).toBeInTheDocument()
    expect(screen.getByTestId('line-end')).toBeInTheDocument()
  })

  it('disables apply button when line is not drawn or length is empty', async () => {
    const photos = [createMockPhoto(0)]

    await act(async () => {
      renderCalibration(photos)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    expect(screen.getByTestId('apply-calibration')).toBeDisabled()
  })

  it('disables apply button when line is drawn but no length entered', async () => {
    const photos = [createMockPhoto(0)]

    await act(async () => {
      renderCalibration(photos)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    const img = screen.getByTestId('calibration-image')

    await act(async () => {
      fireEvent.click(img, { clientX: 100, clientY: 100 })
    })
    await act(async () => {
      fireEvent.click(img, { clientX: 200, clientY: 200 })
    })

    // Line drawn, but no length entered
    expect(screen.getByTestId('apply-calibration')).toBeDisabled()
  })

  it('enables apply button when line is drawn and valid length is entered', async () => {
    const photos = [createMockPhoto(0)]

    await act(async () => {
      renderCalibration(photos)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    const img = screen.getByTestId('calibration-image')

    await act(async () => {
      fireEvent.click(img, { clientX: 100, clientY: 100 })
    })
    await act(async () => {
      fireEvent.click(img, { clientX: 200, clientY: 200 })
    })
    await act(async () => {
      fireEvent.change(screen.getByTestId('length-input'), { target: { value: '50' } })
    })

    expect(screen.getByTestId('apply-calibration')).toBeEnabled()
  })

  it('stores scale reference in session state when apply is clicked', async () => {
    const photos = [createMockPhoto(0)]
    let capturedSession: ReturnType<typeof useScanSession> | null = null

    await act(async () => {
      renderCalibration(photos, (s) => { capturedSession = s })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    const img = screen.getByTestId('calibration-image')

    // Draw line: (100,100) to (400,100) — pixel coords match since scale is 1:1
    await act(async () => {
      fireEvent.click(img, { clientX: 100, clientY: 100 })
    })
    await act(async () => {
      fireEvent.click(img, { clientX: 400, clientY: 100 })
    })

    // Enter measurement
    await act(async () => {
      fireEvent.change(screen.getByTestId('length-input'), { target: { value: '30' } })
    })

    // Change unit
    await act(async () => {
      fireEvent.change(screen.getByTestId('unit-selector'), { target: { value: 'm' } })
    })

    // Apply
    await act(async () => {
      fireEvent.click(screen.getByTestId('apply-calibration'))
    })

    expect(capturedSession).not.toBeNull()
    const ref = capturedSession!.session!.scaleReference
    expect(ref).toBeDefined()
    expect(ref!.photoIndex).toBe(0)
    expect(ref!.startPoint.x).toBe(100)
    expect(ref!.startPoint.y).toBe(100)
    expect(ref!.endPoint.x).toBe(400)
    expect(ref!.endPoint.y).toBe(100)
    expect(ref!.length).toBe(30)
    expect(ref!.unit).toBe('m')
  })

  it('shows calibration result after applying', async () => {
    const photos = [createMockPhoto(0)]

    await act(async () => {
      renderCalibration(photos)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    const img = screen.getByTestId('calibration-image')

    await act(async () => {
      fireEvent.click(img, { clientX: 0, clientY: 0 })
    })
    await act(async () => {
      fireEvent.click(img, { clientX: 300, clientY: 0 })
    })
    await act(async () => {
      fireEvent.change(screen.getByTestId('length-input'), { target: { value: '50' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('apply-calibration'))
    })

    expect(screen.getByTestId('calibration-result')).toBeInTheDocument()
    expect(screen.getByTestId('calibration-result')).toHaveTextContent(/calibrated/i)
  })

  it('renders length input and unit selector', async () => {
    const photos = [createMockPhoto(0)]

    await act(async () => {
      renderCalibration(photos)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    expect(screen.getByTestId('length-input')).toBeInTheDocument()
    expect(screen.getByTestId('unit-selector')).toBeInTheDocument()

    // Verify all unit options are present
    const select = screen.getByTestId('unit-selector') as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toEqual(['cm', 'm', 'inches', 'feet'])
  })

  it('resets line when a different photo is selected', async () => {
    const photos = [createMockPhoto(0), createMockPhoto(1)]

    await act(async () => {
      renderCalibration(photos)
    })

    // Select first photo and draw a line
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 1/i }))
    })

    const img = screen.getByTestId('calibration-image')

    await act(async () => {
      fireEvent.click(img, { clientX: 100, clientY: 100 })
    })
    await act(async () => {
      fireEvent.click(img, { clientX: 200, clientY: 200 })
    })

    expect(screen.getByTestId('drawn-line')).toBeInTheDocument()

    // Select second photo — line should reset
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select photo 2/i }))
    })

    expect(screen.getByTestId('line-status')).toHaveTextContent(/click on the image to set the start point/i)
    expect(screen.queryByTestId('drawn-line')).not.toBeInTheDocument()
  })
})
