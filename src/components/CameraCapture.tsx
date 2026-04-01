import { useCallback, useEffect } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useScanSession } from '../hooks/useScanSession'
import type { CapturedPhoto } from '../types'

export function CameraCapture() {
  const { videoRef, status, errorMessage, captureFrame, startCamera, stopCamera } = useCamera()
  const { session, dispatch } = useScanSession()

  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [startCamera, stopCamera])

  const handleCapture = useCallback(() => {
    const frame = captureFrame()
    if (!frame || !session) return

    const photo: CapturedPhoto = {
      index: session.photos.length,
      imageData: frame.imageData,
      width: frame.width,
      height: frame.height,
      tags: [],
      capturedAt: Date.now(),
    }

    dispatch({ type: 'ADD_PHOTO', photo })
  }, [captureFrame, session, dispatch])

  const photoCount = session?.photos.length ?? 0

  if (status === 'denied') {
    return (
      <div className="camera-capture camera-capture--denied">
        <p className="camera-capture__error">{errorMessage}</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="camera-capture camera-capture--error">
        <p className="camera-capture__error">{errorMessage}</p>
      </div>
    )
  }

  return (
    <div className="camera-capture">
      <div className="camera-capture__viewfinder">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-capture__video"
        />
        {status === 'requesting' && (
          <p className="camera-capture__status">Requesting camera access…</p>
        )}
      </div>

      <div className="camera-capture__controls">
        <span className="camera-capture__count" data-testid="photo-count">
          {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
        </span>
        <button
          className="camera-capture__shutter"
          onClick={handleCapture}
          disabled={status !== 'active'}
          aria-label="Capture photo"
        >
          Capture
        </button>
      </div>
    </div>
  )
}
