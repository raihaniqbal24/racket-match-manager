import { describe, expect, it } from 'vitest'
import {
  cancelPendingCourt,
  completeAllPlaying,
  completeCourt,
  confirmCourt,
  cycleDoublesArrangement,
  getSwapCandidates,
  hasSwappableArrangement,
  partitionKey,
  proposeMatchForCourt,
  replacePairOnCourt,
  rerollCourt,
  setFixedPartner,
  shuffle,
  swapPlayerInCourt,
} from '../src/domain/scheduler'
import type { SessionState } from '../src/domain/types'
import { court, makeSession, player, seeded, spread } from './helpers'

// Fills every court, starts them, then completes them all.
function playRound(state: SessionState): number {
  let started = 0
  for (let n = 1; n <= state.courts; n++)
    if (proposeMatchForCourt(state, n) && confirmCourt(state, n)) started++
  completeAllPlaying(state)
  return started
}

function sameTeam(players: string[], a: string, b: string): boolean {
  const ia = players.indexOf(a),
    ib = players.indexOf(b)
  return Math.floor(ia / 2) === Math.floor(ib / 2)
}

describe('balancing', () => {
  it.each([
    { players: 9, courts: 2, format: 'doubles' as const },
    { players: 5, courts: 1, format: 'doubles' as const },
    { players: 13, courts: 3, format: 'doubles' as const },
    { players: 5, courts: 2, format: 'singles' as const },
  ])('keeps spread within 1 after every round: $players players, $courts courts, $format', (cfg) => {
    const state = makeSession(cfg.players, cfg.courts, cfg.format)
    for (let round = 0; round < 30; round++) {
      expect(playRound(state)).toBe(cfg.courts)
      expect(spread(state)).toBeLessThanOrEqual(1)
    }
    expect(state.history).toHaveLength(30 * cfg.courts)
  })

  it('does not put a player on two courts at once', () => {
    const state = makeSession(8, 2)
    proposeMatchForCourt(state, 1)
    proposeMatchForCourt(state, 2)
    const all = [...court(state, 1).players, ...court(state, 2).players]
    expect(new Set(all).size).toBe(8)
  })

  it('returns false when there are too few players', () => {
    const state = makeSession(3)
    expect(proposeMatchForCourt(state, 1)).toBe(false)
    expect(court(state, 1).status).toBe('idle')
  })

  it('skips players who are away or sitting out', () => {
    const state = makeSession(6)
    player(state, 'p1').arrived = false
    player(state, 'p2').available = false
    proposeMatchForCourt(state, 1)
    expect(court(state, 1).players.sort()).toEqual(['p3', 'p4', 'p5', 'p6'])
  })

  it('avoids repeating teammates when it can', () => {
    const state = makeSession(4)
    const seen = new Set<string>()
    for (let i = 0; i < 3; i++) {
      proposeMatchForCourt(state, 1)
      seen.add(partitionKey(court(state, 1).players))
      confirmCourt(state, 1)
      completeCourt(state, 1)
    }
    expect(seen.size).toBe(3)
  })
})

describe('two-stage flow', () => {
  it('commits nothing until a pending match is confirmed', () => {
    const state = makeSession(6)
    proposeMatchForCourt(state, 1)
    expect(court(state, 1).status).toBe('pending')
    expect(state.players.filter((p) => p.reserved)).toHaveLength(4)
    expect(state.players.every((p) => p.matchCount === 0 && p.matchCountPending === 0)).toBe(true)
    expect(state.players.every((p) => p.waitStreak === 0)).toBe(true)
    expect(state.nextRoundNumber).toBe(1)

    cancelPendingCourt(state, 1)
    expect(court(state, 1).status).toBe('idle')
    expect(state.players.some((p) => p.reserved)).toBe(false)
  })

  it('confirm starts the match and bumps the bench wait streak', () => {
    const state = makeSession(6)
    proposeMatchForCourt(state, 1)
    const on = court(state, 1).players
    confirmCourt(state, 1)
    expect(court(state, 1).status).toBe('playing')
    expect(court(state, 1).roundNumber).toBe(1)
    for (const p of state.players) {
      expect(p.currentlyPlaying).toBe(on.includes(p.id))
      expect(p.waitStreak).toBe(on.includes(p.id) ? 0 : 1)
    }
  })

  it('complete records history, the score, and match counts', () => {
    const state = makeSession(4)
    proposeMatchForCourt(state, 1)
    confirmCourt(state, 1)
    expect(completeCourt(state, 1, { a: 6, b: 3 })).toBe(true)
    expect(state.history).toHaveLength(1)
    expect(state.history[0]!.score).toEqual({ a: 6, b: 3 })
    expect(state.players.every((p) => p.matchCount === 1 && !p.currentlyPlaying)).toBe(true)
    expect(court(state, 1).status).toBe('idle')
    expect(completeCourt(state, 1)).toBe(false)
  })
})

