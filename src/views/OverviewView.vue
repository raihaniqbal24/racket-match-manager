<script setup lang="ts">
import { computed } from 'vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { balance, leaderboard, overviewStats } from '../domain/stats'
import { useSessionStore } from '../stores/session'

const store = useSessionStore()

const stats = computed(() => overviewStats(store.state))
const bal = computed(() => balance(store.state))
const board = computed(() => leaderboard(store.state))

const tiles = computed(() => [
  { label: 'Arrived', value: stats.value.arrived },
  { label: 'Playing', value: stats.value.playing },
  { label: 'Waiting', value: stats.value.waiting },
  { label: 'Matches played', value: stats.value.matchesPlayed },
  { label: 'Avg. per player', value: stats.value.avgMatches.toFixed(1) },
])

const hasDraws = computed(() => board.value.some((r) => r.drawn > 0))

const pct = (n: number) => `${Math.round(n * 100)}%`
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
</script>

<template>
  <div class="grid gap-4">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div v-for="t in tiles" :key="t.label" class="card last:max-sm:col-span-2">
        <div class="text-xs font-medium text-muted">{{ t.label }}</div>
        <div class="mt-1 text-2xl font-semibold tabular-nums">{{ t.value }}</div>
      </div>
    </div>

    <section class="card">
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 class="card-title">Match balance</h2>
        <span class="badge" :class="{ 'badge-ready': bal.players.length && bal.spread <= 1 }">{{ bal.label }}</span>
      </div>
      <p class="mb-3 text-xs text-muted">
        Fewest matches first. A player is flagged after waiting through 2 match starts, and again at 4.
      </p>

      <div v-if="!bal.players.length" class="empty">Nobody has arrived yet.</div>
      <ul v-else class="divide-y divide-border">
        <li v-for="p in bal.players" :key="p.id" class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 py-2.5 sm:grid-cols-[10rem_1fr_auto]">
          <span class="truncate font-semibold">{{ p.name }}</span>
          <StatusBadge :player="p" class="justify-self-end sm:order-last sm:w-36 sm:justify-center" />
          <div class="col-span-2 flex items-center gap-2.5 sm:col-span-1">
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                class="h-full rounded-full bg-primary transition-[width]"
                :style="{ width: bal.max ? `${(p.matchCount / bal.max) * 100}%` : '0%' }"
              />
            </div>
            <span class="w-6 text-right text-sm font-semibold tabular-nums">{{ p.matchCount }}</span>
          </div>
        </li>
      </ul>
    </section>

    <section class="card">
      <h2 class="card-title mb-3">Leaderboard</h2>
      <div v-if="!board.length" class="empty">
        Enter a score when completing a match and results will show up here.
      </div>
      <div v-else class="-mx-1 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[11px] tracking-wide text-muted uppercase">
              <th class="w-8 px-1 py-1.5 font-semibold">#</th>
              <th class="w-full px-1 py-1.5 font-semibold">Player</th>
              <th class="px-1.5 py-1.5 text-right font-semibold whitespace-nowrap sm:px-2.5" title="Scored matches played">P</th>
              <th class="px-1.5 py-1.5 text-right font-semibold whitespace-nowrap sm:px-2.5" title="Won">W</th>
              <th class="px-1.5 py-1.5 text-right font-semibold whitespace-nowrap sm:px-2.5" title="Lost">L</th>
              <th v-if="hasDraws" class="px-1.5 py-1.5 text-right font-semibold whitespace-nowrap sm:px-2.5" title="Drawn">D</th>
              <th class="px-1.5 py-1.5 text-right font-semibold whitespace-nowrap sm:px-2.5">Win %</th>
              <th class="px-1.5 py-1.5 text-right font-semibold whitespace-nowrap sm:px-2.5" :title="`${store.sport.scoreUnit} won minus lost`">+/−</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border tabular-nums">
            <tr v-for="(r, i) in board" :key="r.id">
              <td class="px-1 py-2 text-muted">{{ i + 1 }}</td>
              <td class="max-w-0 truncate px-1 py-2 font-semibold">{{ r.name }}</td>
              <td class="px-1.5 py-2 text-right sm:px-2.5">{{ r.played }}</td>
              <td class="px-1.5 py-2 text-right sm:px-2.5">{{ r.won }}</td>
              <td class="px-1.5 py-2 text-right sm:px-2.5">{{ r.lost }}</td>
              <td v-if="hasDraws" class="px-1.5 py-2 text-right sm:px-2.5">{{ r.drawn }}</td>
              <td class="px-1.5 py-2 text-right sm:px-2.5 font-semibold">{{ pct(r.winRate) }}</td>
              <td class="px-1.5 py-2 text-right sm:px-2.5 text-muted">{{ signed(r.diff) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
