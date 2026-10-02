import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef, toRaw, watch } from 'vue'
import * as scheduler from '../domain/scheduler'
import {
  MAX_COURTS,
  STORAGE_KEY,
  defaultState,
  ensureCourtNames,
  newPlayer,
  normalizeState,
  parseState,
  relabelDefaultCourtNames,
  syncCourts,
} from '../domain/session'
import { getSport } from '../domain/sports'
import { hasPlayed } from '../domain/stats'
import type { ActionResult, Format, Player, Score, SessionState, SportId } from '../domain/types'

const UNDO_LIMIT = 20

interface UndoEntry {
  label: string
  snapshot: string
}

const ok = (message?: string): ActionResult => ({ ok: true, message })
const fail = (message: string): ActionResult => ({ ok: false, message })
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export const useSessionStore = defineStore('session', () => {
  const stored = readStorage()
  const state = reactive<SessionState>(parseState(stored))
  const lastSaved = ref<string | null>(state.lastSaved)
  const undoStack = shallowRef<UndoEntry[]>([])

  const snapshot = () => JSON.stringify(toRaw(state))

  watch(
    state,
    () => {
      const now = new Date().toISOString()
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...toRaw(state), lastSaved: now }),
        )
        lastSaved.value = now
      } catch {
        // Storage full or blocked: the session still works in memory.
      }
    },
    { deep: true },
  )

  // Runs a change and, if it took effect, records the prior state for undo.
  function mutate(label: string, change: () => ActionResult | boolean): ActionResult {
    const before = snapshot()
    const result = change()
    const outcome = typeof result === 'boolean' ? { ok: result } : result
    if (outcome.ok && snapshot() !== before)
      undoStack.value = [...undoStack.value, { label, snapshot: before }].slice(-UNDO_LIMIT)
    return outcome
  }

  function replaceState(next: SessionState) {
    Object.assign(state, next)
  }

  function undo(): ActionResult {
    const entry = undoStack.value[undoStack.value.length - 1]
    if (!entry) return fail('Nothing to undo.')
    undoStack.value = undoStack.value.slice(0, -1)
    replaceState(normalizeState(JSON.parse(entry.snapshot)))
    return ok(`Undid: ${entry.label}`)
  }

  const find = (id: string) => state.players.find((p) => p.id === id)
  const isPlaying = computed(() => state.currentCourts.some((c) => c.status === 'playing'))
  const hasPending = computed(() => state.currentCourts.some((c) => c.status === 'pending'))
  const hasStarted = computed(() => state.history.length > 0 || isPlaying.value)
  const sport = computed(() => getSport(state.sport))
  const venue = computed(() => sport.value.venue.toLowerCase())

  function busyMessage(p: Player, pending: string, playing: string): string {
    return p.reserved ? pending : playing
  }

  function markArrived(p: Player) {
    if (!p.arrivalOrder) {
      p.arrivalOrder = Math.max(0, ...state.players.map((x) => x.arrivalOrder || 0)) + 1
      p.arrivalTime = Date.now()
    }
    p.arrived = true
    p.available = true
  }

  // ---- players -----------------------------------------------------------

  /** Accepts one name or a comma / newline separated list. */
  function addPlayers(text: string): ActionResult & { added: number } {
    const names = text
      .split(/[\n,;]+/)
      .map((n) => n.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
    if (!names.length) return { ok: false, added: 0 }
    const taken = new Set(state.players.map((p) => p.name.toLowerCase()))
    const fresh: string[] = []
    const skipped: string[] = []
    for (const name of names) {
      if (taken.has(name.toLowerCase())) skipped.push(name)
      else {
        taken.add(name.toLowerCase())
        fresh.push(name)
      }
    }
    if (!fresh.length)
      return {
        ok: false,
        added: 0,
        message: skipped.length === 1 ? `${skipped[0]} is already listed.` : 'Those players are already listed.',
      }
    mutate(fresh.length === 1 ? `add ${fresh[0]}` : `add ${fresh.length} players`, () => {
      fresh.forEach((name) => state.players.push(newPlayer(name)))
      return true
    })
    const parts = []
    if (fresh.length > 1) parts.push(`Added ${fresh.length} players.`)
    if (skipped.length) parts.push(`Skipped ${skipped.length} already listed.`)
    return { ok: true, added: fresh.length, message: parts.join(' ') || undefined }
  }

  function setArrived(id: string, arrived: boolean): ActionResult {
    const p = find(id)
    if (!p) return fail('Player not found.')
    if (p.currentlyPlaying || p.reserved)
      return fail(
        busyMessage(
          p,
          `${p.name} is in a pending match — re-roll or cancel it first.`,
          `${p.name} is currently playing.`,
        ),
      )
    return mutate(`${p.name} ${arrived ? 'arrived' : 'not arrived'}`, () => {
      if (arrived) markArrived(p)
      else p.arrived = false
      return true
    })
  }

  function setSittingOut(id: string, sittingOut: boolean): ActionResult {
    const p = find(id)
    if (!p) return fail('Player not found.')
    if (p.currentlyPlaying || p.reserved)
      return fail(
        busyMessage(
          p,
          `${p.name} is in a pending match — re-roll or cancel it first.`,
          `${p.name} is currently playing.`,
        ),
      )
    return mutate(`${p.name} ${sittingOut ? 'sitting out' : 'back in'}`, () => {
      p.available = !sittingOut
      return true
    })
  }

  // Players with match history are kept (marked as gone home) so history and
  // balance stay intact; players who never played are deleted outright.
  function removePlayer(id: string): ActionResult {
    const p = find(id)
    if (!p) return fail('Player not found.')
    if (p.currentlyPlaying || p.reserved)
      return fail(
        busyMessage(
          p,
          'Cannot remove a player in a pending match.',
          'Cannot remove a player currently playing.',
        ),
      )
    if (hasPlayed(state, id)) {
      mutate(`${p.name} gone home`, () => {
        p.available = false
        p.arrived = false
        return true
      })
      return ok(`${p.name} has been marked as gone home.`)
    }
    mutate(`remove ${p.name}`, () => {
      scheduler.clearFixedPartner(state, id)
      state.players = state.players.filter((x) => x.id !== id)
      return true
    })
    return ok(`Removed ${p.name}.`)
  }

  function arriveAll(): ActionResult {
    return mutate('all arrived', () => {
      state.players.forEach(markArrived)
      return true
    })
  }

  function clearArrivals(): ActionResult {
    return mutate('clear arrivals', () => {
      // Release pending courts first, otherwise they keep referencing players
      // who are no longer marked as arrived.
      state.currentCourts.forEach((c) => {
        if (c.status === 'pending') scheduler.cancelPendingCourt(state, c.court)
      })
      state.players.forEach((p) => {
        if (!p.currentlyPlaying) p.arrived = false
      })
      return true
    })
  }

  function setPartner(id: string, partnerId: string | null): ActionResult {
    const done = mutate('change fixed partner', () =>
      partnerId
        ? scheduler.setFixedPartner(state, id, partnerId)
        : scheduler.clearFixedPartner(state, id),
    )
    if (!done.ok && partnerId)
      return fail("Can't change partners while either player is in a match.")
    return done
  }

  // ---- session setup -----------------------------------------------------

  function setCourts(count: number): ActionResult {
    const next = Math.max(1, Math.min(MAX_COURTS, Math.floor(Number(count)) || 1))
    const dropped = state.currentCourts.filter((c) => c.court > next)
    if (dropped.some((c) => c.status === 'playing'))
      return fail(`Finish the match on a ${venue.value} before removing it.`)
    return mutate(`change ${venue.value} count`, () => {
      dropped.forEach((c) => scheduler.cancelPendingCourt(state, c.court))
      state.courts = next
      ensureCourtNames(state)
      syncCourts(state)
      return true
    })
  }

  function setCourtName(index: number, name: string): ActionResult {
    return mutate(`rename ${venue.value}`, () => {
      state.courtNames[index] = name.trim().slice(0, 40) || `${sport.value.venue} ${index + 1}`
      return true
    })
  }

  function setFormat(format: Format): ActionResult {
    if (hasStarted.value) return fail('Format is locked after matches start.')
    return mutate('change format', () => {
      // Pending line-ups were built for the old format.
      state.currentCourts.forEach((c) => scheduler.cancelPendingCourt(state, c.court))
      state.format = format
      return true
    })
  }

  function setSport(id: SportId): ActionResult {
    if (hasStarted.value) return fail('Sport is locked after matches start.')
    return mutate('change sport', () => {
      state.sport = id
      relabelDefaultCourtNames(state)
      if (state.format !== getSport(id).defaultFormat) {
        state.currentCourts.forEach((c) => scheduler.cancelPendingCourt(state, c.court))
        state.format = getSport(id).defaultFormat
      }
      return true
    })
  }

  // ---- matches -----------------------------------------------------------

  function generate(court: number): ActionResult {
    const done = mutate('generate match', () => scheduler.proposeMatchForCourt(state, court))
    return done.ok ? done : fail(`Not enough available players for this ${venue.value}.`)
  }

  function generateAll(): ActionResult {
    let made = 0
    mutate('generate matches', () => {
      for (let i = 1; i <= state.courts; i++)
        if (scheduler.proposeMatchForCourt(state, i)) made++
      return made > 0
    })
    return made ? ok() : fail(`Not enough available players to fill an idle ${venue.value}.`)
  }

  function confirm(court: number): ActionResult {
    return mutate('start match', () => scheduler.confirmCourt(state, court))
  }

  function confirmAll(): ActionResult {
    return mutate('start matches', () => {
      state.currentCourts
        .filter((c) => c.status === 'pending')
        .forEach((c) => scheduler.confirmCourt(state, c.court))
      return true
    })
  }

  function cancel(court: number): ActionResult {
    return mutate('cancel match', () => scheduler.cancelPendingCourt(state, court))
  }

  function reroll(court: number): ActionResult {
    const done = mutate('re-roll', () => scheduler.rerollCourt(state, court))
    return done.ok ? done : fail('No other available players to swap in.')
  }

  function rearrange(court: number): ActionResult {
    return mutate('swap pairing', () => scheduler.cycleDoublesArrangement(state, court))
  }

  function swap(court: number, slot: number, playerId: string): ActionResult {
    const done = mutate('swap player', () =>
      scheduler.swapPlayerInCourt(state, court, slot, playerId),
    )
    return done.ok ? done : fail("Couldn't swap that player.")
  }

  function replacePair(court: number, slot: number): ActionResult {
    const done = mutate('replace pair', () => scheduler.replacePairOnCourt(state, court, slot))
    return done.ok ? done : fail('Not enough bench players to replace this pair.')
  }

  function complete(court: number, score: Score | null = null): ActionResult {
    return mutate('complete match', () => scheduler.completeCourt(state, court, score))
  }

  function completeAll(): ActionResult {
    return mutate('complete all matches', () => {
      scheduler.completeAllPlaying(state)
      return true
    })
  }

  // ---- session -----------------------------------------------------------

  /** keepPlayers keeps names and fixed partners but clears everything played. */
  function resetSession(keepPlayers: boolean): ActionResult {
    mutate('new session', () => {
      const next = defaultState()
      next.sport = state.sport
      next.format = state.format
      next.courts = state.courts
      next.courtNames = [...state.courtNames]
      if (keepPlayers)
        next.players = state.players.map((p) => ({
          ...newPlayer(p.name),
          id: p.id,
          partnerId: p.partnerId,
        }))
      replaceState(normalizeState(next))
      return true
    })
    return ok(keepPlayers ? 'New session started with the same players.' : 'Session reset.')
  }

  function exportJson(): string {
    return JSON.stringify({ ...toRaw(state), lastSaved: lastSaved.value }, null, 2)
  }

  function importJson(text: string): ActionResult {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return fail("That file isn't valid JSON.")
    }
    if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as any).players))
      return fail("That file doesn't look like a saved session.")
    const next = normalizeState(raw)
    mutate('import session', () => {
      replaceState(next)
      return true
    })
    return ok(
      `Imported ${plural(next.players.length, 'player', 'players')} and ${plural(next.history.length, 'match', 'matches')}.`,
    )
  }

  return {
    state,
    lastSaved,
    sport,
    isPlaying,
    hasPending,
    hasStarted,
    canUndo: computed(() => undoStack.value.length > 0),
    undo,
    addPlayers,
    setArrived,
    setSittingOut,
    removePlayer,
    arriveAll,
    clearArrivals,
    setPartner,
    setCourts,
    setCourtName,
    setFormat,
    setSport,
    generate,
    generateAll,
    confirm,
    confirmAll,
    cancel,
    reroll,
    rearrange,
    swap,
    replacePair,
    complete,
    completeAll,
    resetSession,
    exportJson,
    importJson,
  }
})
