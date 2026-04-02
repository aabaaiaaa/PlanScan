/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { BuildingModel, Room, Wall, Door, Window, Staircase } from '../types'
import type { Point3D } from '../types'

// ---------------------------------------------------------------------------
// Mock 2D canvas context — jsdom doesn't provide a real one
// ---------------------------------------------------------------------------

let drawCalls: string[] = []

beforeEach(() => {
  drawCalls = []

  HTMLCanvasElement.prototype.getContext = function (contextId: string) {
    if (contextId === '2d') {
      return createTracking2DContext() as any
    }
    return null
  } as any

  // Mock getBoundingClientRect to return a reasonable size
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800,
    height: 500,
    top: 0,
    left: 0,
    bottom: 500,
    right: 800,
    x: 0,
    y: 0,
    toJSON: () => {},
  })
})

function createTracking2DContext(): Record<string, any> {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: (...args: any[]) => drawCalls.push(`fillRect(${args.join(',')})`),
    fillText: (text: string, ...rest: any[]) => drawCalls.push(`fillText(${text},${rest.join(',')})`),
    clearRect: () => {},
    measureText: () => ({ width: 50 }),
    strokeRect: () => {},
    strokeText: () => {},
    fill: () => {},
    stroke: () => drawCalls.push('stroke'),
    beginPath: () => drawCalls.push('beginPath'),
    closePath: () => {},
    moveTo: (...args: any[]) => drawCalls.push(`moveTo(${args.join(',')})`),
    lineTo: (...args: any[]) => drawCalls.push(`lineTo(${args.join(',')})`),
    arc: (...args: any[]) => drawCalls.push(`arc(${args.join(',')})`),
    roundRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    getLineDash: () => [],
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    canvas: document.createElement('canvas'),
  }
}

// ---------------------------------------------------------------------------
// Import the component after mocking
// ---------------------------------------------------------------------------

import { FloorPlanViewer } from './FloorPlanViewer'

// ---------------------------------------------------------------------------
// Test data factories (same as WireframeViewer tests)
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
    name: 'Room 1',
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
    doors: [],
    windows: [],
    measurements: { width: 3, depth: 4, ceilingHeight: 2.5 },
    ...overrides,
  }
}

