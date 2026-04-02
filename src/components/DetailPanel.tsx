import type { Wall, Room, Door, Window } from '../types'
import {
  calculateWallLength,
  calculateWallHeight,
  calculateRoomDimensions,
} from '../utils/measurementCalculation'

// ---------------------------------------------------------------------------
// Selection types
// ---------------------------------------------------------------------------

export type SelectedElement =
  | { type: 'wall'; wall: Wall; roomId: string; roomName: string }
  | { type: 'room'; room: Room }
  | { type: 'door'; door: Door; roomId: string; roomName: string }
  | { type: 'window'; window: Window; roomId: string; roomName: string }

export interface DetailPanelProps {
  selection: SelectedElement | null
  unit?: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt(value: number, unit?: string): string {
  const rounded = Math.round(value * 100) / 100
  return unit ? `${rounded} ${unit}` : `${rounded}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DetailPanel({ selection, unit, onClose }: DetailPanelProps) {
  if (!selection) return null

  return (
    <div
      data-testid="detail-panel"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 280,
        height: '100%',
        background: 'rgba(20, 20, 40, 0.95)',
        color: '#ffffff',
        padding: 16,
        boxSizing: 'border-box',
        overflowY: 'auto',
        borderLeft: '1px solid rgba(255,255,255,0.15)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{panelTitle(selection)}</h3>
        <button
          data-testid="detail-panel-close"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#aaa',
            fontSize: 20,
            cursor: 'pointer',
            padding: '0 4px',
          }}
          aria-label="Close detail panel"
        >
          &times;
        </button>
      </div>

      {renderDetails(selection, unit)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

function panelTitle(selection: SelectedElement): string {
  switch (selection.type) {
    case 'wall':
      return `Wall (${selection.roomName})`
    case 'room':
      return selection.room.name
    case 'door':
      return `Door (${selection.roomName})`
    case 'window':
      return `Window (${selection.roomName})`
  }
}

// ---------------------------------------------------------------------------
// Detail renderers
// ---------------------------------------------------------------------------

function renderDetails(selection: SelectedElement, unit?: string) {
  switch (selection.type) {
    case 'wall':
      return <WallDetails wall={selection.wall} unit={unit} />
    case 'room':
      return <RoomDetails room={selection.room} unit={unit} />
    case 'door':
      return <DoorDetails door={selection.door} unit={unit} />
    case 'window':
      return <WindowDetails window={selection.window} unit={unit} />
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div data-testid="detail-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <span style={{ color: '#aaa' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function WallDetails({ wall, unit }: { wall: Wall; unit?: string }) {
  const length = calculateWallLength(wall)
  const height = calculateWallHeight(wall)
  return (
    <div data-testid="wall-details">
      <Row label="Length" value={fmt(length, unit)} />
      <Row label="Height" value={fmt(height, unit)} />
      <Row label="ID" value={wall.id} />
    </div>
  )
}

function RoomDetails({ room, unit }: { room: Room; unit?: string }) {
  const dims = calculateRoomDimensions(room)
  return (
    <div data-testid="room-details">
      <Row label="Width" value={fmt(dims.width, unit)} />
      <Row label="Depth" value={fmt(dims.depth, unit)} />
      <Row label="Ceiling height" value={fmt(dims.ceilingHeight, unit)} />
      <Row label="Walls" value={String(room.walls.length)} />
      <Row label="Doors" value={String(room.doors.length)} />
      <Row label="Windows" value={String(room.windows.length)} />
    </div>
  )
}

function DoorDetails({ door, unit }: { door: Door; unit?: string }) {
  return (
    <div data-testid="door-details">
      <Row label="Width" value={fmt(door.width, unit)} />
      <Row label="Height" value={fmt(door.height, unit)} />
      <Row label="Wall" value={door.wallId} />
    </div>
  )
}

function WindowDetails({ window, unit }: { window: Window; unit?: string }) {
  return (
    <div data-testid="window-details">
      <Row label="Width" value={fmt(window.width, unit)} />
      <Row label="Height" value={fmt(window.height, unit)} />
      <Row label="Sill height" value={fmt(window.sillHeight, unit)} />
      <Row label="Wall" value={window.wallId} />
    </div>
  )
}
