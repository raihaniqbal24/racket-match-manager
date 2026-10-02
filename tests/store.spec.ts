import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionStore } from '../src/stores/session'

function setup(names = 'Ana, Ben, Cara, Dev, Eli') {
  const store = useSessionStore()
  store.addPlayers(names)
  store.arriveAll()
  return store
}

beforeEach(() => setActivePinia(createPinia()))

describe('players', () => {
  it('bulk-adds names and skips duplicates case-insensitively', () => {
    const store = useSessionStore()
    const result = store.addPlayers('Ana, Ben\nCara;  ana ,, Dev  Singh ')
    expect(result).toMatchObject({ ok: true, added: 4 })
    expect(result.message).toBe('Added 4 players. Skipped 1 already listed.')
    expect(store.state.players.map((p) => p.name)).toEqual(['Ana', 'Ben', 'Cara', 'Dev Singh'])
    expect(store.addPlayers('BEN')).toMatchObject({ ok: false, message: 'BEN is already listed.' })
    expect(store.addPlayers('  ,  ').ok).toBe(false)
  })

  it('records arrival order once', () => {
    const store = useSessionStore()
    store.addPlayers('Ana, Ben')
    const [ana, ben] = store.state.players
    store.setArrived(ben!.id, true)
    store.setArrived(ana!.id, true)
    store.setArrived(ben!.id, false)
    store.setArrived(ben!.id, true)
    expect(ben!.arrivalOrder).toBe(1)
    expect(ana!.arrivalOrder).toBe(2)
  })

  it('blocks changes to players who are in a match', () => {
    const store = setup('Ana, Ben, Cara, Dev')
    store.generate(1)
    const id = store.state.players[0]!.id
    expect(store.setArrived(id, false).ok).toBe(false)
    expect(store.setSittingOut(id, true).ok).toBe(false)
    expect(store.removePlayer(id).ok).toBe(false)
    expect(store.setPartner(id, store.state.players[1]!.id).ok).toBe(false)
  })

  it('deletes a player who never played but keeps one who has', () => {
    const store = setup()
    store.generate(1)
    store.confirm(1)
    const benched = store.state.players.find((p) => !p.currentlyPlaying)!
    const onCourt = store.state.players.find((p) => p.currentlyPlaying)!
    store.complete(1)

    expect(store.removePlayer(benched.id).message).toBe(`Removed ${benched.name}.`)
    expect(store.state.players).toHaveLength(4)
    expect(store.removePlayer(onCourt.id).message).toContain('gone home')
    expect(store.state.players).toHaveLength(4)
    expect(onCourt).toMatchObject({ arrived: false, available: false })
  })

  it('clear arrivals releases pending courts', () => {
    const store = setup()
    store.generate(1)
    store.clearArrivals()
    expect(store.state.currentCourts[0]!.status).toBe('idle')
    expect(store.state.players.some((p) => p.reserved || p.arrived)).toBe(false)
  })
})

describe('setup', () => {
  it('locks sport and format once a match has started', () => {
    const store = setup()
    expect(store.setFormat('singles').ok).toBe(true)
    expect(store.setSport('table-tennis').ok).toBe(true)
    expect(store.state.courtNames).toEqual(['Table 1', 'Table 2'])
    expect(store.state.format).toBe('singles')
    store.generate(1)
    store.confirm(1)
    expect(store.setFormat('doubles').ok).toBe(false)
    expect(store.setSport('tennis').ok).toBe(false)
  })

  it('only refuses to remove a court that is in play', () => {
    const store = setup('A,B,C,D,E,F,G,H')
    store.generateAll()
    store.confirm(2)
    expect(store.setCourts(1).ok).toBe(false)
    expect(store.setCourts(3).ok).toBe(true)
    expect(store.state.currentCourts).toHaveLength(3)

    store.complete(2)
    store.generate(2)
    // Court 2 is only pending now: dropping it must free its players.
    expect(store.setCourts(1).ok).toBe(true)
    expect(store.state.players.filter((p) => p.reserved)).toHaveLength(4)
    expect(store.state.courtNames).toEqual(['Court 1'])
  })

  it('falls back to the default name when a court name is cleared', () => {
    const store = useSessionStore()
    store.setCourtName(0, '  Centre  ')
    store.setCourtName(1, '   ')
    expect(store.state.courtNames).toEqual(['Centre', 'Court 2'])
  })
})

describe('undo', () => {
  it('restores the previous state step by step', () => {
    const store = setup('Ana, Ben, Cara, Dev')
    store.generate(1)
    store.confirm(1)
    store.complete(1, { a: 6, b: 4 })
    expect(store.state.history).toHaveLength(1)

    expect(store.undo().message).toBe('Undid: complete match')
    expect(store.state.history).toHaveLength(0)
    expect(store.state.currentCourts[0]!.status).toBe('playing')
    expect(store.state.players.every((p) => p.currentlyPlaying && p.matchCount === 0)).toBe(true)

    store.undo()
    expect(store.state.currentCourts[0]!.status).toBe('pending')
    store.undo()
    expect(store.state.currentCourts[0]!.status).toBe('idle')
  })

  it('does not record failed or no-op actions', () => {
    const store = useSessionStore()
    expect(store.canUndo).toBe(false)
    store.generate(1)
    store.complete(1)
    store.setCourts(2)
    expect(store.canUndo).toBe(false)
    expect(store.undo().ok).toBe(false)
  })
})

describe('session', () => {
  it('new session can keep players and their fixed partners', () => {
    const store = setup('Ana, Ben, Cara, Dev')
    const [ana, ben] = store.state.players
    store.setPartner(ana!.id, ben!.id)
    store.generate(1)
    store.confirm(1)
    store.complete(1)

    store.resetSession(true)
    expect(store.state.history).toEqual([])
    expect(store.state.nextRoundNumber).toBe(1)
    expect(store.state.players).toHaveLength(4)
    expect(store.state.players.every((p) => !p.arrived && p.matchCount === 0)).toBe(true)
    expect(store.state.players[0]!.partnerId).toBe(store.state.players[1]!.id)

    store.resetSession(false)
    expect(store.state.players).toEqual([])
    store.undo()
    expect(store.state.players).toHaveLength(4)
  })

  it('round-trips through export and import', () => {
    const store = setup('Ana, Ben, Cara, Dev')
    store.setSport('padel')
    store.generate(1)
    store.confirm(1)
    store.complete(1, { a: 6, b: 2 })
    store.generate(1)
    const before = JSON.parse(JSON.stringify(store.state))
    const file = store.exportJson()

    store.resetSession(false)
    const result = store.importJson(file)
    expect(result).toMatchObject({ ok: true, message: 'Imported 4 players and 1 match.' })
    expect(JSON.parse(JSON.stringify(store.state))).toEqual(before)
  })

  it('rejects files that are not a session', () => {
    const store = setup()
    expect(store.importJson('not json').ok).toBe(false)
    expect(store.importJson('{"hello":1}').ok).toBe(false)
    expect(store.importJson('[1,2]').ok).toBe(false)
    expect(store.state.players).toHaveLength(5)
  })
})