describe('fixed partners', () => {
  it('always seats a selected pair on the same team', () => {
    const state = makeSession(8, 2)
    setFixedPartner(state, 'p1', 'p2')
    let together = 0
    for (let round = 0; round < 20; round++) {
      for (let n = 1; n <= 2; n++) {
        proposeMatchForCourt(state, n)
        const ids = court(state, n).players
        if (ids.includes('p1') && ids.includes('p2')) {
          expect(sameTeam(ids, 'p1', 'p2')).toBe(true)
          together++
        }
        confirmCourt(state, n)
      }
      completeAllPlaying(state)
    }
    // 8 players on 2 courts: everyone plays every round, so never split.
    expect(together).toBe(20)
  })

  it('benches both when one partner is away', () => {
    const state = makeSession(6)
    setFixedPartner(state, 'p1', 'p2')
    player(state, 'p2').arrived = false
    proposeMatchForCourt(state, 1)
    expect(court(state, 1).players.sort()).toEqual(['p3', 'p4', 'p5', 'p6'])
  })

  // One spare is the hard case: the pair can never rest together, so they are
  // split now and then. Inherited behaviour: the pair still drifts a few
  // matches ahead over a long session (about 4 after 40 rounds).
  it('splits a pair occasionally when only one player can sit out', () => {
    const state = makeSession(5)
    setFixedPartner(state, 'p1', 'p2')
    let intact = 0
    for (let round = 0; round < 40; round++) {
      proposeMatchForCourt(state, 1)
      const ids = court(state, 1).players
      if (ids.includes('p1') && ids.includes('p2')) intact++
      confirmCourt(state, 1)
      completeCourt(state, 1)
      expect(spread(state)).toBeLessThanOrEqual(5)
    }
    expect(intact).toBeGreaterThanOrEqual(24)
    expect(intact).toBeLessThan(40)
  })

  it('refuses to link players who are in a match', () => {
    const state = makeSession(4)
    proposeMatchForCourt(state, 1)
    expect(setFixedPartner(state, 'p1', 'p2')).toBe(false)
  })

  it('re-linking releases the previous partner', () => {
    const state = makeSession(4)
    setFixedPartner(state, 'p1', 'p2')
    setFixedPartner(state, 'p1', 'p3')
    expect(player(state, 'p2').partnerId).toBeNull()
    expect(player(state, 'p1').partnerId).toBe('p3')
    expect(player(state, 'p3').partnerId).toBe('p1')
  })
})

describe('re-roll', () => {
  it('never returns the rejected line-up', () => {
    const state = makeSession(7)
    const random = seeded(42)
    proposeMatchForCourt(state, 1)
    for (let i = 0; i < 50; i++) {
      const before = [...court(state, 1).players].sort().join()
      expect(rerollCourt(state, 1, random)).toBe(true)
      expect([...court(state, 1).players].sort().join()).not.toBe(before)
      expect(state.players.filter((p) => p.reserved)).toHaveLength(4)
    }
  })

  it('fails and keeps the line-up when nobody else is available', () => {
    const state = makeSession(4)
    proposeMatchForCourt(state, 1)
    const before = [...court(state, 1).players]
    expect(rerollCourt(state, 1)).toBe(false)
    expect(court(state, 1).players).toEqual(before)
    expect(court(state, 1).status).toBe('pending')
    expect(state.players.every((p) => p.reserved)).toBe(true)
  })

  it('moves a fixed pair as a unit', () => {
    const state = makeSession(7)
    setFixedPartner(state, 'p1', 'p2')
    const random = seeded(7)
    proposeMatchForCourt(state, 1)
    for (let i = 0; i < 40; i++) {
      rerollCourt(state, 1, random)
      const ids = court(state, 1).players
      expect(ids.includes('p1')).toBe(ids.includes('p2'))
      if (ids.includes('p1')) expect(sameTeam(ids, 'p1', 'p2')).toBe(true)
    }
  })
})

