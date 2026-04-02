import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScanSession } from '../hooks/useScanSession'
import { calculatePixelToRealWorldRatio } from '../utils/scaleCalibration'
import type { MeasurementUnit, Point2D, ScaleReference } from '../types'

const UNITS: MeasurementUnit[] = ['cm', 'm', 'inches', 'feet']

interface LineState {
  start: Point2D | null
  end: Point2D | null
}

export function ScaleCalibration() {
  const { session, dispatch } = useScanSession()
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null)
  const [line, setLine] = useState<LineState>({ start: null, end: null })
  const [length, setLength] = useState('')
  const [unit, setUnit] = useState<MeasurementUnit>('cm')
  const imageRef = useRef<HTMLImageElement>(null)

  const photos = session?.photos ?? []
  const selectedPhoto = selectedPhotoIndex !== null ? photos[selectedPhotoIndex] : null

  const handlePhotoSelect = useCallback((index: number) => {
    setSelectedPhotoIndex(index)
    setLine({ start: null, end: null })
  }, [])

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      const img = imageRef.current
      if (!img) return

      const rect = img.getBoundingClientRect()
      // Convert click position to pixel coordinates relative to the original image
      const scaleX = img.naturalWidth / rect.width
      const scaleY = img.naturalHeight / rect.height
      const x = (e.clientX - rect.left) * scaleX
      const y = (e.clientY - rect.top) * scaleY
      const point: Point2D = { x, y }

      setLine((prev) => {
        if (!prev.start) {
          return { start: point, end: null }
        }
        if (!prev.end) {
          return { ...prev, end: point }
        }
        // If both points set, restart with new start point
        return { start: point, end: null }
      })
    },
    [],
  )

  const canApply = line.start !== null && line.end !== null && parseFloat(length) > 0

  const handleApply = useCallback(() => {
    if (!line.start || !line.end || selectedPhotoIndex === null) return
    const parsedLength = parseFloat(length)
    if (isNaN(parsedLength) || parsedLength <= 0) return

    const scaleReference: ScaleReference = {
      photoIndex: selectedPhotoIndex,
      startPoint: line.start,
      endPoint: line.end,
      length: parsedLength,
      unit,
    }

    dispatch({ type: 'SET_SCALE_REFERENCE', scaleReference })
  }, [line, selectedPhotoIndex, length, unit, dispatch])

  const scaleRef = session?.scaleReference ?? null
  const currentRatio = useMemo(() => {
    if (!scaleRef) return null
    return calculatePixelToRealWorldRatio(scaleRef)
  }, [scaleRef])

  // Convert line points to display coordinates for the SVG overlay
  const [displayLine, setDisplayLine] = useState<{
    start: { x: number; y: number }
    end: { x: number; y: number } | null
  } | null>(null)

  useEffect(() => {
    if (!line.start || !imageRef.current) {
      setDisplayLine(null) // eslint-disable-line react-hooks/set-state-in-effect -- syncing ref dimensions to state
      return
    }
    const img = imageRef.current
    const rect = img.getBoundingClientRect()
    const scaleX = rect.width / img.naturalWidth
    const scaleY = rect.height / img.naturalHeight

    const startDisplay = {
      x: line.start.x * scaleX,
      y: line.start.y * scaleY,
    }

    const endDisplay = line.end
      ? { x: line.end.x * scaleX, y: line.end.y * scaleY }
      : null

    setDisplayLine({ start: startDisplay, end: endDisplay })
  }, [line])

  if (photos.length === 0) {
    return (
      <div className="scale-calibration" data-testid="scale-calibration">
        <p>No photos captured. Take some photos first.</p>
      </div>
    )
  }

  return (
    <div className="scale-calibration" data-testid="scale-calibration">
      <h2>Scale Calibration</h2>
      <p>Select a photo with a tape measure, draw a line over a known length, and enter the measurement.</p>

      {/* Photo selector */}
      <div className="scale-calibration__photos" data-testid="photo-selector">
        {photos.map((photo) => (
          <button
            key={photo.index}
            className={`scale-calibration__thumb ${selectedPhotoIndex === photo.index ? 'scale-calibration__thumb--selected' : ''}`}
            onClick={() => handlePhotoSelect(photo.index)}
            aria-label={`Select photo ${photo.index + 1}`}
          >
            <img src={photo.imageData} alt={`Photo ${photo.index + 1}`} width={80} height={60} />
          </button>
        ))}
      </div>

      {/* Selected photo with line drawing overlay */}
      {selectedPhoto && (
        <div className="scale-calibration__editor">
          <div className="scale-calibration__image-container" style={{ position: 'relative', display: 'inline-block' }}>
            <img
              ref={imageRef}
              src={selectedPhoto.imageData}
              alt={`Selected photo ${selectedPhoto.index + 1}`}
              className="scale-calibration__image"
              onClick={handleImageClick}
              style={{ maxWidth: '100%', cursor: 'crosshair', display: 'block' }}
              data-testid="calibration-image"
            />
            {/* SVG overlay for the drawn line */}
            {displayLine && (
              <svg
                className="scale-calibration__overlay"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
                data-testid="line-overlay"
              >
                {/* Start point */}
                <circle
                  cx={displayLine.start.x}
                  cy={displayLine.start.y}
                  r={5}
                  fill="red"
                  data-testid="line-start"
                />
                {/* End point and connecting line */}
                {displayLine.end && (
                  <>
                    <line
                      x1={displayLine.start.x}
                      y1={displayLine.start.y}
                      x2={displayLine.end.x}
                      y2={displayLine.end.y}
                      stroke="red"
                      strokeWidth={2}
                      data-testid="drawn-line"
                    />
                    <circle
                      cx={displayLine.end.x}
                      cy={displayLine.end.y}
                      r={5}
                      fill="red"
                      data-testid="line-end"
                    />
                  </>
                )}
              </svg>
            )}
          </div>

          <div className="scale-calibration__line-status" data-testid="line-status">
            {!line.start && 'Click on the image to set the start point'}
            {line.start && !line.end && 'Click again to set the end point'}
            {line.start && line.end && 'Line drawn. Enter the real-world measurement below.'}
          </div>

          {/* Measurement input */}
          <div className="scale-calibration__measurement">
            <label htmlFor="scale-length">Length:</label>
            <input
              id="scale-length"
              type="number"
              min="0"
              step="any"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              placeholder="e.g. 50"
              data-testid="length-input"
            />
            <label htmlFor="scale-unit">Unit:</label>
            <select
              id="scale-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as MeasurementUnit)}
              data-testid="unit-selector"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <button
              onClick={handleApply}
              disabled={!canApply}
              data-testid="apply-calibration"
            >
              Apply Calibration
            </button>
          </div>
        </div>
      )}

      {/* Show current calibration status */}
      {session?.scaleReference && currentRatio !== null && (
        <div className="scale-calibration__result" data-testid="calibration-result">
          Calibrated: {session.scaleReference.length} {session.scaleReference.unit} over{' '}
          {Math.round(currentRatio * 1000) / 1000} {session.scaleReference.unit}/px
        </div>
      )}
    </div>
  )
}
