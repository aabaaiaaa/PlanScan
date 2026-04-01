import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ScanSessionProvider, useScanSession } from './useScanSession'
import type { CapturedPhoto, ScaleReference } from '../types'

function wrapper({ children }: { children: React.ReactNode }) {
  return <ScanSessionProvider>{children}</ScanSessionProvider>
}

describe('useScanSession', () => {
  it('starts with null session', () => {
    const { result } = renderHook(() => useScanSession(), { wrapper })
    expect(result.current.session).toBeNull()
  })

  it('starts a session', () => {
    const { result } = renderHook(() => useScanSession(), { wrapper })
    act(() => {
      result.current.dispatch({ type: 'START_SESSION', id: 'test-1' })
    })
    expect(result.current.session).not.toBeNull()
    expect(result.current.session!.id).toBe('test-1')
    expect(result.current.session!.photos).toEqual([])
  })

  it('adds photos to a session', () => {
    const { result } = renderHook(() => useScanSession(), { wrapper })
    act(() => {
      result.current.dispatch({ type: 'START_SESSION', id: 'test-2' })
    })
    const photo: CapturedPhoto = {
      index: 0,
      imageData: 'data:image/png;base64,abc',
      width: 640,
      height: 480,
      tags: [],
      capturedAt: Date.now(),
    }
    act(() => {
      result.current.dispatch({ type: 'ADD_PHOTO', photo })
    })
    expect(result.current.session!.photos).toHaveLength(1)
    expect(result.current.session!.photos[0].index).toBe(0)
  })

  it('tags and untags a photo', () => {
    const { result } = renderHook(() => useScanSession(), { wrapper })
    act(() => {
      result.current.dispatch({ type: 'START_SESSION', id: 'test-3' })
    })
    act(() => {
      result.current.dispatch({
        type: 'ADD_PHOTO',
        photo: {
          index: 0,
          imageData: 'img',
          width: 640,
          height: 480,
          tags: [],
          capturedAt: 1000,
        },
      })
    })

    act(() => {
      result.current.dispatch({
        type: 'TAG_PHOTO',
        photoIndex: 0,
        tag: 'doorway',
      })
    })
    expect(result.current.session!.photos[0].tags).toContain('doorway')

    // Tagging again with same tag should not duplicate
    act(() => {
      result.current.dispatch({
        type: 'TAG_PHOTO',
        photoIndex: 0,
        tag: 'doorway',
      })
    })
    expect(
      result.current.session!.photos[0].tags.filter((t) => t === 'doorway'),
    ).toHaveLength(1)

    act(() => {
      result.current.dispatch({
        type: 'UNTAG_PHOTO',
        photoIndex: 0,
        tag: 'doorway',
      })
    })
    expect(result.current.session!.photos[0].tags).not.toContain('doorway')
  })

  it('sets and clears scale reference', () => {
    const { result } = renderHook(() => useScanSession(), { wrapper })
    act(() => {
      result.current.dispatch({ type: 'START_SESSION', id: 'test-4' })
    })

    const ref: ScaleReference = {
      photoIndex: 0,
      startPoint: { x: 10, y: 20 },
      endPoint: { x: 110, y: 20 },
      length: 50,
      unit: 'cm',
    }
    act(() => {
      result.current.dispatch({ type: 'SET_SCALE_REFERENCE', scaleReference: ref })
    })
    expect(result.current.session!.scaleReference).toEqual(ref)

    act(() => {
      result.current.dispatch({ type: 'CLEAR_SCALE_REFERENCE' })
    })
    expect(result.current.session!.scaleReference).toBeUndefined()
  })

  it('ends a session', () => {
    const { result } = renderHook(() => useScanSession(), { wrapper })
    act(() => {
      result.current.dispatch({ type: 'START_SESSION', id: 'test-5' })
    })
    act(() => {
      result.current.dispatch({ type: 'END_SESSION' })
    })
    expect(result.current.session!.endedAt).toBeDefined()
  })

  it('resets to null', () => {
    const { result } = renderHook(() => useScanSession(), { wrapper })
    act(() => {
      result.current.dispatch({ type: 'START_SESSION', id: 'test-6' })
    })
    act(() => {
      result.current.dispatch({ type: 'RESET' })
    })
    expect(result.current.session).toBeNull()
  })

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useScanSession())
    }).toThrow('useScanSession must be used within a ScanSessionProvider')
  })
})
