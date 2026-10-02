<script setup lang="ts">
import { computed, ref } from 'vue'
import { getCourtName, getPlayerName } from '../../domain/session'
import { sides, winner } from '../../domain/stats'
import { useSessionStore } from '../../stores/session'

const store = useSessionStore()
const filter = ref<number | null>(null)

const courts = computed(() =>
  [...new Set(store.state.history.map((m) => m.court))].sort((x, y) => x - y),
)

// Keeps the name a court had when the match was played if it no longer exists.
const courtLabel = (n: number, fallback: string) =>
  n <= store.state.courts ? getCourtName(store.state, n) : fallback || `#${n}`

const rows = computed(() =>
  store.state.history
    .filter((m) => filter.value === null || m.court === filter.value)
    .map((m) => {
      const [a, b] = sides(m.players).map((side) =>
        side.map((id) => getPlayerName(store.state, id)).join(' & '),
      )
      return {
        key: `${m.roundNumber}-${m.completedAt}`,
        round: m.roundNumber,
        court: courtLabel(m.court, m.courtName),
        a,
        b,
        score: m.score,
        winner: winner(m),
        time: new Date(m.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    })
    .reverse(),
)
</script>

<template>
  <section class="card">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="card-title">Match history</h2>
      <span v-if="store.state.history.length" class="badge">{{ store.state.history.length }} played</span>
    </div>

    <div v-if="!store.state.history.length" class="empty">No completed matches yet.</div>
    <template v-else>
      <div v-if="courts.length > 1" class="mb-3 flex flex-wrap gap-1.5">
        <button
          class="btn btn-sm"
          :class="filter === null ? 'btn-secondary' : 'btn-ghost'"
          :aria-pressed="filter === null"
          @click="filter = null"
        >
          All
        </button>
        <button
          v-for="c in courts"
          :key="c"
          class="btn btn-sm"
          :class="filter === c ? 'btn-secondary' : 'btn-ghost'"
          :aria-pressed="filter === c"
          @click="filter = c"
        >
          {{ courtLabel(c, '') }}
        </button>
      </div>

      <ul class="divide-y divide-border">
        <li v-for="m in rows" :key="m.key" class="flex items-center gap-3 py-2.5">
          <div class="w-16 shrink-0 text-xs text-muted">
            <div class="font-semibold text-fg">Round {{ m.round }}</div>
            <div class="truncate">{{ m.court }}</div>
          </div>
          <div class="grid min-w-0 flex-1 gap-0.5 text-sm">
            <div class="flex items-center justify-between gap-2" :class="{ 'font-semibold': m.winner === 'a' }">
              <span class="truncate">{{ m.a }}</span>
              <span v-if="m.score" class="tabular-nums">{{ m.score.a }}</span>
            </div>
            <div class="flex items-center justify-between gap-2" :class="{ 'font-semibold': m.winner === 'b' }">
              <span class="truncate">{{ m.b }}</span>
              <span v-if="m.score" class="tabular-nums">{{ m.score.b }}</span>
            </div>
          </div>
          <time class="shrink-0 text-xs text-muted tabular-nums">{{ m.time }}</time>
        </li>
      </ul>
    </template>
  </section>
</template>
