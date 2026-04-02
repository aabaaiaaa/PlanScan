import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the start screen with title and new scan button', () => {
    render(<App />)
    expect(screen.getByText('3D Room Scanner')).toBeInTheDocument()
    expect(screen.getByTestId('new-scan-btn')).toBeInTheDocument()
    expect(screen.getByTestId('start-screen')).toBeInTheDocument()
  })

  it('navigates to capture phase when New Scan is clicked', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('new-scan-btn'))
    expect(screen.getByTestId('capture-phase')).toBeInTheDocument()
    expect(screen.getByTestId('phase-breadcrumbs')).toBeInTheDocument()
  })
})
