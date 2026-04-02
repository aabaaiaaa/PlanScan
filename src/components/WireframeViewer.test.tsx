/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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

  const contextAttributes = {
    alpha: true, antialias: true, depth: true,
    failIfMajorPerformanceCaveat: false,
    premultipliedAlpha: true, preserveDrawingBuffer: false, stencil: true,
  }
  const precisionFormat = { rangeMin: 127, rangeMax: 127, precision: 23 }
  const activeAttrib = { name: 'a', type: 5126, size: 1 }
  const activeUniform = { name: 'u', type: 5126, size: 1 }
  const emptyArray: string[] = []
  const emptyObj = {}

  // Shared canvas element — reused to avoid creating new DOM nodes on every access
  const mockCanvas = document.createElement('canvas')

  // Pre-allocated no-op function — shared across all unknown property accesses
  const noop = () => {}

  // Pre-build a static method map so the Proxy returns the SAME function
  // reference on repeated access (avoids allocating closures per call).
  const methods: Record<string, any> = {
    getExtension: () => ext,
    getParameter: (pname: number) => parameterMap[pname] ?? 0,
    getShaderPrecisionFormat: () => precisionFormat,
    createShader: () => emptyObj,
    createProgram: () => emptyObj,
    createBuffer: () => emptyObj,
    createFramebuffer: () => emptyObj,
    createRenderbuffer: () => emptyObj,
    createTexture: () => emptyObj,
    createVertexArray: () => emptyObj,
    getAttribLocation: () => 0,
    getUniformLocation: () => emptyObj,
    getProgramParameter: () => true,
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getActiveAttrib: () => activeAttrib,
    getActiveUniform: () => activeUniform,
    getSupportedExtensions: () => emptyArray,
    getContextAttributes: () => contextAttributes,
    isContextLost: () => false,
  }

  // Static property values
  const props: Record<string, any> = {
    canvas: mockCanvas,
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
    drawingBufferColorSpace: 'srgb',
  }

  // Cache resolved lookups so repeated access returns the same reference
  const cache = new Map<string, any>()

  return new Proxy({} as Record<string, any>, {
    get(_target, prop) {
      const p = prop as string
      if (cache.has(p)) return cache.get(p)

      let result: any
      if (p in GL) {
        result = GL[p as keyof typeof GL]
      } else if (p in methods) {
        result = methods[p]
      } else if (p in props) {
        result = props[p]
      } else if (p === p.toUpperCase() && p.length > 1) {
        result = 0
      } else if (typeof p === 'string') {
        result = noop
      } else {
        return undefined
      }

      cache.set(p, result)
      return result
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

  // --- Edit mode / correction tests ---

  describe('edit mode', () => {
    it('does not show the edit toggle when onCorrection is not provided', () => {
      render(<WireframeViewer model={makeModel()} />)
      expect(screen.queryByTestId('edit-mode-toggle')).not.toBeInTheDocument()
    })

    it('shows the edit toggle when onCorrection is provided', () => {
      const onCorrection = vi.fn()
      render(<WireframeViewer model={makeModel()} onCorrection={onCorrection} />)
      expect(screen.getByTestId('edit-mode-toggle')).toBeInTheDocument()
      expect(screen.getByTestId('edit-mode-toggle').textContent).toBe('Edit')
    })

    it('toggles edit mode text when the edit button is clicked', () => {
      const onCorrection = vi.fn()
      render(<WireframeViewer model={makeModel()} onCorrection={onCorrection} />)

      const toggle = screen.getByTestId('edit-mode-toggle')
      expect(toggle.textContent).toBe('Edit')

      fireEvent.click(toggle)
      expect(toggle.textContent).toBe('Exit Edit')

      fireEvent.click(toggle)
      expect(toggle.textContent).toBe('Edit')
    })

    it('hides the detail panel when in edit mode', () => {
      const onCorrection = vi.fn()
      render(<WireframeViewer model={makeModel()} onCorrection={onCorrection} />)

      // Enter edit mode
      fireEvent.click(screen.getByTestId('edit-mode-toggle'))

      // Detail panel should not be rendered (there's no selection anyway, but the slot is suppressed)
      expect(screen.queryByTestId('detail-panel')).not.toBeInTheDocument()
    })

    it('does not show a correction popup initially', () => {
      const onCorrection = vi.fn()
      render(<WireframeViewer model={makeModel()} onCorrection={onCorrection} />)
      expect(screen.queryByTestId('correction-popup')).not.toBeInTheDocument()
    })
  })
})
