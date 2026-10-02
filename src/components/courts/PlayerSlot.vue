<script setup lang="ts">
import { computed } from 'vue'
import { useToast } from '../../composables/useToast'
import { getSwapCandidates } from '../../domain/scheduler'
import { getPlayerName } from '../../domain/session'
import type { Court } from '../../domain/types'
import { useSessionStore } from '../../stores/session'

const props = defineProps<{ court: Court; index: number }>()

const store = useSessionStore()
const { report } = useToast()

const id = computed(() => props.court.players[props.index] ?? '')
const name = computed(() => getPlayerName(store.state, id.value))
const partnerId = computed(() => store.state.players.find((p) => p.id === id.value)?.partnerId)

// An intact fixed pair can only leave the court together.
const lockedPair = computed(
  () =>
    store.state.format === 'doubles' &&
    !!partnerId.value &&
    props.court.players.includes(partnerId.value),
)
const candidates = computed(() => getSwapCandidates(store.state))

function onChange(e: Event) {
  const el = e.target as HTMLSelectElement
  const value = el.value
  // Controlled: snap back, then let the store re-render the new occupant.
  el.value = lockedPair.value ? '' : id.value
  if (lockedPair.value) {
    if (value === 'replace') report(store.replacePair(props.court.court, props.index))
  } else report(store.swap(props.court.court, props.index, value))
}
</script>

<template>
  <span v-if="court.status !== 'pending'" class="block truncate py-1 font-semibold">{{ name }}</span>
  <select
    v-else
    class="input min-h-10 truncate bg-surface-2 font-semibold"
    :aria-label="`Change ${name}`"
    :value="lockedPair ? '' : id"
    @change="onChange"
  >
    <template v-if="lockedPair">
      <option value="">🔗 {{ name }}</option>
      <option value="replace">Replace pair (random)</option>
    </template>
    <template v-else>
      <option :value="id">{{ name }}</option>
      <option v-for="p in candidates" :key="p.id" :value="p.id">{{ p.name }}</option>
    </template>
  </select>
</template>