describe('manual swaps', () => {
  it('swaps in a bench player and moves the reservation', () => {
    const state = makeSession(6)
    proposeMatchForCourt(state, 1)
    const out = court(state, 1).players[0]!
    const bench = getSwapCandidates(state)
    expect(bench).toHaveLength(2)
    expect(swapPlayerInCourt(state, 1, 0, bench[0]!.id)).toBe(true)
    expect(court(state, 1).players[0]).toBe(bench[0]!.id)
    expect(player(state, out).reserved).toBe(false)
    expect(player(state, bench[0]!.id).reserved).toBe(true)
  })

  it('rejects players who are on court, away, sitting out, or already playing', () => {
    const state = makeSession(12, 2)
    proposeMatchForCourt(state, 1)
    confirmCourt(state, 1)
    proposeMatchForCourt(state, 2)
    const playing = court(state, 1).players[0]!
    const onCourt = court(state, 2).players[1]!
    const bench = getSwapCandidates(state)
    player(state, bench[0]!.id).arrived = false
    player(state, bench[1]!.id).available = false

    expect(swapPlayerInCourt(state, 2, 0, playing)).toBe(false)
    expect(swapPlayerInCourt(state, 2, 0, onCourt)).toBe(false)
    expect(swapPlayerInCourt(state, 2, 0, bench[0]!.id)).toBe(false)
    expect(swapPlayerInCourt(state, 2, 0, bench[1]!.id)).toBe(false)
    expect(swapPlayerInCourt(state, 2, 9, bench[2]!.id)).toBe(false)
    expect(swapPlayerInCourt(state, 2, 0, bench[2]!.id)).toBe(true)
  })

  it('offers only solo players and will not swap half of a pair', () => {
    const state = makeSession(8)
    setFixedPartner(state, 'p7', 'p8')
    // Make the pair less attractive so the four on court are solos.
    player(state, 'p7').matchCount = 3
    player(state, 'p8').matchCount = 3
    proposeMatchForCourt(state, 1)
    const ids = getSwapCandidates(state).map((p) => p.id)
    expect(ids).not.toContain('p7')
    expect(ids).not.toContain('p8')
    expect(swapPlayerInCourt(state, 1, 0, 'p7')).toBe(false)
  })

  it('replaces a fixed pair with two bench players', () => {
    const state = makeSession(7)
    setFixedPartner(state, 'p1', 'p2')
    proposeMatchForCourt(state, 1)
    const ids = court(state, 1).players
    expect(ids).toContain('p1')
    expect(swapPlayerInCourt(state, 1, ids.indexOf('p1'), getSwapCandidates(state)[0]!.id)).toBe(false)
    expect(replacePairOnCourt(state, 1, ids.indexOf('p1'), seeded(1))).toBe(true)
    expect(court(state, 1).players).not.toContain('p1')
    expect(court(state, 1).players).not.toContain('p2')
    expect(player(state, 'p1').reserved).toBe(false)
    expect(state.players.filter((p) => p.reserved)).toHaveLength(4)
  })
})

describe('swap pairing', () => {
  it('cycles through all three splits', () => {
    const state = makeSession(4)
    proposeMatchForCourt(state, 1)
    expect(hasSwappableArrangement(state, court(state, 1))).toBe(true)
    const seen = new Set([partitionKey(court(state, 1).players)])
    for (let i = 0; i < 2; i++) {
      expect(cycleDoublesArrangement(state, 1)).toBe(true)
      seen.add(partitionKey(court(state, 1).players))
    }
    expect(seen.size).toBe(3)
    cycleDoublesArrangement(state, 1)
    expect(seen.has(partitionKey(court(state, 1).players))).toBe(true)
  })

  it('has nothing to cycle when a fixed pair is on court', () => {
    const state = makeSession(4)
    setFixedPartner(state, 'p1', 'p2')
    proposeMatchForCourt(state, 1)
    expect(hasSwappableArrangement(state, court(state, 1))).toBe(false)
    expect(cycleDoublesArrangement(state, 1)).toBe(false)
  })

  it('does nothing in singles', () => {
    const state = makeSession(2, 1, 'singles')
    proposeMatchForCourt(state, 1)
    expect(cycleDoublesArrangement(state, 1)).toBe(false)
  })
})

describe('shuffle', () => {
  it('keeps every element and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const out = shuffle(input, seeded(3))
    expect(input).toEqual([1, 2, 3, 4, 5, 6])
    expect([...out].sort()).toEqual(input)
  })
})
