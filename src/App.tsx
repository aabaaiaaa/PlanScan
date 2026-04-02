import { useState, useCallback, useEffect, Component, type ReactNode } from 'react'
import { ScanSessionProvider, useScanSession } from './hooks/useScanSession'
import { BuildingModelProvider, useBuildingModel } from './hooks/useBuildingModel'
import { useReconstruction } from './hooks/useReconstruction'
import { CameraCapture } from './components/CameraCapture'
import { ScaleCalibration } from './components/ScaleCalibration'
import { ReconstructionProgress } from './components/ReconstructionProgress'
import { WireframeViewer } from './components/WireframeViewer'
import { FloorPlanViewer } from './components/FloorPlanViewer'
import type { OpenCV } from './types/opencv'
import type { CorrectionAction } from './components/CorrectionPopup'
import './App.css'

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<{ children: ReactNode; fallbackMessage?: string }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <h2>{this.props.fallbackMessage ?? 'Something went wrong'}</h2>
          <p style={{ color: '#888' }}>{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 16, padding: '8px 20px', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

type AppPhase = 'start' | 'capture' | 'calibrate' | 'reconstruct' | 'view'
type ViewMode = '3d' | '2d'

const PHASE_LABELS: Record<AppPhase, string> = {
  start: 'Start',
  capture: 'Capture',
  calibrate: 'Calibrate',
  reconstruct: 'Reconstruct',
  view: 'View',
}

const PHASE_ORDER: AppPhase[] = ['start', 'capture', 'calibrate', 'reconstruct', 'view']

function AppContent() {
  const [phase, setPhase] = useState<AppPhase>('start')
  const [viewMode, setViewMode] = useState<ViewMode>('3d')
  const { session, dispatch: sessionDispatch } = useScanSession()
  const { model, dispatch: modelDispatch } = useBuildingModel()
  const reconstruction = useReconstruction()

  // Start a new scan session and go to capture
  const handleNewScan = useCallback(() => {
    sessionDispatch({ type: 'RESET' })
    modelDispatch({ type: 'CLEAR_MODEL' })
    reconstruction.reset()
    sessionDispatch({ type: 'START_SESSION', id: crypto.randomUUID() })
    setPhase('capture')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDispatch, modelDispatch, reconstruction.reset])

  // End capture and go to calibration
  const handleDoneCapturing = useCallback(() => {
    sessionDispatch({ type: 'END_SESSION' })
    setPhase('calibrate')
  }, [sessionDispatch])

  // Go to reconstruction (from calibration)
  const handleStartReconstruction = useCallback(() => {
    setPhase('reconstruct')
  }, [])

  // Trigger reconstruction when entering the reconstruct phase
  useEffect(() => {
    if (phase !== 'reconstruct') return
    if (reconstruction.status === 'running') return

    const run = async () => {
      if (!session) return

      reconstruction.reset()
      modelDispatch({ type: 'CLEAR_MODEL' })

      try {
        // Load OpenCV.js dynamically
        const cvModule = await import('opencv.js')
        const cv = (cvModule.default ?? cvModule) as unknown as OpenCV
        await reconstruction.startReconstruction(
          cv,
          session.photos,
          session.scaleReference,
        )
      } catch {
        // Error is already handled inside useReconstruction
      }
    }

    run()
    // Only run when entering the reconstruct phase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // When reconstruction completes, set the model
  useEffect(() => {
    if (reconstruction.status === 'complete' && reconstruction.model) {
      modelDispatch({ type: 'SET_MODEL', model: reconstruction.model })
    }
  }, [reconstruction.status, reconstruction.model, modelDispatch])

  // Go to viewer
  const handleViewModel = useCallback(() => {
    setPhase('view')
  }, [])

  // Go back to capture to add more photos
  const handleBackToCapture = useCallback(() => {
    sessionDispatch({ type: 'REOPEN_SESSION' })
    setPhase('capture')
  }, [sessionDispatch])

  // Retry reconstruction
  const handleRetry = useCallback(() => {
    reconstruction.reset()
    setPhase('reconstruct')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconstruction.reset])

  // Handle correction actions from viewers
  const handleCorrection = useCallback((action: CorrectionAction) => {

    if (action.type === 'addDoor') {
      modelDispatch({
        type: 'ADD_DOOR',
        roomId: action.roomId,
        door: {
          id: `door-${Date.now()}`,
          wallId: action.wall.id,
          position: action.clickPosition,
          width: 0.9,
          height: 2.1,
        },
      })
    } else if (action.type === 'addWindow') {
      modelDispatch({
        type: 'ADD_WINDOW',
        roomId: action.roomId,
        window: {
          id: `window-${Date.now()}`,
          wallId: action.wall.id,
          position: action.clickPosition,
          width: 1.2,
          height: 1.0,
          sillHeight: 0.9,
        },
      })
    } else if (action.type === 'removeDoor') {
      modelDispatch({ type: 'REMOVE_DOOR', roomId: action.roomId, doorId: action.doorId })
    } else if (action.type === 'removeWindow') {
      modelDispatch({ type: 'REMOVE_WINDOW', roomId: action.roomId, windowId: action.windowId })
    } else if (action.type === 'splitRoom') {
      modelDispatch({
        type: 'SPLIT_ROOM',
        roomId: action.roomId,
        splitStart: action.splitStart,
        splitEnd: action.splitEnd,
      })
    } else if (action.type === 'mergeRooms') {
      modelDispatch({
        type: 'MERGE_ROOMS',
        roomIdA: action.roomIdA,
        roomIdB: action.roomIdB,
      })
    }
  }, [modelDispatch])

  const photoCount = session?.photos.length ?? 0
  const currentPhaseIndex = PHASE_ORDER.indexOf(phase)

  return (
    <div className="app">
      {/* Header */}
      <header className="app__header">
        <h1 className="app__title">PlanScan</h1>
        {phase !== 'start' && (
          <nav className="app__breadcrumbs" data-testid="phase-breadcrumbs">
            {PHASE_ORDER.map((p, i) => (
              <span
                key={p}
                className={`app__breadcrumb ${p === phase ? 'app__breadcrumb--active' : ''} ${i < currentPhaseIndex ? 'app__breadcrumb--done' : ''}`}
              >
                {PHASE_LABELS[p]}
              </span>
            ))}
          </nav>
        )}
      </header>

      {/* Phase content */}
      <main className="app__content">
        {/* Start screen */}
        {phase === 'start' && (
          <div className="app__start" data-testid="start-screen">
            <div className="app__start-hero">
              <h2>Capture &amp; Reconstruct</h2>
              <p>
                Walk through your space, snap photos, and generate a 3D wireframe
                model with real-world measurements — all in the browser.
              </p>
              <button
                className="app__btn app__btn--primary app__btn--large"
                onClick={handleNewScan}
                data-testid="new-scan-btn"
              >
                New Scan
              </button>
            </div>
          </div>
        )}

        {/* Capture phase */}
        {phase === 'capture' && (
          <div className="app__capture" data-testid="capture-phase">
            <CameraCapture />
            <div className="app__nav-bar">
              <button
                className="app__btn app__btn--secondary"
                onClick={() => setPhase('start')}
              >
                Cancel
              </button>
              <button
                className="app__btn app__btn--primary"
                onClick={handleDoneCapturing}
                disabled={photoCount < 2}
                data-testid="done-capturing-btn"
              >
                Done Capturing ({photoCount} photos)
              </button>
            </div>
          </div>
        )}

        {/* Calibration phase */}
        {phase === 'calibrate' && (
          <div className="app__calibrate" data-testid="calibrate-phase">
            <ScaleCalibration />
            <div className="app__nav-bar">
              <button
                className="app__btn app__btn--secondary"
                onClick={handleBackToCapture}
              >
                Back to Capture
              </button>
              <div className="app__nav-bar-right">
                <button
                  className="app__btn app__btn--secondary"
                  onClick={handleStartReconstruction}
                  data-testid="skip-calibration-btn"
                >
                  Skip
                </button>
                <button
                  className="app__btn app__btn--primary"
                  onClick={handleStartReconstruction}
                  disabled={!session?.scaleReference}
                  data-testid="next-reconstruct-btn"
                >
                  Reconstruct
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reconstruction phase */}
        {phase === 'reconstruct' && (
          <div className="app__reconstruct" data-testid="reconstruct-phase">
            <ReconstructionProgress
              status={reconstruction.status}
              progress={reconstruction.progress}
              errors={reconstruction.errors}
              warnings={reconstruction.warnings}
              onRetry={handleRetry}
              onDismiss={handleViewModel}
            />
            {reconstruction.status === 'error' && (
              <div className="app__nav-bar">
                <button
                  className="app__btn app__btn--secondary"
                  onClick={handleBackToCapture}
                >
                  Add More Photos
                </button>
              </div>
            )}
          </div>
        )}

        {/* View phase */}
        {phase === 'view' && model && (
          <div className="app__view" data-testid="view-phase">
            <div className="app__view-toolbar">
              <div className="app__view-toggle" data-testid="view-toggle">
                <button
                  className={`app__btn ${viewMode === '3d' ? 'app__btn--primary' : 'app__btn--secondary'}`}
                  onClick={() => setViewMode('3d')}
                  data-testid="view-3d-btn"
                >
                  3D Wireframe
                </button>
                <button
                  className={`app__btn ${viewMode === '2d' ? 'app__btn--primary' : 'app__btn--secondary'}`}
                  onClick={() => setViewMode('2d')}
                  data-testid="view-2d-btn"
                >
                  2D Floor Plan
                </button>
              </div>
              <div className="app__view-actions">
                <button
                  className="app__btn app__btn--secondary"
                  onClick={handleBackToCapture}
                  data-testid="add-more-photos-btn"
                >
                  Add More Photos
                </button>
                <button
                  className="app__btn app__btn--secondary"
                  onClick={handleNewScan}
                  data-testid="new-scan-from-view-btn"
                >
                  New Scan
                </button>
              </div>
            </div>

            <div className="app__viewer" data-testid="viewer-container">
              <ErrorBoundary fallbackMessage="Viewer failed to render">
                {viewMode === '3d' ? (
                  <WireframeViewer
                    model={model}
                    onCorrection={handleCorrection}
                    height="calc(100vh - 180px)"
                  />
                ) : (
                  <FloorPlanViewer
                    model={model}
                    onCorrection={handleCorrection}
                    height="calc(100vh - 180px)"
                  />
                )}
              </ErrorBoundary>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ScanSessionProvider>
        <BuildingModelProvider>
          <AppContent />
        </BuildingModelProvider>
      </ScanSessionProvider>
    </ErrorBoundary>
  )
}

export default App
