import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { BuildingModelProvider, useBuildingModel } from './useBuildingModel'
import type { BuildingModel, Door, Window } from '../types'

function wrapper({ children }: { children: React.ReactNode }) {
  return <BuildingModelProvider>{children}</BuildingModelProvider>
}

const sampleModel: BuildingModel = {
  rooms: [
    {
      id: 'room-1',
      name: 'Lounge',
      walls: [
        {
          id: 'wall-1',
          corners: [
            { x: 0, y: 0, z: 0 },
            { x: 4, y: 0, z: 0 },
            { x: 4, y: 2.5, z: 0 },
            { x: 0, y: 2.5, z: 0 },
          ],
          plane: { normal: { x: 0, y: 0, z: 1 }, distance: 0 },
          measurements: { length: 4 },
        },
      ],
      floor: {
        id: 'floor-1',
        boundary: [],
        plane: { normal: { x: 0, y: 1, z: 0 }, distance: 0 },
        level: 0,
      },
      ceiling: {
        id: 'ceil-1',
        boundary: [],
        plane: { normal: { x: 0, y: -1, z: 0 }, distance: 2.5 },
      },
      doors: [],
      windows: [],
      measurements: { width: 3, depth: 4, ceilingHeight: 2.5 },
    },
  ],
  staircases: [],
  isCalibrated: true,
  unit: 'm',
  floorLevels: 1,
}

