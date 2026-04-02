import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailPanel } from './DetailPanel'
import type { SelectedElement } from './DetailPanel'
import type { Wall, Room, Door, Window } from '../types'
import type { Point3D } from '../types'

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makePoint(x: number, y: number, z: number): Point3D {
  return { x, y, z }
}

function makeWall(id: string, x1: number, z1: number, x2: number, z2: number, height = 2.5): Wall {
  return {
    id,
    corners: [
      makePoint(x1, 0, z1),
      makePoint(x2, 0, z2),
      makePoint(x2, height, z2),
      makePoint(x1, height, z1),
    ],
    plane: { normal: makePoint(0, 0, 1), distance: 0 },
    measurements: { length: Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2) },
  }
}

function makeDoor(id: string, wallId: string, x: number, z: number): Door {
  return {
    id,
    wallId,
    position: makePoint(x, 1.0, z),
    width: 0.9,
    height: 2.0,
  }
}

function makeWindow(id: string, wallId: string, x: number, z: number): Window {
  return {
    id,
    wallId,
    position: makePoint(x, 1.5, z),
    width: 1.2,
    height: 1.0,
    sillHeight: 0.9,
  }
}

function makeRoom(overrides?: Partial<Room>): Room {
  return {
    id: 'room-0',
    name: 'Living Room',
    walls: [
      makeWall('w1', 0, 0, 4, 0),
      makeWall('w2', 4, 0, 4, 3),
      makeWall('w3', 4, 3, 0, 3),
      makeWall('w4', 0, 3, 0, 0),
    ],
    floor: {
      id: 'floor-0',
      boundary: [
        makePoint(0, 0, 0),
        makePoint(4, 0, 0),
        makePoint(4, 0, 3),
        makePoint(0, 0, 3),
      ],
      plane: { normal: makePoint(0, 1, 0), distance: 0 },
      level: 0,
    },
    ceiling: {
      id: 'ceiling-0',
      boundary: [
        makePoint(0, 2.5, 0),
        makePoint(4, 2.5, 0),
        makePoint(4, 2.5, 3),
        makePoint(0, 2.5, 3),
      ],
      plane: { normal: makePoint(0, -1, 0), distance: 2.5 },
    },
    doors: [makeDoor('d1', 'w1', 2, 0)],
    windows: [makeWindow('win1', 'w2', 4, 1.5)],
    measurements: { width: 3, depth: 4, ceilingHeight: 2.5 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DetailPanel', () => {
  const noop = () => {}

  it('renders nothing when selection is null', () => {
    const { container } = render(
      <DetailPanel selection={null} unit="m" onClose={noop} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders panel with wall details when a wall is selected', () => {
    const wall = makeWall('w1', 0, 0, 4, 0, 2.5)
    const selection: SelectedElement = {
      type: 'wall',
      wall,
      roomId: 'room-0',
      roomName: 'Living Room',
    }
    render(<DetailPanel selection={selection} unit="m" onClose={noop} />)

    expect(screen.getByTestId('detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('wall-details')).toBeInTheDocument()
    expect(screen.getByText('Wall (Living Room)')).toBeInTheDocument()
    // Wall is 4m long, 2.5m high
    expect(screen.getByText('4 m')).toBeInTheDocument()
    expect(screen.getByText('2.5 m')).toBeInTheDocument()
  })

  it('renders panel with room details when a room is selected', () => {
    const room = makeRoom()
    const selection: SelectedElement = {
      type: 'room',
      room,
    }
    render(<DetailPanel selection={selection} unit="m" onClose={noop} />)

    expect(screen.getByTestId('detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('room-details')).toBeInTheDocument()
    expect(screen.getByText('Living Room')).toBeInTheDocument()
    // Room is 3m wide, 4m deep, 2.5m ceiling
    expect(screen.getByText('3 m')).toBeInTheDocument()
    expect(screen.getByText('4 m')).toBeInTheDocument()
    expect(screen.getByText('2.5 m')).toBeInTheDocument()
  })

  it('renders panel with door details when a door is selected', () => {
    const door = makeDoor('d1', 'w1', 2, 0)
    const selection: SelectedElement = {
      type: 'door',
      door,
      roomId: 'room-0',
      roomName: 'Bedroom',
    }
    render(<DetailPanel selection={selection} unit="m" onClose={noop} />)

    expect(screen.getByTestId('detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('door-details')).toBeInTheDocument()
    expect(screen.getByText('Door (Bedroom)')).toBeInTheDocument()
    // Door is 0.9m wide, 2m high
    expect(screen.getByText('0.9 m')).toBeInTheDocument()
    expect(screen.getByText('2 m')).toBeInTheDocument()
  })

  it('renders panel with window details when a window is selected', () => {
    const win = makeWindow('win1', 'w2', 4, 1.5)
    const selection: SelectedElement = {
      type: 'window',
      window: win,
      roomId: 'room-0',
      roomName: 'Kitchen',
    }
    render(<DetailPanel selection={selection} unit="m" onClose={noop} />)

    expect(screen.getByTestId('detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('window-details')).toBeInTheDocument()
    expect(screen.getByText('Window (Kitchen)')).toBeInTheDocument()
    // Window is 1.2m wide, 1m high, 0.9m sill
    expect(screen.getByText('1.2 m')).toBeInTheDocument()
    expect(screen.getByText('1 m')).toBeInTheDocument()
    expect(screen.getByText('0.9 m')).toBeInTheDocument()
  })

  it('renders values without unit when unit is undefined', () => {
    const wall = makeWall('w1', 0, 0, 5, 0, 3)
    const selection: SelectedElement = {
      type: 'wall',
      wall,
      roomId: 'room-0',
      roomName: 'Room 1',
    }
    render(<DetailPanel selection={selection} onClose={noop} />)

    // Should show plain numbers without unit
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    const wall = makeWall('w1', 0, 0, 4, 0)
    const selection: SelectedElement = {
      type: 'wall',
      wall,
      roomId: 'room-0',
      roomName: 'Room 1',
    }
    render(<DetailPanel selection={selection} unit="m" onClose={onClose} />)

    fireEvent.click(screen.getByTestId('detail-panel-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows room wall/door/window counts', () => {
    const room = makeRoom()
    const selection: SelectedElement = { type: 'room', room }
    render(<DetailPanel selection={selection} unit="m" onClose={noop} />)

    // 4 walls, 1 door, 1 window
    expect(screen.getByText('4')).toBeInTheDocument()
    const ones = screen.getAllByText('1')
    expect(ones.length).toBe(2) // 1 door + 1 window
  })

  it('shows wall ID in wall details', () => {
    const wall = makeWall('wall-abc', 0, 0, 3, 0)
    const selection: SelectedElement = {
      type: 'wall',
      wall,
      roomId: 'room-0',
      roomName: 'Room 1',
    }
    render(<DetailPanel selection={selection} unit="m" onClose={noop} />)
    expect(screen.getByText('wall-abc')).toBeInTheDocument()
  })

  it('shows door wall reference', () => {
    const door = makeDoor('d1', 'wall-xyz', 2, 0)
    const selection: SelectedElement = {
      type: 'door',
      door,
      roomId: 'room-0',
      roomName: 'Room',
    }
    render(<DetailPanel selection={selection} unit="m" onClose={noop} />)
    expect(screen.getByText('wall-xyz')).toBeInTheDocument()
  })

  it('shows window wall reference and sill height', () => {
    const win = makeWindow('win1', 'wall-pqr', 4, 1.5)
    const selection: SelectedElement = {
      type: 'window',
      window: win,
      roomId: 'room-0',
      roomName: 'Room',
    }
    render(<DetailPanel selection={selection} unit="ft" onClose={noop} />)
    expect(screen.getByText('wall-pqr')).toBeInTheDocument()
    expect(screen.getByText('0.9 ft')).toBeInTheDocument()
  })
})
