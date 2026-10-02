<script setup lang="ts">
import { computed } from 'vue'
import { useNow } from '../../composables/useNow'
import { useToast } from '../../composables/useToast'
import { hasSwappableArrangement } from '../../domain/scheduler'
import { getCourtName } from '../../domain/session'
import { formatElapsed } from '../../domain/stats'
import type { Court } from '../../domain/types'
import { useSessionStore } from '../../stores/session'
import AppIcon from '../ui/AppIcon.vue'
import PlayerSlot from './PlayerSlot.vue'

const props = defineProps<{ court: Court }>()
const emit = defineEmits<{ complete: [court: number] }>()

const store = useSessionStore()
const { report } = useToast()
const now = useNow()

const n = computed(() => props.court.court)
const name = computed(() => getCourtName(store.state, n.value))
const isDoubles = computed(() => store.state.format === 'doubles')
const sideA = computed(() => (isDoubles.value ? [0, 1] : [0]))
const sideB = computed(() => (isDoubles.value ? [2, 3] : [1]))
const canRearrange = computed(() => hasSwappableArrangement(store.state, props.court))
const elapsed = computed(() => formatElapsed(props.court.startedAt, now.value))

const accent = computed(
  () =>
    ({
      idle: 'bg-border',
      pending: 'bg-[var(--pend-fg)]',
      playing: 'bg-[var(--info-fg)]',
    })[props.court.status],
)
</script>

<template>
  <article class="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
    <div class="h-1" :class="accent" />
    <header class="flex items-center justify-between gap-2 px-4 pt-3">
      <h3 class="truncate font-semibold">{{ name }}</h3>
      <span v-if="court.status === 'playing'" class="badge badge-playing tabular-nums">
        Round {{ court.roundNumber }}
        <span class="opacity-60">·</span>
        <AppIcon name="clock" :size="12" />
        {{ elapsed }}
      </span>
      <span v-else-if="court.status === 'pending'" class="badge badge-pending">Reviewing</span>
      <span v-else class="badge">Idle</span>
    </header>

    <div v-if="court.status === 'idle'" class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-6">
      <p class="text-sm text-muted">No match on this {{ store.sport.venue.toLowerCase() }}</p>
      <button class="btn btn-secondary" @click="report(store.generate(n))">
        <AppIcon name="plus" :size="16" />
        Generate match
      </button>
    </div>

    <template v-else>
      <div class="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
        <div class="grid min-w-0 gap-1.5">
          <PlayerSlot v-for="i in sideA" :key="i" :court="court" :index="i" />
        </div>
        <span class="text-xs font-bold text-muted">VS</span>
        <div class="grid min-w-0 gap-1.5" :class="{ 'text-right': court.status === 'playing' }">
          <PlayerSlot v-for="i in sideB" :key="i" :court="court" :index="i" />
        </div>
      </div>

      <footer v-if="court.status === 'pending'" class="grid gap-2 border-t border-border p-3">
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-sm btn-ghost flex-1" @click="report(store.reroll(n))">
            <AppIcon name="shuffle" :size="15" />
            Re-roll
          </button>
          <button v-if="canRearrange" class="btn btn-sm btn-ghost flex-1" @click="report(store.rearrange(n))">
            <AppIcon name="swap" :size="15" />
            Swap pairing
          </button>
          <button class="btn btn-sm btn-ghost flex-1" @click="report(store.cancel(n))">Cancel</button>
        </div>
        <button class="btn btn-primary" @click="report(store.confirm(n))">
          <AppIcon name="play" :size="15" />
          Start match
        </button>
      </footer>
      <footer v-else class="border-t border-border p-3">
        <button class="btn btn-secondary w-full" @click="emit('complete', n)">
          <AppIcon name="check" :size="16" />
          Complete match
        </button>
      </footer>
    </template>
  </article>
</template>