function makeModel(overrides?: Partial<BuildingModel>): BuildingModel {
  return {
    rooms: [makeRoom()],
    staircases: [],
    isCalibrated: true,
    unit: 'm',
    floorLevels: 1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FloorPlanViewer', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders a container div with the correct test ID', () => {
    render(<FloorPlanViewer model={makeModel()} />)
    expect(screen.getByTestId('floor-plan-viewer')).toBeInTheDocument()
  })

  it('renders a canvas element', () => {
    render(<FloorPlanViewer model={makeModel()} />)
    expect(screen.getByTestId('floor-plan-canvas')).toBeInTheDocument()
  })

  it('renders with an empty model without crashing', () => {
    const emptyModel = makeModel({ rooms: [], staircases: [], floorLevels: 0 })
    expect(() => render(<FloorPlanViewer model={emptyModel} />)).not.toThrow()
    expect(screen.getByTestId('floor-plan-viewer')).toBeInTheDocument()
  })

  it('displays "No rooms on this floor" for empty floor', () => {
    const emptyModel = makeModel({ rooms: [], floorLevels: 0 })
    render(<FloorPlanViewer model={emptyModel} />)
    expect(drawCalls.some((c) => c.includes('No rooms on this floor'))).toBe(true)
  })

  it('draws walls as lines on the canvas', () => {
    render(<FloorPlanViewer model={makeModel()} />)
    // Should have multiple stroke calls for walls
    const strokeCalls = drawCalls.filter((c) => c === 'stroke')
    expect(strokeCalls.length).toBeGreaterThan(0)
  })

  it('draws wall length labels', () => {
    render(<FloorPlanViewer model={makeModel()} />)
    // Wall lengths: 4m (two walls) and 3m (two walls)
    const labelCalls = drawCalls.filter((c) => c.startsWith('fillText('))
    expect(labelCalls.length).toBeGreaterThan(0)
    // Should contain wall measurement labels
    const hasWallMeasurement = labelCalls.some(
      (c) => c.includes('4 m') || c.includes('3 m'),
    )
    expect(hasWallMeasurement).toBe(true)
  })

  it('draws room name and dimension labels', () => {
    render(<FloorPlanViewer model={makeModel()} />)
    const labelCalls = drawCalls.filter((c) => c.startsWith('fillText('))
    const hasRoomName = labelCalls.some((c) => c.includes('Room 1'))
    expect(hasRoomName).toBe(true)
  })

  it('handles a model with doors', () => {
    const room = makeRoom({
      doors: [makeDoor('d1', 'w1', 2, 0)],
    })
    const model = makeModel({ rooms: [room] })
    expect(() => render(<FloorPlanViewer model={model} />)).not.toThrow()
    // Door arcs should generate arc calls
    const arcCalls = drawCalls.filter((c) => c.startsWith('arc('))
    expect(arcCalls.length).toBeGreaterThan(0)
  })

  it('handles a model with windows', () => {
    const room = makeRoom({
      windows: [makeWindow('win1', 'w2', 4, 1.5)],
    })
    const model = makeModel({ rooms: [room] })
    expect(() => render(<FloorPlanViewer model={model} />)).not.toThrow()
  })

  it('handles a model with doors and windows together', () => {
    const room = makeRoom({
      doors: [makeDoor('d1', 'w1', 2, 0)],
      windows: [makeWindow('win1', 'w2', 4, 1.5)],
    })
    const model = makeModel({ rooms: [room] })
    expect(() => render(<FloorPlanViewer model={model} />)).not.toThrow()
  })

  it('filters rooms by floor level', () => {
    const room0 = makeRoom({ id: 'room-0', name: 'Ground Floor Room' })
    const room1 = makeRoom({
      id: 'room-1',
      name: 'First Floor Room',
      floor: {
        id: 'floor-1',
        boundary: [
          makePoint(0, 2.5, 0),
          makePoint(4, 2.5, 0),
          makePoint(4, 2.5, 3),
          makePoint(0, 2.5, 3),
        ],
        plane: { normal: makePoint(0, 1, 0), distance: 2.5 },
        level: 1,
      },
    })
    const model = makeModel({ rooms: [room0, room1], floorLevels: 2 })

    // Render floor 0 — should show ground floor room only
    render(<FloorPlanViewer model={model} floorLevel={0} />)
    const labelCalls = drawCalls.filter((c) => c.startsWith('fillText('))
    expect(labelCalls.some((c) => c.includes('Ground Floor Room'))).toBe(true)
    expect(labelCalls.some((c) => c.includes('First Floor Room'))).toBe(false)
  })

  it('shows first floor rooms when floorLevel is 1', () => {
    const room0 = makeRoom({ id: 'room-0', name: 'Ground Floor Room' })
    const room1 = makeRoom({
      id: 'room-1',
      name: 'First Floor Room',
      floor: {
        id: 'floor-1',
        boundary: [
          makePoint(0, 2.5, 0),
          makePoint(4, 2.5, 0),
          makePoint(4, 2.5, 3),
          makePoint(0, 2.5, 3),
        ],
        plane: { normal: makePoint(0, 1, 0), distance: 2.5 },
        level: 1,
      },
    })
    const model = makeModel({ rooms: [room0, room1], floorLevels: 2 })

    render(<FloorPlanViewer model={model} floorLevel={1} />)
    const labelCalls = drawCalls.filter((c) => c.startsWith('fillText('))
    expect(labelCalls.some((c) => c.includes('First Floor Room'))).toBe(true)
    expect(labelCalls.some((c) => c.includes('Ground Floor Room'))).toBe(false)
  })

  it('renders with uncalibrated model (no unit)', () => {
    const model = makeModel({ isCalibrated: false, unit: undefined })
    expect(() => render(<FloorPlanViewer model={model} />)).not.toThrow()
    // Labels should still appear, just without unit
    const labelCalls = drawCalls.filter((c) => c.startsWith('fillText('))
    expect(labelCalls.length).toBeGreaterThan(0)
    // Should NOT include 'm' unit
    const hasUnit = labelCalls.some((c) => c.includes(' m'))
    expect(hasUnit).toBe(false)
  })

  it('applies width and height style props to the container', () => {
    render(<FloorPlanViewer model={makeModel()} width={800} height={600} />)
    const container = screen.getByTestId('floor-plan-viewer')
    expect(container.style.width).toBe('800px')
    expect(container.style.height).toBe('600px')
  })

  it('defaults to 100% width and 500px height', () => {
    render(<FloorPlanViewer model={makeModel()} />)
    const container = screen.getByTestId('floor-plan-viewer')
    expect(container.style.width).toBe('100%')
    expect(container.style.height).toBe('500px')
  })

  it('handles a room with no walls', () => {
    const room = makeRoom({ walls: [] })
    const model = makeModel({ rooms: [room] })
    expect(() => render(<FloorPlanViewer model={model} />)).not.toThrow()
  })

  it('handles multiple rooms on the same floor', () => {
    const room1 = makeRoom({ id: 'room-0', name: 'Room 1' })
    const room2 = makeRoom({
      id: 'room-1',
      name: 'Room 2',
      walls: [
        makeWall('w5', 4, 0, 8, 0),
        makeWall('w6', 8, 0, 8, 3),
        makeWall('w7', 8, 3, 4, 3),
        makeWall('w8', 4, 3, 4, 0),
      ],
      floor: {
        id: 'floor-1',
        boundary: [
          makePoint(4, 0, 0),
          makePoint(8, 0, 0),
          makePoint(8, 0, 3),
          makePoint(4, 0, 3),
        ],
        plane: { normal: makePoint(0, 1, 0), distance: 0 },
        level: 0,
      },
    })
    const model = makeModel({ rooms: [room1, room2] })
    expect(() => render(<FloorPlanViewer model={model} />)).not.toThrow()

    const labelCalls = drawCalls.filter((c) => c.startsWith('fillText('))
    expect(labelCalls.some((c) => c.includes('Room 1'))).toBe(true)
    expect(labelCalls.some((c) => c.includes('Room 2'))).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Floor switcher tests (TASK-015)
  // ---------------------------------------------------------------------------

  describe('floor switcher', () => {
    function makeMultiFloorModel() {
      const room0 = makeRoom({ id: 'room-0', name: 'Ground Floor Room' })
      const room1 = makeRoom({
        id: 'room-1',
        name: 'First Floor Room',
        floor: {
          id: 'floor-1',
          boundary: [
            makePoint(0, 2.5, 0),
            makePoint(4, 2.5, 0),
            makePoint(4, 2.5, 3),
            makePoint(0, 2.5, 3),
          ],
          plane: { normal: makePoint(0, 1, 0), distance: 2.5 },
          level: 1,
        },
      })
      return makeModel({ rooms: [room0, room1], floorLevels: 2 })
    }

    it('is hidden when there is only one floor', () => {
      const singleFloor = makeModel({ floorLevels: 1 })
      render(<FloorPlanViewer model={singleFloor} />)
      expect(screen.queryByTestId('floor-switcher')).not.toBeInTheDocument()
    })

    it('is hidden when floorLevels is 0', () => {
      const model = makeModel({ rooms: [], floorLevels: 0 })
      render(<FloorPlanViewer model={model} />)
      expect(screen.queryByTestId('floor-switcher')).not.toBeInTheDocument()
    })

    it('is visible when there are multiple floors', () => {
      render(<FloorPlanViewer model={makeMultiFloorModel()} />)
      expect(screen.getByTestId('floor-switcher')).toBeInTheDocument()
    })

    it('renders a button for each floor level', () => {
      render(<FloorPlanViewer model={makeMultiFloorModel()} />)
      expect(screen.getByTestId('floor-button-0')).toBeInTheDocument()
      expect(screen.getByTestId('floor-button-1')).toBeInTheDocument()
    })

    it('labels floor 0 as "Ground" and floor 1 as "Floor 1"', () => {
      render(<FloorPlanViewer model={makeMultiFloorModel()} />)
      expect(screen.getByTestId('floor-button-0').textContent).toBe('Ground')
      expect(screen.getByTestId('floor-button-1').textContent).toBe('Floor 1')
    })

    it('highlights the selected floor button', () => {
      render(<FloorPlanViewer model={makeMultiFloorModel()} />)
      const btn0 = screen.getByTestId('floor-button-0')
      const btn1 = screen.getByTestId('floor-button-1')
      // Default: floor 0 is selected (jsdom normalises #333 to rgb(51, 51, 51))
      expect(btn0.style.background).toBe('rgb(51, 51, 51)')
      expect(btn1.style.background).toBe('transparent')
    })

    it('switches floors when a button is clicked', () => {
      render(<FloorPlanViewer model={makeMultiFloorModel()} />)

      // Click floor 1 button
      fireEvent.click(screen.getByTestId('floor-button-1'))

      // Floor 1 button should now be highlighted
      const btn0 = screen.getByTestId('floor-button-0')
      const btn1 = screen.getByTestId('floor-button-1')
      expect(btn1.style.background).toBe('rgb(51, 51, 51)')
      expect(btn0.style.background).toBe('transparent')
    })

    it('renders correct rooms after switching floors', () => {
      render(<FloorPlanViewer model={makeMultiFloorModel()} />)

      // Initially floor 0: should draw Ground Floor Room
      let labelCalls = drawCalls.filter((c) => c.startsWith('fillText('))
      expect(labelCalls.some((c) => c.includes('Ground Floor Room'))).toBe(true)

      // Switch to floor 1
      drawCalls = []
      fireEvent.click(screen.getByTestId('floor-button-1'))

      labelCalls = drawCalls.filter((c) => c.startsWith('fillText('))
      expect(labelCalls.some((c) => c.includes('First Floor Room'))).toBe(true)
      expect(labelCalls.some((c) => c.includes('Ground Floor Room'))).toBe(false)
    })

    it('calls onFloorChange callback when a floor is selected', () => {
      const onFloorChange = vi.fn()
      render(
        <FloorPlanViewer model={makeMultiFloorModel()} onFloorChange={onFloorChange} />,
      )

      fireEvent.click(screen.getByTestId('floor-button-1'))
      expect(onFloorChange).toHaveBeenCalledWith(1)

      fireEvent.click(screen.getByTestId('floor-button-0'))
      expect(onFloorChange).toHaveBeenCalledWith(0)
    })

    it('renders three buttons for a three-floor model', () => {
      const room0 = makeRoom({ id: 'r0', name: 'R0' })
      const room1 = makeRoom({
        id: 'r1',
        name: 'R1',
        floor: { id: 'f1', boundary: [], plane: { normal: makePoint(0, 1, 0), distance: 2.5 }, level: 1 },
      })
      const room2 = makeRoom({
        id: 'r2',
        name: 'R2',
        floor: { id: 'f2', boundary: [], plane: { normal: makePoint(0, 1, 0), distance: 5 }, level: 2 },
      })
      const model = makeModel({ rooms: [room0, room1, room2], floorLevels: 3 })
      render(<FloorPlanViewer model={model} />)

      expect(screen.getByTestId('floor-button-0')).toBeInTheDocument()
      expect(screen.getByTestId('floor-button-1')).toBeInTheDocument()
      expect(screen.getByTestId('floor-button-2')).toBeInTheDocument()
      expect(screen.getByTestId('floor-button-2').textContent).toBe('Floor 2')
    })
  })
})
