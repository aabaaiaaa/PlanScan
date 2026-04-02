/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { BuildingModel, Room, Wall, Door, Window, Staircase } from '../types'
import type { Point3D } from '../types'

// ---------------------------------------------------------------------------
// Mock Three.js — we mock at the DOM level rather than module level
// because verbatimModuleSyntax prevents clean mock hoisting.
// ---------------------------------------------------------------------------

// Mock canvas contexts that jsdom doesn't provide
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = function (contextId: string) {
    if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
      return createMockWebGLContext() as any
    }
    if (contextId === '2d') {
      return createMock2DContext() as any
    }
    return null
  } as any
})

function createMockWebGLContext(): Record<string, any> {
  // GL constants that Three.js reads
  const GL = {
    VERSION: 0x1F02,
    SHADING_LANGUAGE_VERSION: 0x8B8C,
    MAX_TEXTURE_SIZE: 0x0D33,
    MAX_CUBE_MAP_TEXTURE_SIZE: 0x851C,
    MAX_TEXTURE_IMAGE_UNITS: 0x8872,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D,
    MAX_VERTEX_ATTRIBS: 0x8869,
    MAX_VARYING_VECTORS: 0x8DFC,
    MAX_VERTEX_UNIFORM_VECTORS: 0x8DFB,
    MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD,
    MAX_RENDERBUFFER_SIZE: 0x84E8,
    MAX_VIEWPORT_DIMS: 0x0D3A,
    MAX_SAMPLES: 0x8D57,
    RENDERER: 0x1F01,
    VENDOR: 0x1F00,
  }

  const parameterMap: Record<number, any> = {
    [GL.VERSION]: 'WebGL 2.0 (Mock)',
    [GL.SHADING_LANGUAGE_VERSION]: 'WebGL GLSL ES 3.00 (Mock)',
    [GL.MAX_TEXTURE_SIZE]: 4096,
    [GL.MAX_CUBE_MAP_TEXTURE_SIZE]: 4096,
    [GL.MAX_TEXTURE_IMAGE_UNITS]: 16,
    [GL.MAX_VERTEX_TEXTURE_IMAGE_UNITS]: 16,
    [GL.MAX_COMBINED_TEXTURE_IMAGE_UNITS]: 32,
    [GL.MAX_VERTEX_ATTRIBS]: 16,
    [GL.MAX_VARYING_VECTORS]: 16,
    [GL.MAX_VERTEX_UNIFORM_VECTORS]: 256,
    [GL.MAX_FRAGMENT_UNIFORM_VECTORS]: 256,
    [GL.MAX_RENDERBUFFER_SIZE]: 4096,
    [GL.MAX_VIEWPORT_DIMS]: new Int32Array([4096, 4096]),
    [GL.MAX_SAMPLES]: 4,
    [GL.RENDERER]: 'Mock GPU',
    [GL.VENDOR]: 'Mock Vendor',
  }

  const ext = {
    COMPRESSED_RGB_S3TC_DXT1_EXT: 0,
    COMPRESSED_RGBA_S3TC_DXT1_EXT: 0,
    COMPRESSED_RGBA_S3TC_DXT3_EXT: 0,
    COMPRESSED_RGBA_S3TC_DXT5_EXT: 0,
  }

  return new Proxy({} as Record<string, any>, {
    get(_target, prop) {
      const p = prop as string
      // Return GL constants as numbers
      if (p in GL) return GL[p as keyof typeof GL]
      if (p === p.toUpperCase() && p.length > 1) return 0
      // Specific methods
      if (p === 'getExtension') return () => ext
      if (p === 'getParameter') return (pname: number) => parameterMap[pname] ?? 0
      if (p === 'getShaderPrecisionFormat') return () => ({ rangeMin: 127, rangeMax: 127, precision: 23 })
      if (p === 'createShader') return () => ({})
      if (p === 'createProgram') return () => ({})
      if (p === 'createBuffer') return () => ({})
      if (p === 'createFramebuffer') return () => ({})
      if (p === 'createRenderbuffer') return () => ({})
      if (p === 'createTexture') return () => ({})
      if (p === 'createVertexArray') return () => ({})
      if (p === 'getAttribLocation') return () => 0
      if (p === 'getUniformLocation') return () => ({})
      if (p === 'getProgramParameter') return () => true
      if (p === 'getShaderParameter') return () => true
      if (p === 'getShaderInfoLog') return () => ''
      if (p === 'getProgramInfoLog') return () => ''
      if (p === 'getActiveAttrib') return () => ({ name: 'a', type: 5126, size: 1 })
      if (p === 'getActiveUniform') return () => ({ name: 'u', type: 5126, size: 1 })
      if (p === 'getSupportedExtensions') return () => []
      if (p === 'getContextAttributes') return () => ({
        alpha: true, antialias: true, depth: true,
        failIfMajorPerformanceCaveat: false,
        premultipliedAlpha: true, preserveDrawingBuffer: false, stencil: true,
      })
      if (p === 'isContextLost') return () => false
      if (p === 'canvas') return document.createElement('canvas')
      if (p === 'drawingBufferWidth') return 800
      if (p === 'drawingBufferHeight') return 600
      if (p === 'drawingBufferColorSpace') return 'srgb'
      // Default: return a no-op function
      if (typeof p === 'string') return () => {}
      return undefined
    },
  })
}

