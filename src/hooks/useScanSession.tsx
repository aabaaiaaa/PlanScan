import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
} from 'react'
import type {
  ScanSession,
  CapturedPhoto,
  ScaleReference,
  PhotoTag,
} from '../types'

// --- Actions ---

type ScanSessionAction =
  | { type: 'START_SESSION'; id: string }
  | { type: 'END_SESSION' }
  | { type: 'ADD_PHOTO'; photo: CapturedPhoto }
  | { type: 'TAG_PHOTO'; photoIndex: number; tag: PhotoTag }
  | { type: 'UNTAG_PHOTO'; photoIndex: number; tag: PhotoTag }
  | { type: 'SET_SCALE_REFERENCE'; scaleReference: ScaleReference }
  | { type: 'CLEAR_SCALE_REFERENCE' }
  | { type: 'REOPEN_SESSION' }
  | { type: 'RESET' }

// --- Reducer ---

function scanSessionReducer(
  state: ScanSession | null,
  action: ScanSessionAction,
): ScanSession | null {
  switch (action.type) {
    case 'START_SESSION':
      return {
        id: action.id,
        photos: [],
        startedAt: Date.now(),
      }

    case 'END_SESSION':
      if (!state) return state
      return { ...state, endedAt: Date.now() }

    case 'ADD_PHOTO':
      if (!state) return state
      return { ...state, photos: [...state.photos, action.photo] }

    case 'TAG_PHOTO': {
      if (!state) return state
      const photos = state.photos.map((p) =>
        p.index === action.photoIndex && !p.tags.includes(action.tag)
          ? { ...p, tags: [...p.tags, action.tag] }
          : p,
      )
      return { ...state, photos }
    }

    case 'UNTAG_PHOTO': {
      if (!state) return state
      const photos = state.photos.map((p) =>
        p.index === action.photoIndex
          ? { ...p, tags: p.tags.filter((t) => t !== action.tag) }
          : p,
      )
      return { ...state, photos }
    }

    case 'SET_SCALE_REFERENCE':
      if (!state) return state
      return { ...state, scaleReference: action.scaleReference }

    case 'CLEAR_SCALE_REFERENCE':
      if (!state) return state
      return { ...state, scaleReference: undefined }

    case 'REOPEN_SESSION': {
      if (!state) return state
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { endedAt: _, ...reopened } = state
      return reopened as ScanSession
    }

    case 'RESET':
      return null
  }
}

// --- Context ---

interface ScanSessionContextValue {
  session: ScanSession | null
  dispatch: React.Dispatch<ScanSessionAction>
}

const ScanSessionContext = createContext<ScanSessionContextValue | null>(null)

export function ScanSessionProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(scanSessionReducer, null)

  return (
    <ScanSessionContext.Provider value={{ session, dispatch }}>
      {children}
    </ScanSessionContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useScanSession(): ScanSessionContextValue {
  const ctx = useContext(ScanSessionContext)
  if (!ctx) {
    throw new Error('useScanSession must be used within a ScanSessionProvider')
  }
  return ctx
}
