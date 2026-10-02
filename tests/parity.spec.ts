import { existsSync, readFileSync } from 'node:fs'
import vm from 'node:vm'
import { expect, it } from 'vitest'
import { completeAllPlaying, confirmCourt, proposeMatchForCourt, setFixedPartner } from '../src/domain/scheduler'
import { makeSession } from './helpers'

// Regression guard for the port: replays identical sessions through the
// original Tennis Match Manager scheduler and this one and requires identical
// line-ups. Skipped when the original project is not checked out alongside.
const OLD = new URL('../../tennis-match-manager/js/', import.meta.url)

function oldApp() {
  const ctx: any = { localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => null }, console }
  vm.createContext(ctx)
  const src = readFileSync(new URL('state.js', OLD), 'utf8') + '\n' + readFileSync(new URL('scheduler.js', OLD), 'utf8') +
    '\n;globalThis.api={state,proposeMatchForCourt,confirmCourt,completeAllPlaying,setFixedPartner};'
  vm.runInContext(src, ctx)
  return ctx.api
}

function run(players: number, courts: number, format: 'doubles' | 'singles', pairs: [string, string][], rounds: number) {
  const neu = makeSession(players, courts, format)
  const old = oldApp()
  old.state.courts = courts
  old.state.format = format
  old.state.currentCourts = JSON.parse(JSON.stringify(neu.currentCourts))
  old.state.players = JSON.parse(JSON.stringify(neu.players))
  pairs.forEach(([a, b]) => { setFixedPartner(neu, a, b); old.setFixedPartner(a, b) })
  let maxSpread = 0, intact = 0
  for (let r = 0; r < rounds; r++) {
    for (let n = 1; n <= courts; n++) {
      const a = proposeMatchForCourt(neu, n), b = old.proposeMatchForCourt(n)
      expect(a).toBe(b)
      const np = neu.currentCourts[n - 1]!.players
      expect(np).toEqual([...old.state.currentCourts[n - 1].players])
      if (np.includes('p1') && np.includes('p2')) intact++
      confirmCourt(neu, n); old.confirmCourt(n)
    }
    completeAllPlaying(neu); old.completeAllPlaying()
    const c = neu.players.map((p) => p.matchCount)
    expect(c).toEqual(old.state.players.map((p: any) => p.matchCount))
    expect(neu.players.map((p) => p.waitStreak)).toEqual(old.state.players.map((p: any) => p.waitStreak))
    maxSpread = Math.max(maxSpread, Math.max(...c) - Math.min(...c))
  }
  return { maxSpread, intact, final: neu.players.map((p) => p.matchCount) }
}

it.skipIf(!existsSync(OLD))('matches the original scheduler move for move', { timeout: 60_000 }, () => {
  run(9, 2, 'doubles', [], 40)
  run(5, 1, 'doubles', [], 40)
  run(5, 1, 'doubles', [['p1', 'p2']], 40)
  run(7, 1, 'doubles', [['p1', 'p2']], 40)
  run(10, 2, 'doubles', [['p1', 'p2'], ['p5', 'p6']], 40)
  run(13, 3, 'doubles', [['p1', 'p2']], 40)
  run(16, 3, 'doubles', [], 40)
  run(5, 2, 'singles', [], 40)
})