describe('useBuildingModel', () => {
  it('starts with null model', () => {
    const { result } = renderHook(() => useBuildingModel(), { wrapper })
    expect(result.current.model).toBeNull()
  })

  it('sets and clears a model', () => {
    const { result } = renderHook(() => useBuildingModel(), { wrapper })
    act(() => {
      result.current.dispatch({ type: 'SET_MODEL', model: sampleModel })
    })
    expect(result.current.model).not.toBeNull()
    expect(result.current.model!.rooms).toHaveLength(1)

    act(() => {
      result.current.dispatch({ type: 'CLEAR_MODEL' })
    })
    expect(result.current.model).toBeNull()
  })

  it('adds a door to a room', () => {
    const { result } = renderHook(() => useBuildingModel(), { wrapper })
    act(() => {
      result.current.dispatch({ type: 'SET_MODEL', model: sampleModel })
    })

    const door: Door = {
      id: 'door-new',
      wallId: 'wall-1',
      position: { x: 2, y: 1, z: 0 },
      width: 0.9,
      height: 2.1,
    }
    act(() => {
      result.current.dispatch({ type: 'ADD_DOOR', roomId: 'room-1', door })
    })
    expect(result.current.model!.rooms[0].doors).toHaveLength(1)
    expect(result.current.model!.rooms[0].doors[0].id).toBe('door-new')
  })

  it('removes a door from a room', () => {
    const { result } = renderHook(() => useBuildingModel(), { wrapper })
    const modelWithDoor: BuildingModel = {
      ...sampleModel,
      rooms: [
        {
          ...sampleModel.rooms[0],
          doors: [
            {
              id: 'door-1',
              wallId: 'wall-1',
              position: { x: 2, y: 1, z: 0 },
              width: 0.9,
              height: 2.1,
            },
          ],
        },
      ],
    }
    act(() => {
      result.current.dispatch({ type: 'SET_MODEL', model: modelWithDoor })
    })
    expect(result.current.model!.rooms[0].doors).toHaveLength(1)

    act(() => {
      result.current.dispatch({
        type: 'REMOVE_DOOR',
        roomId: 'room-1',
        doorId: 'door-1',
      })
    })
    expect(result.current.model!.rooms[0].doors).toHaveLength(0)
  })

  it('adds and removes a window', () => {
    const { result } = renderHook(() => useBuildingModel(), { wrapper })
    act(() => {
      result.current.dispatch({ type: 'SET_MODEL', model: sampleModel })
    })

    const win: Window = {
      id: 'win-1',
      wallId: 'wall-1',
      position: { x: 3, y: 1.5, z: 0 },
      width: 1.2,
      height: 1.0,
      sillHeight: 0.9,
    }
    act(() => {
      result.current.dispatch({
        type: 'ADD_WINDOW',
        roomId: 'room-1',
        window: win,
      })
    })
    expect(result.current.model!.rooms[0].windows).toHaveLength(1)

    act(() => {
      result.current.dispatch({
        type: 'REMOVE_WINDOW',
        roomId: 'room-1',
        windowId: 'win-1',
      })
    })
    expect(result.current.model!.rooms[0].windows).toHaveLength(0)
  })

  it('updates a room', () => {
    const { result } = renderHook(() => useBuildingModel(), { wrapper })
    act(() => {
      result.current.dispatch({ type: 'SET_MODEL', model: sampleModel })
    })

    const updatedRoom = {
      ...sampleModel.rooms[0],
      name: 'Renamed Room',
    }
    act(() => {
      result.current.dispatch({ type: 'UPDATE_ROOM', room: updatedRoom })
    })
    expect(result.current.model!.rooms[0].name).toBe('Renamed Room')
  })

  it('splits a room into two', () => {
    const { result } = renderHook(() => useBuildingModel(), { wrapper })

    // Create a model with a room that has a proper floor boundary
    const modelWithFloor: BuildingModel = {
      ...sampleModel,
      rooms: [
        {
          ...sampleModel.rooms[0],
          floor: {
            ...sampleModel.rooms[0].floor,
            boundary: [
              { x: 0, y: 0, z: 0 },
              { x: 4, y: 0, z: 0 },
              { x: 4, y: 0, z: 6 },
              { x: 0, y: 0, z: 6 },
            ],
          },
          ceiling: {
            ...sampleModel.rooms[0].ceiling,
            boundary: [
              { x: 0, y: 2.5, z: 0 },
              { x: 4, y: 2.5, z: 0 },
              { x: 4, y: 2.5, z: 6 },
              { x: 0, y: 2.5, z: 6 },
            ],
          },
        },
      ],
    }

    act(() => {
      result.current.dispatch({ type: 'SET_MODEL', model: modelWithFloor })
    })
    expect(result.current.model!.rooms).toHaveLength(1)

    act(() => {
      result.current.dispatch({
        type: 'SPLIT_ROOM',
        roomId: 'room-1',
        splitStart: { x: 0, y: 0, z: 3 },
        splitEnd: { x: 4, y: 0, z: 3 },
      })
    })

    expect(result.current.model!.rooms).toHaveLength(2)
    expect(result.current.model!.rooms[0].name).toContain('Lounge')
    expect(result.current.model!.rooms[1].name).toContain('Lounge')
  })

  it('merges two rooms into one', () => {
    const { result } = renderHook(() => useBuildingModel(), { wrapper })

    // Create a model with a splittable room
    const modelWithFloor: BuildingModel = {
      ...sampleModel,
      rooms: [
        {
          ...sampleModel.rooms[0],
          floor: {
            ...sampleModel.rooms[0].floor,
            boundary: [
              { x: 0, y: 0, z: 0 },
              { x: 4, y: 0, z: 0 },
              { x: 4, y: 0, z: 6 },
              { x: 0, y: 0, z: 6 },
            ],
          },
          ceiling: {
            ...sampleModel.rooms[0].ceiling,
            boundary: [
              { x: 0, y: 2.5, z: 0 },
              { x: 4, y: 2.5, z: 0 },
              { x: 4, y: 2.5, z: 6 },
              { x: 0, y: 2.5, z: 6 },
            ],
          },
        },
      ],
    }

    act(() => {
      result.current.dispatch({ type: 'SET_MODEL', model: modelWithFloor })
    })

    // Split
    act(() => {
      result.current.dispatch({
        type: 'SPLIT_ROOM',
        roomId: 'room-1',
        splitStart: { x: 0, y: 0, z: 3 },
        splitEnd: { x: 4, y: 0, z: 3 },
      })
    })
    expect(result.current.model!.rooms).toHaveLength(2)

    const roomIdA = result.current.model!.rooms[0].id
    const roomIdB = result.current.model!.rooms[1].id

    // Merge
    act(() => {
      result.current.dispatch({
        type: 'MERGE_ROOMS',
        roomIdA,
        roomIdB,
      })
    })
    expect(result.current.model!.rooms).toHaveLength(1)
  })

  it('ignores SPLIT_ROOM when room not found', () => {
    const { result } = renderHook(() => useBuildingModel(), { wrapper })
    act(() => {
      result.current.dispatch({ type: 'SET_MODEL', model: sampleModel })
    })

    act(() => {
      result.current.dispatch({
        type: 'SPLIT_ROOM',
        roomId: 'nonexistent',
        splitStart: { x: 0, y: 0, z: 3 },
        splitEnd: { x: 4, y: 0, z: 3 },
      })
    })
    expect(result.current.model!.rooms).toHaveLength(1)
  })

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useBuildingModel())
    }).toThrow('useBuildingModel must be used within a BuildingModelProvider')
  })
})
