import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDemo } from '@/store/demoStore'
import { usePrefs } from '@/store/prefsStore'
import { RobotPanel } from './RobotPanel'

// The lazy 3D chunk cannot be fetched (offline, or a deploy replaced it mid-session).
vi.mock('@/robot/RobotStage', () => {
  throw new Error('Failed to fetch dynamically imported module: /assets/RobotStage-abc.js')
})
vi.mock('@/engine', () => ({
  engine: { submit: vi.fn(), interrupt: vi.fn(), cancelTimer: vi.fn(), returnHome: vi.fn() },
}))

beforeEach(() => {
  usePrefs.setState({ lang: 'vi' })
  useDemo.setState({ scene: { status: 'loading', progress: null }, card: null, bubble: null, timers: [] })
})

describe('RobotPanel', () => {
  it('ui-chunk-fail-stalls: a 3D chunk that fails to load ends in the 2D robot, scene status "error"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<RobotPanel />)
    // The 2D drawing of the robot (with what it is doing), not an endless "loading".
    expect(await screen.findByRole('img', { name: /Ronaldo đang: đứng chờ lệnh/ })).toBeInTheDocument()
    expect(screen.getAllByText(/hình vẽ/).length).toBeGreaterThan(0)
    expect(useDemo.getState().scene.status).toBe('error')
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })
})