function createMock2DContext(): Record<string, any> {
  return {
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: () => {},
    fillText: () => {},
    clearRect: () => {},
    measureText: () => ({ width: 50 }),
    strokeRect: () => {},
    strokeText: () => {},
    fill: () => {},
    stroke: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
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
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    canvas: document.createElement('canvas'),
  }
}

// ---------------------------------------------------------------------------
// Now import the actual component (no module-level Three.js mocking needed)
// ---------------------------------------------------------------------------

import { WireframeViewer } from './WireframeViewer'

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

function makeStaircase(): Staircase {
  return {
    id: 'staircase-0',
    fromLevel: 0,
    toLevel: 1,
    bottomPosition: makePoint(2, 0, 1),
    topPosition: makePoint(2, 2.5, 2),
    width: 1.0,
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

describe('WireframeViewer', () => {
  let rafId: number

  beforeEach(() => {
    rafId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => ++rafId)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders a container div with the correct test ID', () => {
    render(<WireframeViewer model={makeModel()} />)
    expect(screen.getByTestId('wireframe-viewer')).toBeInTheDocument()
  })

  it('initializes the renderer and appends a canvas to the container', () => {
    render(<WireframeViewer model={makeModel()} />)
    const container = screen.getByTestId('wireframe-canvas-container')
    expect(container.querySelector('canvas')).toBeInTheDocument()
  })

  it('renders with an empty model without crashing', () => {
    const emptyModel = makeModel({ rooms: [], staircases: [], floorLevels: 0 })
    expect(() => render(<WireframeViewer model={emptyModel} />)).not.toThrow()
    expect(screen.getByTestId('wireframe-viewer')).toBeInTheDocument()
  })

  it('handles a model with doors and windows without crashing', () => {
    const room = makeRoom({
      doors: [makeDoor('d1', 'w1', 2, 0)],
      windows: [makeWindow('win1', 'w2', 4, 1.5)],
    })
    const model = makeModel({ rooms: [room] })
    expect(() => render(<WireframeViewer model={model} />)).not.toThrow()
  })

  it('handles a model with staircases without crashing', () => {
    const model = makeModel({
      staircases: [makeStaircase()],
      floorLevels: 2,
    })
    expect(() => render(<WireframeViewer model={model} />)).not.toThrow()
  })

  it('handles a model with multiple rooms', () => {
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
    })
    const model = makeModel({ rooms: [room1, room2] })
    expect(() => render(<WireframeViewer model={model} />)).not.toThrow()
  })

  it('renders with uncalibrated model (no unit)', () => {
    const model = makeModel({ isCalibrated: false, unit: undefined })
    expect(() => render(<WireframeViewer model={model} />)).not.toThrow()
  })

  it('cleans up on unmount by cancelling animation frame', () => {
    const { unmount } = render(<WireframeViewer model={makeModel()} />)
    unmount()
    expect(window.cancelAnimationFrame).toHaveBeenCalled()
  })

  it('applies width and height style props to the container', () => {
    render(<WireframeViewer model={makeModel()} width={800} height={500} />)
    const container = screen.getByTestId('wireframe-viewer')
    expect(container.style.width).toBe('800px')
    expect(container.style.height).toBe('500px')
  })

  it('defaults to 100% width and 600px height', () => {
    render(<WireframeViewer model={makeModel()} />)
    const container = screen.getByTestId('wireframe-viewer')
    expect(container.style.width).toBe('100%')
    expect(container.style.height).toBe('600px')
  })

  it('handles model with a room that has no walls', () => {
    const room = makeRoom({ walls: [] })
    const model = makeModel({ rooms: [room] })
    expect(() => render(<WireframeViewer model={model} />)).not.toThrow()
  })

  it('starts the animation loop via requestAnimationFrame', () => {
    render(<WireframeViewer model={makeModel()} />)
    expect(window.requestAnimationFrame).toHaveBeenCalled()
  })

  // --- Selection / detail panel tests ---

  it('does not show the detail panel initially (no selection)', () => {
    render(<WireframeViewer model={makeModel()} />)
    expect(screen.queryByTestId('detail-panel')).not.toBeInTheDocument()
  })

  it('renders the canvas container for 3D content', () => {
    render(<WireframeViewer model={makeModel()} />)
    expect(screen.getByTestId('wireframe-canvas-container')).toBeInTheDocument()
  })
})
