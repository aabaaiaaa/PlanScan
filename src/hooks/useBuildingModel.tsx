import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
} from 'react'
import type { BuildingModel, Door, Room, Window } from '../types'
import type { Point3D } from '../types'
import { splitRoom, mergeRooms } from '../utils/roomBoundaryAdjustment'
import { recalculateMeasurements } from '../utils/measurementCalculation'

// --- Actions ---

type BuildingModelAction =
  | { type: 'SET_MODEL'; model: BuildingModel }
  | { type: 'CLEAR_MODEL' }
  | { type: 'ADD_DOOR'; roomId: string; door: Door }
  | { type: 'REMOVE_DOOR'; roomId: string; doorId: string }
  | { type: 'ADD_WINDOW'; roomId: string; window: Window }
  | { type: 'REMOVE_WINDOW'; roomId: string; windowId: string }
  | { type: 'UPDATE_ROOM'; room: Room }
  | { type: 'SPLIT_ROOM'; roomId: string; splitStart: Point3D; splitEnd: Point3D }
  | { type: 'MERGE_ROOMS'; roomIdA: string; roomIdB: string }

// --- Reducer ---

function buildingModelReducer(
  state: BuildingModel | null,
  action: BuildingModelAction,
): BuildingModel | null {
  switch (action.type) {
    case 'SET_MODEL':
      return action.model

    case 'CLEAR_MODEL':
      return null

    case 'ADD_DOOR': {
      if (!state) return state
      const rooms = state.rooms.map((r) =>
        r.id === action.roomId
          ? { ...r, doors: [...r.doors, action.door] }
          : r,
      )
      return { ...state, rooms }
    }

    case 'REMOVE_DOOR': {
      if (!state) return state
      const rooms = state.rooms.map((r) =>
        r.id === action.roomId
          ? { ...r, doors: r.doors.filter((d) => d.id !== action.doorId) }
          : r,
      )
      return { ...state, rooms }
    }

    case 'ADD_WINDOW': {
      if (!state) return state
      const rooms = state.rooms.map((r) =>
        r.id === action.roomId
          ? { ...r, windows: [...r.windows, action.window] }
          : r,
      )
      return { ...state, rooms }
    }

    case 'REMOVE_WINDOW': {
      if (!state) return state
      const rooms = state.rooms.map((r) =>
        r.id === action.roomId
          ? {
              ...r,
              windows: r.windows.filter((w) => w.id !== action.windowId),
            }
          : r,
      )
      return { ...state, rooms }
    }

    case 'UPDATE_ROOM': {
      if (!state) return state
      const rooms = state.rooms.map((r) =>
        r.id === action.room.id ? action.room : r,
      )
      return { ...state, rooms }
    }

    case 'SPLIT_ROOM': {
      if (!state) return state
      const room = state.rooms.find((r) => r.id === action.roomId)
      if (!room) return state
      const result = splitRoom(room, action.splitStart, action.splitEnd)
      if (!result) return state
      const [roomA, roomB] = result
      const rooms = state.rooms.flatMap((r) =>
        r.id === action.roomId ? [roomA, roomB] : [r],
      )
      return recalculateMeasurements({ ...state, rooms })
    }

    case 'MERGE_ROOMS': {
      if (!state) return state
      const roomA = state.rooms.find((r) => r.id === action.roomIdA)
      const roomB = state.rooms.find((r) => r.id === action.roomIdB)
      if (!roomA || !roomB) return state
      const merged = mergeRooms(roomA, roomB)
      const rooms = state.rooms.filter(
        (r) => r.id !== action.roomIdA && r.id !== action.roomIdB,
      )
      rooms.push(merged)
      return recalculateMeasurements({ ...state, rooms })
    }
  }
}

// --- Context ---

interface BuildingModelContextValue {
  model: BuildingModel | null
  dispatch: React.Dispatch<BuildingModelAction>
}

const BuildingModelContext = createContext<BuildingModelContextValue | null>(
  null,
)

export function BuildingModelProvider({ children }: { children: ReactNode }) {
  const [model, dispatch] = useReducer(buildingModelReducer, null)

  return (
    <BuildingModelContext.Provider value={{ model, dispatch }}>
      {children}
    </BuildingModelContext.Provider>
  )
}

export function useBuildingModel(): BuildingModelContextValue {
  const ctx = useContext(BuildingModelContext)
  if (!ctx) {
    throw new Error(
      'useBuildingModel must be used within a BuildingModelProvider',
    )
  }
  return ctx
}
