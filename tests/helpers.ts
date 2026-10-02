import { defaultState, ensureCourtNames, newPlayer, syncCourts } from '../src/domain/session'
import type { Format, SessionState } from '../src/domain/types'

// Builds a session with `count` arrived players named P1..Pn (ids p1..pn).
export function makeSession(count: number, courts = 1, format: Format = 'doubles'): SessionState {
  const state = defaultState()
  state.courts = courts
  state.format = format
  ensureCourtNames(state)
  syncCourts(state)
  for (let i = 1; i <= count; i++) {
    const p = newPlayer(`P${i}`)
    p.id = `p${i}`
    p.arrived = true
    p.arrivalOrder = i
    state.players.push(p)
  }
  return state
}

// Deterministic PRNG so shuffles are repeatable.
export function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

export function court(state: SessionState, n: number) {
  return state.currentCourts.find((c) => c.court === n)!
}

export function player(state: SessionState, id: string) {
  return state.players.find((p) => p.id === id)!
}

export function spread(state: SessionState): number {
  const counts = state.players.map((p) => p.matchCount)
  return Math.max(...counts) - Math.min(...counts)
}
