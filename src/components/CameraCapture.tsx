import { useCallback, useEffect, useMemo } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useScanSession } from '../hooks/useScanSession'
import type { CapturedPhoto, PhotoTag } from '../types'

export function CameraCapture() {
  const { videoRef, status, errorMessage, captureFrame, startCamera, stopCamera } = useCamera()
  const { session, dispatch } = useScanSession()

  // Auto-start camera on mount. On iOS Safari, getUserMedia may require
  // a recent user gesture — the phase transition button click satisfies this.
  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [startCamera, stopCamera])

  const handleCapture = useCallback(async () => {
    const frame = await captureFrame()
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

  const handleTag = useCallback((tag: PhotoTag) => {
    if (!session || session.photos.length === 0) return
    const lastPhoto = session.photos[session.photos.length - 1]
    dispatch({ type: 'TAG_PHOTO', photoIndex: lastPhoto.index, tag })
  }, [session, dispatch])

  const photoCount = session?.photos.length ?? 0

  const tagCounts = useMemo(() => {
    if (!session) return { doorway: 0, window: 0 }
    let doorway = 0
    let window = 0
    for (const photo of session.photos) {
      if (photo.tags.includes('doorway')) doorway++
      if (photo.tags.includes('window')) window++
    }
    return { doorway, window }
  }, [session])

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
        {status === 'idle' && (
          <button
            className="camera-capture__start-btn"
            onClick={startCamera}
            data-testid="start-camera-btn"
          >
            Start Camera
          </button>
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

      <div className="camera-capture__tagging">
        <button
          className="camera-capture__tag-btn camera-capture__tag-btn--doorway"
          onClick={() => handleTag('doorway')}
          disabled={photoCount === 0}
          aria-label="Tag as doorway"
        >
          Doorway
        </button>
        <button
          className="camera-capture__tag-btn camera-capture__tag-btn--window"
          onClick={() => handleTag('window')}
          disabled={photoCount === 0}
          aria-label="Tag as window"
        >
          Window
        </button>
      </div>

      <div className="camera-capture__tag-counts" data-testid="tag-counts">
        {tagCounts.doorway} {tagCounts.doorway === 1 ? 'doorway' : 'doorways'},{' '}
        {tagCounts.window} {tagCounts.window === 1 ? 'window' : 'windows'} tagged
      </div>
    </div>
  )
}
