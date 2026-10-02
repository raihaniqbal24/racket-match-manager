import { describe, expect, it } from 'vitest'
import { completeCourt, confirmCourt, proposeMatchForCourt, setFixedPartner } from '../src/domain/scheduler'
import { balance, formatElapsed, leaderboard, overviewStats, playerStatus } from '../src/domain/stats'
import { newPlayer } from '../src/domain/session'
import { court, makeSession, player } from './helpers'

describe('overviewStats', () => {
  it('ignores players who never arrived when averaging', () => {
    const state = makeSession(4)
    state.players.push(newPlayer('Late'), newPlayer('Later'))
    proposeMatchForCourt(state, 1)
    confirmCourt(state, 1)
    expect(overviewStats(state)).toMatchObject({ arrived: 4, playing: 4, waiting: 0 })
    completeCourt(state, 1)
    expect(overviewStats(state).avgMatches).toBe(1)
    expect(balance(state).players).toHaveLength(4)
    expect(balance(state).label).toBe('Perfectly even')
  })

  it('still counts someone who played and went home', () => {
    const state = makeSession(4)
    proposeMatchForCourt(state, 1)
    confirmCourt(state, 1)
    completeCourt(state, 1)
    player(state, 'p1').arrived = false
    expect(balance(state).players).toHaveLength(4)
  })
})

describe('playerStatus', () => {
  it('covers each state', () => {
    const state = makeSession(7)
    setFixedPartner(state, 'p6', 'p7')
    player(state, 'p7').arrived = false
    player(state, 'p5').available = false
    expect(playerStatus(state, player(state, 'p7')).kind).toBe('away')
    expect(playerStatus(state, player(state, 'p6')).kind).toBe('partner')
    expect(playerStatus(state, player(state, 'p5')).kind).toBe('sitting')
    expect(playerStatus(state, player(state, 'p1')).kind).toBe('ready')
    proposeMatchForCourt(state, 1)
    expect(playerStatus(state, player(state, 'p1')).kind).toBe('pending')
    confirmCourt(state, 1)
    expect(playerStatus(state, player(state, 'p1')).kind).toBe('playing')
    player(state, 'p6').partnerId = null
    player(state, 'p6').waitStreak = 2
    expect(playerStatus(state, player(state, 'p6')).kind).toBe('warning')
    player(state, 'p6').waitStreak = 4
    expect(playerStatus(state, player(state, 'p6'))).toEqual({ kind: 'alert', label: 'Waiting 4' })
  })
})

describe('leaderboard', () => {
  it('counts wins and losses from scored matches only', () => {
    const state = makeSession(4)
    proposeMatchForCourt(state, 1)
    const [a1, a2, b1] = court(state, 1).players
    confirmCourt(state, 1)
    completeCourt(state, 1, { a: 6, b: 2 })
    proposeMatchForCourt(state, 1)
    confirmCourt(state, 1)
    completeCourt(state, 1) // skipped score

    const rows = leaderboard(state)
    expect(rows).toHaveLength(4)
    expect(rows.slice(0, 2).map((r) => r.id).sort()).toEqual([a1, a2].sort())
    expect(rows[0]).toMatchObject({ played: 1, won: 1, lost: 0, winRate: 1, diff: 4 })
    expect(rows.find((r) => r.id === b1)).toMatchObject({ played: 1, won: 0, lost: 1, diff: -4 })
  })

  it('treats equal scores as a draw', () => {
    const state = makeSession(2, 1, 'singles')
    proposeMatchForCourt(state, 1)
    confirmCourt(state, 1)
    completeCourt(state, 1, { a: 5, b: 5 })
    expect(leaderboard(state).every((r) => r.drawn === 1 && r.won === 0)).toBe(true)
  })
})

describe('formatElapsed', () => {
  it('formats minutes and hours', () => {
    const start = '2026-10-02T10:00:00.000Z'
    const t = new Date(start).getTime()
    expect(formatElapsed(start, t + 5_000)).toBe('0:05')
    expect(formatElapsed(start, t + 754_000)).toBe('12:34')
    expect(formatElapsed(start, t + 3_725_000)).toBe('1:02:05')
    expect(formatElapsed(null, t)).toBe('')
  })
})
