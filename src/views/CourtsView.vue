<script setup lang="ts">
import { computed, ref } from 'vue'
import CourtCard from '../components/courts/CourtCard.vue'
import HistoryList from '../components/courts/HistoryList.vue'
import ScoreDialog from '../components/courts/ScoreDialog.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import { useToast } from '../composables/useToast'
import { playersPerMatch } from '../domain/scheduler'
import { WAIT_ALERT, WAIT_WARNING } from '../domain/stats'
import type { Score } from '../domain/types'
import { useSessionStore } from '../stores/session'

const emit = defineEmits<{ goToPlayers: [] }>()

const store = useSessionStore()
const { report, show } = useToast()

const scoringCourt = ref<number | null>(null)
const scoring = computed(() =>
  store.state.currentCourts.find((c) => c.court === scoringCourt.value && c.status === 'playing'),
)

const hasIdle = computed(() => store.state.currentCourts.some((c) => c.status === 'idle'))
const playingCount = computed(
  () => store.state.currentCourts.filter((c) => c.status === 'playing').length,
)
const pendingCount = computed(
  () => store.state.currentCourts.filter((c) => c.status === 'pending').length,
)
const arrived = computed(() => store.state.players.filter((p) => p.arrived).length)
const tooFew = computed(() => arrived.value < playersPerMatch(store.state))

// Everyone here but not on a court, longest wait first.
const bench = computed(() =>
  store.state.players
    .filter((p) => p.arrived && !p.currentlyPlaying && !p.reserved)
    .sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        b.waitStreak - a.waitStreak ||
        a.matchCount - b.matchCount ||
        a.name.localeCompare(b.name),
    ),
)

function benchClass(p: (typeof bench.value)[number]) {
  if (!p.available) return ''
  if (p.waitStreak >= WAIT_ALERT) return 'badge-alert'
  if (p.waitStreak >= WAIT_WARNING) return 'badge-warning'
  return 'badge-ready'
}

function complete(score: Score | null) {
  if (scoringCourt.value === null) return
  const result = store.complete(scoringCourt.value, score)
  scoringCourt.value = null
  if (result.ok) show('Match completed.', { undo: true })
}

function completeAll() {
  const count = playingCount.value
  if (store.completeAll().ok) show(`Completed ${count} ${count === 1 ? "match" : "matches"}.`, { undo: true })
}
</script>

<template>
  <div class="grid gap-4">
    <div v-if="tooFew" class="card flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted">
        {{ arrived }} of the {{ playersPerMatch(store.state) }} players needed for a match have arrived.
      </p>
      <button class="btn btn-secondary" @click="emit('goToPlayers')">Go to players</button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button class="btn btn-primary flex-1 sm:flex-none" :disabled="!hasIdle || tooFew" @click="report(store.generateAll())">
        <AppIcon name="plus" :size="16" />
        Generate matches
      </button>
      <button v-if="pendingCount > 1" class="btn btn-secondary flex-1 sm:flex-none" @click="report(store.confirmAll())">
        <AppIcon name="play" :size="15" />
        Start all
      </button>
      <button v-if="playingCount > 1" class="btn btn-ghost flex-1 sm:flex-none" @click="completeAll">
        Complete all
      </button>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <CourtCard
        v-for="c in store.state.currentCourts"
        :key="c.court"
        :court="c"
        @complete="scoringCourt = $event"
      />
    </div>

    <section v-if="bench.length" class="card">
      <div class="mb-3 flex items-center gap-2">
        <h2 class="card-title">On the bench</h2>
        <span class="badge">{{ bench.length }}</span>
      </div>
      <ul class="flex flex-wrap gap-1.5">
        <li v-for="p in bench" :key="p.id" class="badge" :class="benchClass(p)">
          {{ p.name }}
          <span v-if="!p.available" class="font-normal">· sitting out</span>
          <span v-else-if="p.waitStreak" class="font-normal">· waited {{ p.waitStreak }}</span>
        </li>
      </ul>
    </section>

    <HistoryList />

    <ScoreDialog v-if="scoring" :court="scoring" @close="scoringCourt = null" @complete="complete" />
  </div>
</template>
