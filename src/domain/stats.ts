import type { MatchRecord, Player, SessionState } from './types'

export const WAIT_WARNING = 2
export const WAIT_ALERT = 4

export type StatusKind = 'away' | 'playing' | 'pending' | 'sitting' | 'partner' | 'alert' | 'warning' | 'ready'

export interface PlayerStatus {
  kind: StatusKind
  label: string
}

export function playerStatus(state: SessionState, p: Player): PlayerStatus {
  if (!p.arrived) return { kind: 'away', label: 'Away' }
  if (p.currentlyPlaying) return { kind: 'playing', label: 'Playing' }
  if (p.reserved) return { kind: 'pending', label: 'Up next' }
  if (p.available === false) return { kind: 'sitting', label: 'Sitting out' }
  if (state.format === 'doubles' && p.partnerId) {
    const partner = state.players.find((x) => x.id === p.partnerId)
    if (!partner || !partner.arrived || partner.available === false)
      return { kind: 'partner', label: 'Waiting for partner' }
  }
  if ((p.waitStreak || 0) >= WAIT_ALERT)
    return { kind: 'alert', label: `Waiting ${p.waitStreak}` }
  if ((p.waitStreak || 0) >= WAIT_WARNING)
    return { kind: 'warning', label: `Waiting ${p.waitStreak}` }
  return { kind: 'ready', label: 'Ready' }
}

export function hasPlayed(state: SessionState, playerId: string): boolean {
  return state.history.some((m) => m.players.includes(playerId))
}

// Everyone who has taken part in the session: here now, or played earlier and
// since gone home. Players listed but never arrived are left out so they do
// not drag the averages down.
function participants(state: SessionState): Player[] {
  return state.players.filter((p) => p.arrived || p.matchCount > 0 || p.currentlyPlaying)
}

export interface OverviewStats {
  arrived: number
  playing: number
  waiting: number
  avgMatches: number
  matchesPlayed: number
}

export function overviewStats(state: SessionState): OverviewStats {
  const arrived = state.players.filter((p) => p.arrived).length
  const playing = state.players.filter((p) => p.currentlyPlaying).length
  const active = participants(state)
  return {
    arrived,
    playing,
    waiting: Math.max(0, arrived - playing),
    avgMatches: active.length
      ? active.reduce((s, p) => s + p.matchCount, 0) / active.length
      : 0,
    matchesPlayed: state.history.length,
  }
}

export interface Balance {
  players: Player[]
  spread: number
  max: number
  label: string
}

export function balance(state: SessionState): Balance {
  const players = [...participants(state)].sort(
    (a, b) =>
      a.matchCount - b.matchCount ||
      b.waitStreak - a.waitStreak ||
      a.name.localeCompare(b.name),
  )
  if (!players.length) return { players, spread: 0, max: 0, label: 'No players yet' }
  const counts = players.map((p) => p.matchCount)
  const max = Math.max(...counts)
  const spread = max - Math.min(...counts)
  return {
    players,
    spread,
    max,
    label:
      spread === 0
        ? 'Perfectly even'
        : spread === 1
          ? 'Within 1 match'
          : `${spread} match spread`,
  }
}

/** The two sides of a match as player-id arrays. */
export function sides(players: string[]): [string[], string[]] {
  const half = players.length / 2
  return [players.slice(0, half), players.slice(half)]
}

/** 'a' or 'b' for the winning side, null for unscored or drawn matches. */
export function winner(m: MatchRecord): 'a' | 'b' | null {
  if (!m.score || m.score.a === m.score.b) return null
  return m.score.a > m.score.b ? 'a' : 'b'
}

export interface LeaderboardRow {
  id: string
  name: string
  played: number
  won: number
  lost: number
  drawn: number
  winRate: number
  /** Points/games scored minus conceded. */
  diff: number
}

// Built from scored matches only; skipped scores do not count as played here.
export function leaderboard(state: SessionState): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>()
  const row = (id: string) => {
    let r = rows.get(id)
    if (!r) {
      const name = state.players.find((p) => p.id === id)?.name || 'Unknown'
      r = { id, name, played: 0, won: 0, lost: 0, drawn: 0, winRate: 0, diff: 0 }
      rows.set(id, r)
    }
    return r
  }
  for (const m of state.history) {
    if (!m.score) continue
    const [a, b] = sides(m.players)
    const w = winner(m)
    a.forEach((id) => {
      const r = row(id)
      r.played++
      r.diff += m.score!.a - m.score!.b
      if (w === 'a') r.won++
      else if (w === 'b') r.lost++
      else r.drawn++
    })
    b.forEach((id) => {
      const r = row(id)
      r.played++
      r.diff += m.score!.b - m.score!.a
      if (w === 'b') r.won++
      else if (w === 'a') r.lost++
      else r.drawn++
    })
  }
  return [...rows.values()]
    .map((r) => ({ ...r, winRate: r.played ? r.won / r.played : 0 }))
    .sort(
      (x, y) =>
        y.won - x.won ||
        y.winRate - x.winRate ||
        y.diff - x.diff ||
        x.name.localeCompare(y.name),
    )
}

export function formatElapsed(fromIso: string | null | undefined, now: number): string {
  if (!fromIso) return ''
  const total = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000))
  const h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}
