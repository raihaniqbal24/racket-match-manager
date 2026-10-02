import { DEFAULT_SPORT, SPORTS, getSport, isSportId } from './sports'
import type { Court, MatchRecord, Player, Score, SessionState } from './types'

export const STORAGE_KEY = 'racket-match-manager'
export const STATE_VERSION = 1
export const MAX_COURTS = 20

export function makeId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function defaultState(): SessionState {
  return {
    version: STATE_VERSION,
    sport: DEFAULT_SPORT,
    courts: 2,
    courtNames: ['Court 1', 'Court 2'],
    format: 'doubles',
    players: [],
    history: [],
    currentCourts: [],
    nextRoundNumber: 1,
    lastSaved: null,
  }
}

export function newPlayer(name: string): Player {
  return {
    id: makeId(),
    name,
    arrived: false,
    available: true,
    matchCount: 0,
    matchCountPending: 0,
    waitStreak: 0,
    currentlyPlaying: false,
    reserved: false,
    partnerId: null,
  }
}

function defaultCourtName(state: SessionState, n: number): string {
  return `${getSport(state.sport).venue} ${n}`
}

export function ensureCourtNames(state: SessionState): void {
  while (state.courtNames.length < state.courts)
    state.courtNames.push(defaultCourtName(state, state.courtNames.length + 1))
  if (state.courtNames.length > state.courts)
    state.courtNames = state.courtNames.slice(0, state.courts)
}

// Re-labels courts that still carry a default name ("Court 2" -> "Table 2")
// after the sport changes; custom names are left alone.
export function relabelDefaultCourtNames(state: SessionState): void {
  const venues = [...new Set(SPORTS.map((s) => s.venue))]
  state.courtNames = state.courtNames.map((name, i) =>
    venues.some((v) => name === `${v} ${i + 1}`)
      ? defaultCourtName(state, i + 1)
      : name,
  )
}

export function getCourtName(state: SessionState, n: number): string {
  return state.courtNames[n - 1] || defaultCourtName(state, n)
}

// Keeps exactly one entry per court, preserving any match already on it.
export function syncCourts(state: SessionState): void {
  state.currentCourts = Array.from(
    { length: state.courts },
    (_, i): Court =>
      state.currentCourts.find((c) => c.court === i + 1) || {
        court: i + 1,
        status: 'idle',
        players: [],
        matchId: null,
        startedAt: null,
        roundNumber: null,
      },
  )
}

// Drops partner links that point at a deleted player or are one-sided.
// Without this a corrupt or half-written link leaves a player permanently
// unschedulable, because buildUnits skips anyone whose partner is missing.
export function normalizePartners(state: SessionState): void {
  state.players.forEach((p) => {
    if (!p.partnerId) return
    const other = state.players.find((x) => x.id === p.partnerId)
    if (!other || other.partnerId !== p.id) p.partnerId = null
  })
}

export function getPlayerName(state: SessionState, id: string): string {
  return state.players.find((p) => p.id === id)?.name || 'Unknown'
}

function isRecord(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function normalizeScore(raw: unknown): Score | null {
  if (!isRecord(raw)) return null
  const a = Number(raw.a),
    b = Number(raw.b)
  return Number.isFinite(a) && Number.isFinite(b) ? { a, b } : null
}

function normalizeHistory(raw: unknown): MatchRecord[] {
  if (!Array.isArray(raw)) return []
  // Tennis Match Manager stored rounds as { matches: [record] }; flatten those.
  const flat = raw.flatMap((entry) =>
    isRecord(entry) && Array.isArray(entry.matches) ? entry.matches : [entry],
  )
  return flat
    .filter((m) => isRecord(m) && Array.isArray(m.players))
    .map((m) => ({
      court: Number(m.court) || 1,
      courtName: String(m.courtName ?? ''),
      roundNumber: Number(m.roundNumber) || 0,
      players: m.players.map(String),
      startedAt: m.startedAt ?? null,
      completedAt: m.completedAt ?? new Date().toISOString(),
      score: normalizeScore(m.score),
    }))
}

function normalizePlayers(raw: unknown): Player[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p) => isRecord(p) && p.id != null)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name ?? 'Unknown'),
      arrived: !!p.arrived,
      available: p.available !== false,
      matchCount: Number(p.matchCount) || 0,
      matchCountPending: Number(p.matchCountPending) || 0,
      waitStreak: Number(p.waitStreak) || 0,
      currentlyPlaying: !!p.currentlyPlaying,
      reserved: !!p.reserved,
      partnerId: p.partnerId ? String(p.partnerId) : null,
      ...(p.arrivalOrder ? { arrivalOrder: Number(p.arrivalOrder) } : {}),
      ...(p.arrivalTime ? { arrivalTime: Number(p.arrivalTime) } : {}),
    }))
}

function normalizeCourts(raw: unknown): Court[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c) => isRecord(c) && Number(c.court) >= 1)
    .map((c) => ({
      court: Number(c.court),
      status: c.status === 'playing' || c.status === 'pending' ? c.status : 'idle',
      players: Array.isArray(c.players) ? c.players.map(String) : [],
      matchId: c.matchId ?? null,
      startedAt: c.startedAt ?? null,
      roundNumber: c.roundNumber ?? null,
    }))
}

// Tolerant loader used for both localStorage and imported files: anything
// missing or malformed falls back to defaults rather than throwing.
export function normalizeState(raw: unknown): SessionState {
  const base = defaultState()
  if (!isRecord(raw)) {
    syncCourts(base)
    return base
  }
  const state: SessionState = {
    version: STATE_VERSION,
    sport: isSportId(raw.sport) ? raw.sport : base.sport,
    courts: Math.max(1, Math.min(MAX_COURTS, Math.floor(Number(raw.courts)) || base.courts)),
    courtNames: Array.isArray(raw.courtNames)
      ? raw.courtNames.map(String)
      : [],
    format: raw.format === 'singles' ? 'singles' : 'doubles',
    players: normalizePlayers(raw.players),
    history: normalizeHistory(raw.history),
    currentCourts: normalizeCourts(raw.currentCourts),
    nextRoundNumber: Math.max(1, Number(raw.nextRoundNumber) || 1),
    lastSaved: typeof raw.lastSaved === 'string' ? raw.lastSaved : null,
  }
  ensureCourtNames(state)
  syncCourts(state)
  normalizePartners(state)
  return state
}

export function parseState(json: string | null): SessionState {
  if (!json) return normalizeState(null)
  try {
    return normalizeState(JSON.parse(json))
  } catch {
    return normalizeState(null)
  }
}
