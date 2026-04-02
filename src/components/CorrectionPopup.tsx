import type { Wall } from '../types'
import type { Point3D } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CorrectionAction =
  | { type: 'addDoor'; roomId: string; wall: Wall; clickPosition: Point3D }
  | { type: 'addWindow'; roomId: string; wall: Wall; clickPosition: Point3D }
  | { type: 'removeDoor'; roomId: string; doorId: string }
  | { type: 'removeWindow'; roomId: string; windowId: string }

export type CorrectionTarget =
  | { type: 'wall'; roomId: string; wall: Wall; clickPosition: Point3D }
  | { type: 'door'; roomId: string; doorId: string }
  | { type: 'window'; roomId: string; windowId: string }

export interface CorrectionPopupProps {
  x: number
  y: number
  target: CorrectionTarget
  onAction: (action: CorrectionAction) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const popupButtonStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  background: 'none',
  border: 'none',
  color: '#fff',
  padding: '6px 8px',
  textAlign: 'left',
  cursor: 'pointer',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'inherit',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CorrectionPopup({ x, y, target, onAction, onClose }: CorrectionPopupProps) {
  return (
    <div
      data-testid="correction-popup"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        background: 'rgba(30, 30, 50, 0.95)',
        color: '#fff',
        borderRadius: 8,
        padding: 8,
        zIndex: 100,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        minWidth: 140,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {target.type === 'wall' && (
        <>
          <div
            style={{
              padding: '4px 8px',
              color: '#aaa',
              fontSize: 11,
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              marginBottom: 4,
            }}
          >
            Add to wall
          </div>
          <button
            data-testid="add-door-btn"
            onClick={() => {
              onAction({
                type: 'addDoor',
                roomId: target.roomId,
                wall: target.wall,
                clickPosition: target.clickPosition,
              })
              onClose()
            }}
            style={popupButtonStyle}
          >
            Add Door
          </button>
          <button
            data-testid="add-window-btn"
            onClick={() => {
              onAction({
                type: 'addWindow',
                roomId: target.roomId,
                wall: target.wall,
                clickPosition: target.clickPosition,
              })
              onClose()
            }}
            style={popupButtonStyle}
          >
            Add Window
          </button>
        </>
      )}
      {target.type === 'door' && (
        <button
          data-testid="remove-door-btn"
          onClick={() => {
            onAction({
              type: 'removeDoor',
              roomId: target.roomId,
              doorId: target.doorId,
            })
            onClose()
          }}
          style={{ ...popupButtonStyle, color: '#ff6b6b' }}
        >
          Remove Door
        </button>
      )}
      {target.type === 'window' && (
        <button
          data-testid="remove-window-btn"
          onClick={() => {
            onAction({
              type: 'removeWindow',
              roomId: target.roomId,
              windowId: target.windowId,
            })
            onClose()
          }}
          style={{ ...popupButtonStyle, color: '#ff6b6b' }}
        >
          Remove Window
        </button>
      )}
      <button
        data-testid="correction-cancel-btn"
        onClick={onClose}
        style={{
          ...popupButtonStyle,
          color: '#888',
          marginTop: 4,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingTop: 8,
        }}
      >
        Cancel
      </button>
    </div>
  )
}
