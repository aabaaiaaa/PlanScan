import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CorrectionPopup } from './CorrectionPopup'
import type { CorrectionAction, CorrectionTarget } from './CorrectionPopup'
import type { Wall } from '../types'
import type { Point3D } from '../types'

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makePoint(x: number, y: number, z: number): Point3D {
  return { x, y, z }
}

function makeWall(): Wall {
  return {
    id: 'w1',
    corners: [
      makePoint(0, 0, 0),
      makePoint(4, 0, 0),
      makePoint(4, 2.5, 0),
      makePoint(0, 2.5, 0),
    ],
    plane: { normal: makePoint(0, 0, 1), distance: 0 },
    measurements: { length: 4 },
  }
}

function makeWallTarget(): CorrectionTarget {
  return {
    type: 'wall',
    roomId: 'room-0',
    wall: makeWall(),
    clickPosition: makePoint(2, 0, 0),
  }
}

function makeDoorTarget(): CorrectionTarget {
  return {
    type: 'door',
    roomId: 'room-0',
    doorId: 'door-0',
  }
}

function makeWindowTarget(): CorrectionTarget {
  return {
    type: 'window',
    roomId: 'room-0',
    windowId: 'window-0',
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CorrectionPopup', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the popup container', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    render(
      <CorrectionPopup x={100} y={100} target={makeWallTarget()} onAction={onAction} onClose={onClose} />,
    )
    expect(screen.getByTestId('correction-popup')).toBeInTheDocument()
  })

  // --- Wall target ---

  it('shows "Add Door" and "Add Window" buttons for a wall target', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    render(
      <CorrectionPopup x={0} y={0} target={makeWallTarget()} onAction={onAction} onClose={onClose} />,
    )
    expect(screen.getByTestId('add-door-btn')).toBeInTheDocument()
    expect(screen.getByTestId('add-window-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('remove-door-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('remove-window-btn')).not.toBeInTheDocument()
  })

  it('fires addDoor action and closes when "Add Door" is clicked', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    const target = makeWallTarget()
    render(
      <CorrectionPopup x={0} y={0} target={target} onAction={onAction} onClose={onClose} />,
    )

    fireEvent.click(screen.getByTestId('add-door-btn'))

    expect(onAction).toHaveBeenCalledTimes(1)
    const action = onAction.mock.calls[0][0] as CorrectionAction
    expect(action.type).toBe('addDoor')
    if (action.type === 'addDoor') {
      expect(action.roomId).toBe('room-0')
      expect(action.wall.id).toBe('w1')
      expect(action.clickPosition).toEqual(makePoint(2, 0, 0))
    }
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('fires addWindow action and closes when "Add Window" is clicked', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    const target = makeWallTarget()
    render(
      <CorrectionPopup x={0} y={0} target={target} onAction={onAction} onClose={onClose} />,
    )

    fireEvent.click(screen.getByTestId('add-window-btn'))

    expect(onAction).toHaveBeenCalledTimes(1)
    const action = onAction.mock.calls[0][0] as CorrectionAction
    expect(action.type).toBe('addWindow')
    if (action.type === 'addWindow') {
      expect(action.roomId).toBe('room-0')
      expect(action.wall.id).toBe('w1')
    }
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // --- Door target ---

  it('shows "Remove Door" button for a door target', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    render(
      <CorrectionPopup x={0} y={0} target={makeDoorTarget()} onAction={onAction} onClose={onClose} />,
    )
    expect(screen.getByTestId('remove-door-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('add-door-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-window-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('remove-window-btn')).not.toBeInTheDocument()
  })

  it('fires removeDoor action and closes when "Remove Door" is clicked', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    render(
      <CorrectionPopup x={0} y={0} target={makeDoorTarget()} onAction={onAction} onClose={onClose} />,
    )

    fireEvent.click(screen.getByTestId('remove-door-btn'))

    expect(onAction).toHaveBeenCalledTimes(1)
    const action = onAction.mock.calls[0][0] as CorrectionAction
    expect(action.type).toBe('removeDoor')
    if (action.type === 'removeDoor') {
      expect(action.roomId).toBe('room-0')
      expect(action.doorId).toBe('door-0')
    }
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // --- Window target ---

  it('shows "Remove Window" button for a window target', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    render(
      <CorrectionPopup x={0} y={0} target={makeWindowTarget()} onAction={onAction} onClose={onClose} />,
    )
    expect(screen.getByTestId('remove-window-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('add-door-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-window-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('remove-door-btn')).not.toBeInTheDocument()
  })

  it('fires removeWindow action and closes when "Remove Window" is clicked', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    render(
      <CorrectionPopup x={0} y={0} target={makeWindowTarget()} onAction={onAction} onClose={onClose} />,
    )

    fireEvent.click(screen.getByTestId('remove-window-btn'))

    expect(onAction).toHaveBeenCalledTimes(1)
    const action = onAction.mock.calls[0][0] as CorrectionAction
    expect(action.type).toBe('removeWindow')
    if (action.type === 'removeWindow') {
      expect(action.roomId).toBe('room-0')
      expect(action.windowId).toBe('window-0')
    }
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // --- Cancel ---

  it('always shows a Cancel button', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    render(
      <CorrectionPopup x={0} y={0} target={makeWallTarget()} onAction={onAction} onClose={onClose} />,
    )
    expect(screen.getByTestId('correction-cancel-btn')).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked without firing an action', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    render(
      <CorrectionPopup x={0} y={0} target={makeWallTarget()} onAction={onAction} onClose={onClose} />,
    )

    fireEvent.click(screen.getByTestId('correction-cancel-btn'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onAction).not.toHaveBeenCalled()
  })

  // --- Room target ---

  it('shows "Split Room" and "Merge with Adjacent" buttons for a room target', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    const target: CorrectionTarget = {
      type: 'room',
      roomId: 'room-0',
      roomName: 'Lounge',
    }
    render(
      <CorrectionPopup x={0} y={0} target={target} onAction={onAction} onClose={onClose} />,
    )
    expect(screen.getByTestId('split-room-btn')).toBeInTheDocument()
    expect(screen.getByTestId('merge-room-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('add-door-btn')).not.toBeInTheDocument()
  })

  it('calls onStartSplit and closes when "Split Room" is clicked', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    const onStartSplit = vi.fn()
    const target: CorrectionTarget = {
      type: 'room',
      roomId: 'room-0',
      roomName: 'Lounge',
    }
    render(
      <CorrectionPopup
        x={0}
        y={0}
        target={target}
        onAction={onAction}
        onStartSplit={onStartSplit}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByTestId('split-room-btn'))

    expect(onStartSplit).toHaveBeenCalledWith('room-0')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('calls onStartMerge and closes when "Merge with Adjacent" is clicked', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    const onStartMerge = vi.fn()
    const target: CorrectionTarget = {
      type: 'room',
      roomId: 'room-0',
      roomName: 'Lounge',
    }
    render(
      <CorrectionPopup
        x={0}
        y={0}
        target={target}
        onAction={onAction}
        onStartMerge={onStartMerge}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByTestId('merge-room-btn'))

    expect(onStartMerge).toHaveBeenCalledWith('room-0')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onAction).not.toHaveBeenCalled()
  })

  // --- Positioning ---

  it('positions the popup at the given x, y coordinates', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    render(
      <CorrectionPopup x={150} y={200} target={makeWallTarget()} onAction={onAction} onClose={onClose} />,
    )
    const popup = screen.getByTestId('correction-popup')
    expect(popup.style.left).toBe('150px')
    expect(popup.style.top).toBe('200px')
  })

  // --- Event propagation ---

  it('stops click event propagation on the popup container', () => {
    const onAction = vi.fn()
    const onClose = vi.fn()
    const outerClickHandler = vi.fn()

    render(
      <div onClick={outerClickHandler}>
        <CorrectionPopup x={0} y={0} target={makeWallTarget()} onAction={onAction} onClose={onClose} />
      </div>,
    )

    fireEvent.click(screen.getByTestId('correction-popup'))
    expect(outerClickHandler).not.toHaveBeenCalled()
  })
})
