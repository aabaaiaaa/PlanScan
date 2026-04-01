import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { CameraCapture } from './CameraCapture'
import { ScanSessionProvider, useScanSession } from '../hooks/useScanSession'
import { useEffect, useState } from 'react'

// Mock MediaStream with proper getTracks
function createMockStream(): MediaStream {
  const track = {
    stop: vi.fn(),
    kind: 'video' as const,
    id: 'mock-track',
    enabled: true,
    readyState: 'live' as const,
    clone: vi.fn(),
    getCapabilities: vi.fn().mockReturnValue({}),
    getConstraints: vi.fn().mockReturnValue({}),
    getSettings: vi.fn().mockReturnValue({}),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn().mockReturnValue(true),
    contentHint: '',
    label: 'mock',
    muted: false,
    onended: null,
    onmute: null,
    onunmute: null,
  } as unknown as MediaStreamTrack

  const tracks = [track]

  return {
    getTracks: vi.fn(() => tracks),
    getVideoTracks: vi.fn(() => tracks),
    getAudioTracks: vi.fn(() => []),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    clone: vi.fn(),
    active: true,
    id: 'mock-stream',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn().mockReturnValue(true),
    onaddtrack: null,
    onremovetrack: null,
  } as unknown as MediaStream
}

function mockVideoElement() {
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
    get: () => 640,
    configurable: true,
  })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
    get: () => 480,
    configurable: true,
  })
  HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)
}

function mockCanvas() {
  const drawImage = vi.fn()
  const toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,mockdata')
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage,
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toDataURL = toDataURL
  return { drawImage, toDataURL }
}

function setupMediaDevicesSuccess(stream: MediaStream) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    configurable: true,
    writable: true,
  })
}

function setupMediaDevicesFailure(error: Error | DOMException) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockRejectedValue(error) },
    configurable: true,
    writable: true,
  })
}

function setupMediaDevicesHang() {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockReturnValue(new Promise(() => {})) },
    configurable: true,
    writable: true,
  })
}

/**
 * Wrapper that auto-starts a scan session before rendering children.
 * Optionally exposes session state via callback.
 */
function TestWrapper({
  children,
  onSession,
}: {
  children: React.ReactNode
  onSession?: (ctx: ReturnType<typeof useScanSession>) => void
}) {
  const sessionCtx = useScanSession()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!sessionCtx.session) {
      sessionCtx.dispatch({ type: 'START_SESSION', id: 'test-session' })
    } else if (!ready) {
      setReady(true)
    }
  }, [sessionCtx, ready])

  useEffect(() => {
    if (onSession && sessionCtx.session) {
      onSession(sessionCtx)
    }
  })

  if (!ready) return null
  return <>{children}</>
}

function renderCamera(onSession?: (s: ReturnType<typeof useScanSession>) => void) {
  return render(
    <ScanSessionProvider>
      <TestWrapper onSession={onSession}>
        <CameraCapture />
      </TestWrapper>
    </ScanSessionProvider>,
  )
}

describe('CameraCapture', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockVideoElement()
    mockCanvas()
  })

  it('renders the video element and capture button when camera is granted', async () => {
    setupMediaDevicesSuccess(createMockStream())

    await act(async () => {
      renderCamera()
    })

    expect(screen.getByRole('button', { name: /capture photo/i })).toBeInTheDocument()
    expect(document.querySelector('video')).toBeInTheDocument()
  })

  it('shows error message when camera permission is denied', async () => {
    const permError = new DOMException('Permission denied', 'NotAllowedError')
    setupMediaDevicesFailure(permError)

    await act(async () => {
      renderCamera()
    })

    await waitFor(() => {
      expect(screen.getByText(/camera access was denied/i)).toBeInTheDocument()
    })
  })

  it('shows error message for generic camera errors', async () => {
    setupMediaDevicesFailure(new Error('No camera found'))

    await act(async () => {
      renderCamera()
    })

    await waitFor(() => {
      expect(screen.getByText(/camera error: no camera found/i)).toBeInTheDocument()
    })
  })

  it('displays photo count starting at 0', async () => {
    setupMediaDevicesSuccess(createMockStream())

    await act(async () => {
      renderCamera()
    })

    expect(screen.getByTestId('photo-count')).toHaveTextContent('0 photos')
  })

  it('increments photo count when shutter button is clicked', async () => {
    setupMediaDevicesSuccess(createMockStream())

    await act(async () => {
      renderCamera()
    })

    const captureBtn = screen.getByRole('button', { name: /capture photo/i })

    await act(async () => {
      fireEvent.click(captureBtn)
    })

    expect(screen.getByTestId('photo-count')).toHaveTextContent('1 photo')

    await act(async () => {
      fireEvent.click(captureBtn)
    })

    expect(screen.getByTestId('photo-count')).toHaveTextContent('2 photos')
  })

  it('stores captured photo with correct structure in session state', async () => {
    setupMediaDevicesSuccess(createMockStream())

    let capturedSession: ReturnType<typeof useScanSession> | null = null

    await act(async () => {
      renderCamera((s) => { capturedSession = s })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /capture photo/i }))
    })

    expect(capturedSession).not.toBeNull()
    const photo = capturedSession!.session!.photos[0]
    expect(photo.index).toBe(0)
    expect(photo.imageData).toBe('data:image/jpeg;base64,mockdata')
    expect(photo.width).toBe(640)
    expect(photo.height).toBe(480)
    expect(photo.tags).toEqual([])
    expect(photo.capturedAt).toBeGreaterThan(0)
  })

  it('disables capture button when camera is not active', async () => {
    // getUserMedia never resolves — camera stays in 'requesting' state
    setupMediaDevicesHang()

    await act(async () => {
      renderCamera()
    })

    const btn = screen.getByRole('button', { name: /capture photo/i })
    expect(btn).toBeDisabled()
  })
})
