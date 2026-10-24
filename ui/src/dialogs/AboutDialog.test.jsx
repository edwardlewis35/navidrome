import * as React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { AboutDialog, LinkToVersion } from './AboutDialog'

const mocks = vi.hoisted(() => ({
  ping: vi.fn(),
  getOne: vi.fn(() => ({})),
  permissions: 'admin',
  locale: 'en',
}))
vi.mock('../subsonic', () => ({ default: { ping: mocks.ping } }))
vi.mock('../config', () => ({
  default: { version: '0.60.0 (123abcd)', devUIShowConfig: false },
}))
vi.mock('react-admin', async (original) => ({
  ...(await original()),
  useLocale: () => mocks.locale,
  useTranslate: () => (key) => key,
  usePermissions: () => ({ permissions: mocks.permissions }),
  useGetOne: (...args) => mocks.getOne(...args),
}))

describe('version links', () => {
  afterEach(cleanup)

  it.each(['dev', 'Cloud Music', '0.60.0', ''])(
    'renders a plain version without a commit: %s',
    (version) => {
      render(<LinkToVersion version={version} />)
      expect(screen.queryByRole('link')).toBeNull()
    },
  )

  it.each(['0.40.0 (300a0292)', '0.40.0-SNAPSHOT (300a0292)'])(
    'links the actual fork commit for %s',
    (version) => {
      render(<LinkToVersion version={version} />)
      expect(screen.getByRole('link')).toHaveAttribute(
        'href',
        'https://github.com/edwardlewis35/navidrome/commit/300a0292',
      )
      expect(screen.getByRole('link')).toHaveTextContent(version)
    },
  )
})

describe('about this service', () => {
  beforeEach(() => {
    mocks.permissions = 'admin'
    mocks.locale = 'en'
    mocks.getOne.mockClear()
    mocks.ping.mockReset().mockResolvedValue({
      json: {
        'subsonic-response': {
          status: 'ok',
          serverVersion: '0.60.0 (abcdef1)',
        },
      },
    })
  })

  it('shows live status and deployed version with relevant project links', async () => {
    render(<AboutDialog open onClose={() => {}} />)
    await screen.findByText('Connected')
    expect(
      screen.getByRole('link', { name: '0.60.0 (abcdef1)' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/edwardlewis35/navidrome/commit/abcdef1',
    )
    expect(
      screen.getByRole('link', { name: 'edwardlewis35/navidrome' }),
    ).toHaveAttribute('href', 'https://github.com/edwardlewis35/navidrome')
    expect(screen.getByText('Subsonic / OpenSubsonic')).toBeInTheDocument()
    expect(
      screen.queryByText(/ko-fi|deluan|reddit|lastInsightsCollection/i),
    ).toBeNull()
    expect(
      mocks.getOne.mock.calls.some(([resource]) => resource === 'insights'),
    ).toBe(false)
  })

  it('reports a failed connection without inventing a server version', async () => {
    mocks.ping.mockRejectedValue(new Error('offline'))
    render(<AboutDialog open onClose={() => {}} />)
    await screen.findByText('Connection unavailable')
    expect(screen.queryByRole('link', { name: '0.60.0 (abcdef1)' })).toBeNull()
  })

  it('refreshes status when reopened', async () => {
    const { rerender } = render(<AboutDialog open={false} onClose={() => {}} />)
    expect(mocks.ping).not.toHaveBeenCalled()
    rerender(<AboutDialog open onClose={() => {}} />)
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(1))
  })

  it('localizes service information and hides administrator tools from regular users', async () => {
    mocks.locale = 'zh-Hans'
    mocks.permissions = 'user'
    render(<AboutDialog open onClose={() => {}} />)
    await screen.findByText('已连接')
    expect(screen.getByText('Cloud Music 定制版')).toBeInTheDocument()
    expect(screen.queryByText('管理员工具')).toBeNull()
  })
})
