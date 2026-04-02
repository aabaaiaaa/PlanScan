import { useEffect, useRef, useState, useCallback } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'error'

interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: CameraStatus
  errorMessage: string | null
  captureFrame: () => Promise<{ imageData: string; width: number; height: number } | null>
  stopCamera: () => void
  startCamera: () => void
}

const LOW_RES_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    facingMode: 'environment',
  },
  audio: false,
}

/** Capture a frame as a Blob URL instead of a data URL to reduce memory usage */
function canvasToBlobUrl(canvas: HTMLCanvasElement, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Canvas toBlob returned null'))
        resolve(URL.createObjectURL(blob))
      },
      'image/jpeg',
      quality,
    )
  })
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setStatus('idle')
  }, [])

  const startCamera = useCallback(async () => {
    setStatus('requesting')
    setErrorMessage(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia(LOW_RES_CONSTRAINTS)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setStatus('active')
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        setStatus('denied')
        setErrorMessage('Camera access was denied. Please allow camera permissions to capture photos.')
      } else {
        setStatus('error')
        setErrorMessage(
          err instanceof Error
            ? `Camera error: ${err.message}`
            : 'An unknown error occurred while accessing the camera.',
        )
      }
    }
  }, [])

  const captureFrame = useCallback(async (): Promise<{ imageData: string; width: number; height: number } | null> => {
    const video = videoRef.current
    if (!video || status !== 'active') return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0)

    // Use Blob URL instead of data URL to avoid large base64 strings in memory
    const imageData = await canvasToBlobUrl(canvas)

    return {
      imageData,
      width: canvas.width,
      height: canvas.height,
    }
  }, [status])

  useEffect(() => {
    return () => {
      const stream = streamRef.current
      if (stream && typeof stream.getTracks === 'function') {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  return {
    videoRef,
    status,
    errorMessage,
    captureFrame,
    stopCamera,
    startCamera,
  }
}
