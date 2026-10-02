# Racket Match Manager

Rotation manager for social racket-sport sessions: tennis, badminton, padel, pickleball, squash and table tennis. Runs entirely in the browser; the session is saved in `localStorage`.

A Vue 3 rewrite of [Tennis Match Manager](https://github.com/raihaniqbal24/tennis-match-manager).

## Features

- **Fair rotation** — balances match counts (targeting equal, otherwise a spread of 1), rewards players who have waited longest, and gives a small bonus to early arrivals.
- **Independent courts** — complete and refill one court without waiting for the others.
- **Two-stage matches** — a generated match sits in *Reviewing* until you start it, so nothing counts until it is confirmed. While reviewing you can re-roll, swap any player for someone on the bench, or cycle the doubles pairing.
- **Fixed partners** — two players who always play on the same team. They are only split when that is the only way to keep playtime even.
- **Sport picker** — sets the wording (court / table), default format and score unit.
- **Scores and leaderboard** — optionally enter a score when completing a match; wins, losses and win rate build up in Overview.
- **Match timer** on every court in play, and a bench list showing who has waited longest.
- **Undo** for the last 20 actions, including completing a match or resetting the session.
- **Export / import** the session as a JSON file. Saves from Tennis Match Manager import too.
- **New session, same players** — clear the matches but keep the roster and fixed pairs.
- Bulk-add players from a comma- or line-separated list.
- Built-in "How it works" guide, shown on first visit and available from the menu.
- Light and dark themes, phone-first layout.

## Development

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run test` | Run the unit tests |
| `npm run type-check` | Type-check with `vue-tsc` |
| `npm run build` | Type-check and build to `dist/` |

The build uses a relative base path, so `dist/` can be served from any folder (for example GitHub Pages).

## Structure

```
src/
  domain/       Pure logic, no Vue: scheduler, session state, stats, sports
  stores/       Pinia store: actions, persistence, undo
  composables/  Toast, theme, shared clock
  components/   UI by area: setup, courts, ui
  views/        Players, Courts, Overview
tests/          Vitest specs for the domain and the store
```

The scheduler in `src/domain/scheduler.ts` is a function-for-function port of the original. `tests/parity.spec.ts` replays identical sessions through both and requires identical line-ups; it runs when the original project is checked out next to this one and is skipped otherwise.

Built with ❤️ and a little help from AI.
