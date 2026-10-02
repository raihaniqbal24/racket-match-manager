import { getCourtName, makeId } from './session'
import type {
  Court,
  Player,
  ProposedMatch,
  RelationshipMaps,
  Score,
  SessionState,
} from './types'

export { normalizePartners } from './session'

interface Unit {
  ids: string[]
  size: number
  matchCount: number
  waitStreak: number
  arrivalOrder: number
}

export function playersPerMatch(state: SessionState): number {
  return state.format === 'singles' ? 2 : 4
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

function pairCount(map: Map<string, number>, a: string, b: string): number {
  return map.get(pairKey(a, b)) || 0
}

function addPair(map: Map<string, number>, a: string, b: string): void {
  if (a && b && a !== b)
    map.set(pairKey(a, b), (map.get(pairKey(a, b)) || 0) + 1)
}

function findPlayer(state: SessionState, id: string | null | undefined) {
  return state.players.find((x) => x.id === id)
}

function findCourt(state: SessionState, courtNumber: number) {
  return state.currentCourts.find((c) => c.court === courtNumber)
}

export function getPartnerId(state: SessionState, id: string): string | null {
  return findPlayer(state, id)?.partnerId || null
}

// True when the player's fixed partner is among the given ids.
function partnerIn(state: SessionState, id: string, ids: string[]): boolean {
  const partnerId = getPartnerId(state, id)
  return !!partnerId && ids.includes(partnerId)
}

export function arePartners(state: SessionState, idA: string, idB: string): boolean {
  if (!idA || !idB) return false
  return getPartnerId(state, idA) === idB && getPartnerId(state, idB) === idA
}

export function setFixedPartner(state: SessionState, idA: string, idB: string): boolean {
  const a = findPlayer(state, idA)
  const b = findPlayer(state, idB)
  if (!a || !b || a.id === b.id) return false
  if (a.reserved || a.currentlyPlaying || b.reserved || b.currentlyPlaying)
    return false
  clearFixedPartner(state, a.id)
  clearFixedPartner(state, b.id)
  a.partnerId = b.id
  b.partnerId = a.id
  return true
}

export function clearFixedPartner(state: SessionState, id: string): boolean {
  const p = findPlayer(state, id)
  if (!p || !p.partnerId) return false
  const other = findPlayer(state, p.partnerId)
  if (other) other.partnerId = null
  p.partnerId = null
  return true
}

// A fixed pair plays together every round, so the usual repeat-teammate
// penalty would make every line-up containing them progressively more
// expensive. Fixed pairs are exempt from it.
function teammatePenalty(
  state: SessionState,
  maps: RelationshipMaps,
  a: string,
  b: string,
): number {
  return arePartners(state, a, b) ? 0 : pairCount(maps.teammate, a, b) * 30000
}

function opponentPairs([a, b, c, d]: string[]): [string, string][] {
  return [
    [a!, c!],
    [a!, d!],
    [b!, c!],
    [b!, d!],
  ]
}

export function relationshipMaps(state: SessionState): RelationshipMaps {
  const teammate = new Map<string, number>(),
    opponent = new Map<string, number>(),
    lastPlayed = new Set<string>()
  for (const m of state.history) {
    const ids = m.players
    if (state.format === 'doubles' && ids.length === 4) {
      addPair(teammate, ids[0]!, ids[1]!)
      addPair(teammate, ids[2]!, ids[3]!)
      opponentPairs(ids).forEach((x) => addPair(opponent, x[0], x[1]))
    } else if (ids.length === 2) addPair(opponent, ids[0]!, ids[1]!)
  }
  state.currentCourts.forEach((c) => {
    if (c.status === 'playing') c.players.forEach((id) => lastPlayed.add(id))
  })
  return { teammate, opponent, lastPlayed }
}

// Fisher-Yates; `random` is injectable so tests can be deterministic.
export function shuffle<T>(a: T[], random: () => number = Math.random): T[] {
  const out = [...a]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function committedCount(p: Player): number {
  return p.matchCount + (p.matchCountPending || 0) + (p.reserved ? 1 : 0)
}

function scheduleScore(state: SessionState, ids: string[]): number {
  const selected = new Set(ids)
  // Count matches already committed elsewhere: matchCountPending covers a
  // court that is playing, reserved covers one still under review. Without
  // these, generating court 2 cannot see who court 1 just took.
  const after = state.players.map(
    (p) => committedCount(p) + (selected.has(p.id) ? 1 : 0),
  )
  const max = Math.max(...after),
    min = Math.min(...after),
    spread = max - min
  const avg = after.reduce((a, b) => a + b, 0) / after.length
  const variance = after.reduce((s, c) => s + (c - avg) ** 2, 0)
  let score = spread * 100000 + variance * 3000
  ids.forEach((id) => {
    const p = findPlayer(state, id)
    if (!p) return
    score -= Math.min(p.waitStreak || 0, 10) * 120
    // Early arrival is only a small tie-breaker and fades as the player gets matches.
    const earlyCredit = Math.max(
      0,
      3 - (p.matchCount || 0) - (p.matchCountPending || 0),
    )
    // Credit must grow as arrivalOrder shrinks: lower score wins, so
    // subtracting the raw arrivalOrder would reward the LAST to arrive.
    const earliness = 100 - Math.min(p.arrivalOrder || 0, 100)
    score -= earliness * 0.02 * earlyCredit
  })
  return score
}

function arrangementScore(
  state: SessionState,
  matches: ProposedMatch[],
  maps: RelationshipMaps,
): number {
  let score = scheduleScore(
    state,
    matches.flatMap((m) => m.players),
  )
  for (const m of matches) {
    if (state.format === 'doubles') {
      const [a, b, c, d] = m.players as [string, string, string, string]
      score +=
        teammatePenalty(state, maps, a, b) + teammatePenalty(state, maps, c, d)
      opponentPairs(m.players).forEach(
        (x) => (score += pairCount(maps.opponent, x[0], x[1]) * 250),
      )
    } else
      score += pairCount(maps.opponent, m.players[0]!, m.players[1]!) * 250
  }
  return score
}

function bestDoubles(
  state: SessionState,
  group: string[],
  maps: RelationshipMaps,
): string[] {
  const [a, b, c, d] = group as [string, string, string, string]
  // Pairing is forced when a fixed pair is present; nothing left to optimise.
  if (group.some((id) => partnerIn(state, id, group))) return group
  const opts = [
    [a, b, c, d],
    [a, c, b, d],
    [a, d, b, c],
  ]
  const s = (q: string[]) =>
    teammatePenalty(state, maps, q[0]!, q[1]!) +
    teammatePenalty(state, maps, q[2]!, q[3]!) +
    opponentPairs(q).reduce(
      (n, z) => n + pairCount(maps.opponent, z[0], z[1]) * 250,
      0,
    )
  return opts.sort((x, y) => s(x) - s(y))[0]!
}

function makeUnit(players: Player[]): Unit {
  return {
    ids: players.map((p) => p.id),
    size: players.length,
    matchCount: Math.max(...players.map((p) => p.matchCount || 0)),
    waitStreak: Math.max(...players.map((p) => p.waitStreak || 0)),
    arrivalOrder: Math.max(...players.map((p) => p.arrivalOrder || 0)),
  }
}

// Groups the eligible pool into schedulable units: a solo player, or a locked
// fixed pair. A partnered player whose partner is unavailable is left out
// entirely - they sit out until their partner is back.
function buildUnits(state: SessionState, eligible: Player[]): Unit[] {
  if (state.format !== 'doubles') return eligible.map((p) => makeUnit([p]))

  const eligibleIds = new Set(eligible.map((p) => p.id))
  const used = new Set<string>()
  const units: Unit[] = []

  eligible.forEach((p) => {
    if (used.has(p.id)) return
    const partnerId = p.partnerId
    if (partnerId && eligibleIds.has(partnerId) && !used.has(partnerId)) {
      const partner = eligible.find((x) => x.id === partnerId)!
      used.add(p.id)
      used.add(partner.id)
      units.push(makeUnit([p, partner]))
    }
  })

  eligible.forEach((p) => {
    if (used.has(p.id)) return
    if (p.partnerId) return // partner unavailable - both sit out
    units.push(makeUnit([p]))
  })

  return units
}

function sortUnits(units: Unit[]): Unit[] {
  return [...units].sort(
    (a, b) =>
      a.matchCount - b.matchCount ||
      b.waitStreak - a.waitStreak ||
      a.arrivalOrder - b.arrivalOrder,
  )
}

// Exhaustive rather than greedy: walking units in priority order and skipping
// any that overflow can miss a valid line-up (e.g. solo+pair+pair with need 4
// stalls at 3, even though pair+pair fits).
function enumerateUnitCombos(units: Unit[], need: number, limit = 3000): Unit[][] {
  const combos: Unit[][] = []
  const walk = (start: number, chosen: Unit[], filled: number) => {
    if (combos.length >= limit) return
    if (filled === need) {
      combos.push([...chosen])
      return
    }
    for (let i = start; i < units.length; i++) {
      const unit = units[i]!
      if (filled + unit.size > need) continue
      chosen.push(unit)
      walk(i + 1, chosen, filled + unit.size)
      chosen.pop()
      if (combos.length >= limit) return
    }
  }
  walk(0, [], 0)
  return combos
}

// Orders a combo into slots so a fixed pair always lands on the same team.
function comboPlayers(
  state: SessionState,
  combo: Unit[],
  maps: RelationshipMaps,
): string[] {
  if (state.format !== 'doubles') return combo.flatMap((u) => u.ids)
  const pairs = combo.filter((u) => u.size === 2)
  const solos = combo.filter((u) => u.size === 1)
  if (pairs.length === 2) return [...pairs[0]!.ids, ...pairs[1]!.ids]
  if (pairs.length === 1)
    return [...pairs[0]!.ids, ...solos.flatMap((u) => u.ids)]
  return bestDoubles(
    state,
    solos.flatMap((u) => u.ids),
    maps,
  )
}

function enumeratePlayerCombos(players: Player[], need: number, limit = 3000): Player[][] {
  const combos: Player[][] = []
  const walk = (start: number, chosen: Player[]) => {
    if (combos.length >= limit) return
    if (chosen.length === need) {
      combos.push([...chosen])
      return
    }
    for (let i = start; i < players.length; i++) {
      chosen.push(players[i]!)
      walk(i + 1, chosen)
      chosen.pop()
      if (combos.length >= limit) return
    }
  }
  walk(0, [])
  return combos
}

// The partners left out when only one half of a pair is in the line-up.
// Both-in is never broken: arrangePlayers always seats them together.
function brokenPartners(state: SessionState, ids: string[]): Player[] {
  const out: Player[] = []
  ids.forEach((id) => {
    const partnerId = getPartnerId(state, id)
    if (!partnerId || ids.includes(partnerId)) return
    const partner = findPlayer(state, partnerId)
    if (partner) out.push(partner)
  })
  return out
}

// Seats an intact fixed pair in slots 0-1 so they share a team; with two
// intact pairs the second lands in slots 2-3.
function arrangePlayers(
  state: SessionState,
  ids: string[],
  maps: RelationshipMaps,
): string[] {
  if (state.format !== 'doubles') return ids
  const anchor = ids.find((id) => partnerIn(state, id, ids))
  if (!anchor) return bestDoubles(state, ids, maps)
  const partnerId = getPartnerId(state, anchor)!
  const rest = ids.filter((id) => id !== anchor && id !== partnerId)
  return [anchor, partnerId, ...rest]
}

// Splitting a pair is a last resort: the best intact line-up wins unless the
// best split line-up is better by a full spread point (the 100000 weight in
// scheduleScore). So a pair only breaks when keeping it together would leave
// someone's match count genuinely out of line - never to merely tie on
// fairness. This is what keeps a pair balanced on a roster where only one
// player can sit out, since the pair can never rest together there.
// Tuned empirically: below this the pair splits when it did not need to,
// above it the one-spare case drifts badly out of balance.
const SPLIT_MARGIN = 100000

export function findBestSchedule(
  state: SessionState,
  eligible: Player[],
  courtNumber: number,
  maps: RelationshipMaps,
): ProposedMatch | null {
  const need = playersPerMatch(state)
  const pool = sortUnits(buildUnits(state, eligible))
    .flatMap((u) => u.ids)
    .slice(0, 14)
    .map((id) => eligible.find((p) => p.id === id))
    .filter((p): p is Player => !!p)

  const combos = enumeratePlayerCombos(pool, need)
  if (!combos.length) return null

  let bestIntact: ProposedMatch | null = null,
    bestIntactScore = Infinity,
    bestSplit: ProposedMatch | null = null,
    bestSplitScore = Infinity

  for (const combo of combos) {
    const ids = combo.map((p) => p.id)
    const players = arrangePlayers(state, ids, maps)
    const score = arrangementScore(state, [{ court: courtNumber, players }], maps)
    if (brokenPartners(state, ids).length === 0) {
      if (score < bestIntactScore) {
        bestIntactScore = score
        bestIntact = { court: courtNumber, players }
      }
    } else if (score < bestSplitScore) {
      bestSplitScore = score
      bestSplit = { court: courtNumber, players }
    }
  }

  if (!bestIntact) return bestSplit
  if (bestSplit && bestSplitScore < bestIntactScore - SPLIT_MARGIN)
    return bestSplit
  return bestIntact
}

function updateWaitingAfterSelection(state: SessionState, selectedIds: string[]): void {
  const selected = new Set(selectedIds)
  state.players.forEach((p) => {
    if (!p.arrived || selected.has(p.id) || p.currentlyPlaying)
      p.waitStreak = 0
    else p.waitStreak = (p.waitStreak || 0) + 1
  })
}

export function getEligiblePlayers(state: SessionState): Player[] {
  return state.players.filter(
    (p) =>
      p.arrived && p.available !== false && !p.currentlyPlaying && !p.reserved,
  )
}

function clearCourt(court: Court): void {
  court.status = 'idle'
  court.players = []
  court.matchId = null
  court.startedAt = null
  court.roundNumber = null
}

function applyPendingMatch(
  state: SessionState,
  courtNumber: number,
  match: ProposedMatch,
): void {
  const court = findCourt(state, courtNumber)
  const pending: Court = {
    court: courtNumber,
    players: match.players,
    status: 'pending',
    matchId: null,
    startedAt: null,
    roundNumber: null,
  }
  if (court) Object.assign(court, pending)
  else state.currentCourts.push(pending)
  state.players.forEach((p) => {
    if (match.players.includes(p.id)) p.reserved = true
  })
}

export function proposeMatchForCourt(state: SessionState, courtNumber: number): boolean {
  const court = findCourt(state, courtNumber)
  if (court && court.status !== 'idle') return false

  const eligible = getEligiblePlayers(state)
  if (eligible.length < playersPerMatch(state)) return false

  const maps = relationshipMaps(state)
  const match = findBestSchedule(state, eligible, courtNumber, maps)
  if (!match) return false

  applyPendingMatch(state, courtNumber, match)
  return true
}

function buildRerollMatch(
  state: SessionState,
  eligible: Player[],
  courtNumber: number,
  maps: RelationshipMaps,
  previousIds: string[],
  random: () => number,
): ProposedMatch | null {
  const need = playersPerMatch(state)
  const units = sortUnits(buildUnits(state, eligible)).slice(0, 14)
  const combos = enumerateUnitCombos(units, need)
  if (!combos.length) return null

  // Every combo except the one just rejected, so the result is always a
  // different set. Picking uniformly means the line-up may keep some, none or
  // all-but-one of the previous players.
  const previousKey = [...previousIds].sort().join(',')
  const distinct = combos.filter(
    (c) =>
      c
        .flatMap((u) => u.ids)
        .sort()
        .join(',') !== previousKey,
  )
  if (!distinct.length) return null

  const combo = shuffle(distinct, random)[0]!
  return { court: courtNumber, players: comboPlayers(state, combo, maps) }
}

export function confirmCourt(state: SessionState, courtNumber: number): boolean {
  const court = findCourt(state, courtNumber)
  if (!court || court.status !== 'pending') return false

  court.status = 'playing'
  court.matchId = makeId()
  court.startedAt = new Date().toISOString()
  court.roundNumber = state.nextRoundNumber++

  state.players.forEach((p) => {
    if (court.players.includes(p.id)) {
      p.matchCountPending = (p.matchCountPending || 0) + 1
      p.currentlyPlaying = true
      p.reserved = false
      p.waitStreak = 0
    }
  })
  updateWaitingAfterSelection(state, court.players)
  return true
}

export function rerollCourt(
  state: SessionState,
  courtNumber: number,
  random: () => number = Math.random,
): boolean {
  const court = findCourt(state, courtNumber)
  if (!court || court.status !== 'pending') return false

  const previousIds = [...court.players]

  state.players.forEach((p) => {
    if (previousIds.includes(p.id)) p.reserved = false
  })
  court.status = 'idle'
  court.players = []

  const eligible = getEligiblePlayers(state)
  const maps = relationshipMaps(state)
  const match = buildRerollMatch(state, eligible, courtNumber, maps, previousIds, random)

  if (!match) {
    court.status = 'pending'
    court.players = previousIds
    state.players.forEach((p) => {
      if (previousIds.includes(p.id)) p.reserved = true
    })
    return false
  }

  applyPendingMatch(state, courtNumber, match)
  return true
}

// Only genuine solos: swapping in half of a bench pair would split that pair.
export function getSwapCandidates(state: SessionState): Player[] {
  const eligible = getEligiblePlayers(state)
  return buildUnits(state, eligible)
    .filter((u) => u.size === 1)
    .map((u) => eligible.find((p) => p.id === u.ids[0]))
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Replaces a fixed pair on a pending court with two random bench players -
// either another fixed pair, or two genuine solos.
export function replacePairOnCourt(
  state: SessionState,
  courtNumber: number,
  slotIndex: number,
  random: () => number = Math.random,
): boolean {
  const court = findCourt(state, courtNumber)
  if (!court || court.status !== 'pending') return false
  if (state.format !== 'doubles') return false

  const id = court.players[slotIndex]
  if (!id) return false
  const partnerId = getPartnerId(state, id)
  if (!partnerId || !court.players.includes(partnerId)) return false

  const slots = [
    court.players.indexOf(id),
    court.players.indexOf(partnerId),
  ].sort((a, b) => a - b) as [number, number]

  const bench = getEligiblePlayers(state)
  const combos = enumerateUnitCombos(sortUnits(buildUnits(state, bench)), 2)
  if (!combos.length) return false

  const incoming = shuffle(combos, random)[0]!.flatMap((u) => u.ids)
  if (incoming.length !== 2) return false

  ;[id, partnerId].forEach((pid) => {
    const p = findPlayer(state, pid)
    if (p) p.reserved = false
  })
  incoming.forEach((pid) => {
    const p = findPlayer(state, pid)
    if (p) p.reserved = true
  })

  court.players[slots[0]] = incoming[0]!
  court.players[slots[1]] = incoming[1]!
  return true
}

export function swapPlayerInCourt(
  state: SessionState,
  courtNumber: number,
  slotIndex: number,
  newPlayerId: string,
): boolean {
  const court = findCourt(state, courtNumber)
  if (!court || court.status !== 'pending') return false
  if (slotIndex < 0 || slotIndex >= court.players.length) return false

  const outgoingId = court.players[slotIndex]!
  if (!newPlayerId || outgoingId === newPlayerId) return false
  // An intact pair moves only via replacePairOnCourt. A split half (partner
  // not on this court) behaves like any other player.
  if (state.format === 'doubles' && partnerIn(state, outgoingId, court.players))
    return false
  if (state.format === 'doubles' && getPartnerId(state, newPlayerId)) return false
  if (court.players.includes(newPlayerId)) return false

  const incoming = findPlayer(state, newPlayerId)
  if (!incoming) return false
  if (
    !incoming.arrived ||
    incoming.available === false ||
    incoming.currentlyPlaying ||
    incoming.reserved
  )
    return false

  const outgoing = findPlayer(state, outgoingId)
  if (outgoing) outgoing.reserved = false
  incoming.reserved = true

  court.players[slotIndex] = newPlayerId
  return true
}

export function cancelPendingCourt(state: SessionState, courtNumber: number): boolean {
  const court = findCourt(state, courtNumber)
  if (!court || court.status !== 'pending') return false

  state.players.forEach((p) => {
    if (court.players.includes(p.id)) p.reserved = false
  })
  clearCourt(court)
  return true
}

export function partitionKey(players: string[]): string {
  const teamA = [players[0], players[1]].sort().join(',')
  const teamB = [players[2], players[3]].sort().join(',')
  return [teamA, teamB].sort().join('|')
}

function arrangementKeepsPairs(state: SessionState, players: string[]): boolean {
  const teamA = [players[0], players[1]]
  const teamB = [players[2], players[3]]
  return players.every((id) => {
    const partnerId = getPartnerId(state, id)
    if (!partnerId || !players.includes(partnerId)) return true
    return (
      (teamA.includes(id) && teamA.includes(partnerId)) ||
      (teamB.includes(id) && teamB.includes(partnerId))
    )
  })
}

function legalArrangements(state: SessionState, players: string[]): string[][] {
  const [w, x, y, z] = [...players].sort() as [string, string, string, string]
  return [
    [w, x, y, z], // w+x vs y+z
    [x, z, w, y], // x+z vs w+y
    [y, x, z, w], // y+x vs z+w
  ].filter((a) => arrangementKeepsPairs(state, a))
}

// With any fixed pair on court only one split stays legal, so there is nothing
// to cycle through - the UI hides the button in that case.
export function hasSwappableArrangement(state: SessionState, court: Court): boolean {
  return (
    state.format === 'doubles' &&
    court.players?.length === 4 &&
    legalArrangements(state, court.players).length > 1
  )
}

export function cycleDoublesArrangement(state: SessionState, courtNumber: number): boolean {
  const court = findCourt(state, courtNumber)
  if (
    !court ||
    !['pending', 'playing'].includes(court.status) ||
    state.format !== 'doubles'
  )
    return false
  if (!court.players || court.players.length !== 4) return false

  const legal = legalArrangements(state, court.players)
  if (legal.length <= 1) return false

  const currentIndex = legal.findIndex(
    (a) => partitionKey(a) === partitionKey(court.players),
  )
  court.players = legal[(currentIndex + 1) % legal.length]!
  return true
}

export function completeCourt(
  state: SessionState,
  courtNumber: number,
  score: Score | null = null,
): boolean {
  const court = findCourt(state, courtNumber)
  if (!court || court.status !== 'playing') return false
  state.history.push({
    court: court.court,
    courtName: getCourtName(state, court.court),
    roundNumber: court.roundNumber ?? 0,
    players: [...court.players],
    startedAt: court.startedAt ?? null,
    completedAt: new Date().toISOString(),
    score,
  })
  const ids = new Set(court.players)
  state.players.forEach((p) => {
    if (ids.has(p.id)) {
      p.matchCount += p.matchCountPending || 1
      p.matchCountPending = 0
      p.currentlyPlaying = false
      p.waitStreak = 0
    }
  })
  clearCourt(court)
  return true
}

export function completeAllPlaying(state: SessionState): void {
  state.currentCourts
    .filter((c) => c.status === 'playing')
    .forEach((c) => completeCourt(state, c.court))
}
