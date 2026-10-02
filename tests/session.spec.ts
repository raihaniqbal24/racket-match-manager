import { describe, expect, it } from 'vitest'
import {
  defaultState,
  ensureCourtNames,
  normalizeState,
  parseState,
  relabelDefaultCourtNames,
  syncCourts,
} from '../src/domain/session'

describe('normalizeState', () => {
  it('falls back to defaults for empty or corrupt input', () => {
    for (const raw of [null, undefined, 'nope', 42, []]) {
      const s = normalizeState(raw)
      expect(s.courts).toBe(2)
      expect(s.players).toEqual([])
      expect(s.currentCourts).toHaveLength(2)
    }
    expect(parseState('{not json').format).toBe('doubles')
    expect(parseState(null).sport).toBe('tennis')
  })

  it('repairs bad field values', () => {
    const s = normalizeState({
      courts: 99,
      format: 'triples',
      sport: 'curling',
      players: [{ id: 7, name: 'Ann' }, { name: 'no id' }, null],
      history: 'x',
      currentCourts: [{ court: 1, status: 'weird', players: [1, 2] }],
    })
    expect(s.courts).toBe(20)
    expect(s.format).toBe('doubles')
    expect(s.sport).toBe('tennis')
    expect(s.players).toHaveLength(1)
    expect(s.players[0]).toMatchObject({ id: '7', available: true, matchCount: 0, partnerId: null })
    expect(s.history).toEqual([])
    expect(s.currentCourts).toHaveLength(20)
    expect(s.currentCourts[0]).toMatchObject({ status: 'idle', players: ['1', '2'] })
    expect(s.courtNames).toHaveLength(20)
  })

  it('reads a Tennis Match Manager save, flattening nested history', () => {
    const record = { court: 1, roundNumber: 1, players: ['a', 'b', 'c', 'd'], completedAt: '2026-09-25T00:00:00Z' }
    const s = normalizeState({
      courts: 1,
      courtNames: ['Centre'],
      format: 'doubles',
      players: [
        { id: 'a', name: 'A', arrived: true, matchCount: 1, partnerId: 'b' },
        { id: 'b', name: 'B', arrived: true, matchCount: 1, partnerId: 'a' },
        { id: 'c', name: 'C', arrived: true, matchCount: 1, partnerId: 'zzz' },
        { id: 'd', name: 'D', arrived: true, matchCount: 1 },
      ],
      history: [{ matches: [record] }, { matches: [{ ...record, roundNumber: 2 }] }],
      currentCourts: [],
      nextRoundNumber: 3,
      lastSaved: '25/09/2026, 09:00:00',
    })
    expect(s.history).toHaveLength(2)
    expect(s.history[1]).toMatchObject({ roundNumber: 2, score: null })
    expect(s.courtNames).toEqual(['Centre'])
    expect(s.players[0]!.partnerId).toBe('b')
    // dangling partner link is dropped
    expect(s.players[2]!.partnerId).toBeNull()
    expect(s.nextRoundNumber).toBe(3)
  })

  it('round-trips its own output', () => {
    const s = normalizeState({ sport: 'badminton', courts: 3, players: [{ id: 'a', name: 'A' }] })
    expect(normalizeState(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })
})

describe('court names', () => {
  it('grows and shrinks with the court count', () => {
    const s = defaultState()
    s.courts = 4
    ensureCourtNames(s)
    expect(s.courtNames).toEqual(['Court 1', 'Court 2', 'Court 3', 'Court 4'])
    s.courts = 1
    ensureCourtNames(s)
    expect(s.courtNames).toEqual(['Court 1'])
  })

  it('relabels only default names when the venue word changes', () => {
    const s = defaultState()
    s.courtNames = ['Court 1', 'Centre']
    s.sport = 'table-tennis'
    relabelDefaultCourtNames(s)
    expect(s.courtNames).toEqual(['Table 1', 'Centre'])
  })

  it('syncCourts keeps matches already on a court', () => {
    const s = defaultState()
    s.currentCourts = [{ court: 2, status: 'playing', players: ['a', 'b', 'c', 'd'] }]
    s.courts = 3
    syncCourts(s)
    expect(s.currentCourts.map((c) => c.status)).toEqual(['idle', 'playing', 'idle'])
  })
})
