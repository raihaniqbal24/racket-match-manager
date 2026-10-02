<script setup lang="ts">
import { computed } from 'vue'
import { useToast } from '../../composables/useToast'
import { getSwapCandidates } from '../../domain/scheduler'
import { getPlayerName } from '../../domain/session'
import type { Court } from '../../domain/types'
import { useSessionStore } from '../../stores/session'
import BaseSelect, { type SelectOption } from '../ui/BaseSelect.vue'

const props = defineProps<{ court: Court; index: number }>()

const store = useSessionStore()
const { report } = useToast()

const REPLACE_PAIR = 'replace'

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

const options = computed<SelectOption[]>(() =>
  lockedPair.value
    ? [
        { value: id.value, label: `🔗 ${name.value}` },
        { value: REPLACE_PAIR, label: 'Replace pair (random)' },
      ]
    : [
        { value: id.value, label: name.value },
        ...getSwapCandidates(store.state).map((p) => ({ value: p.id, label: p.name })),
      ],
)

function onChange(value: string) {
  if (lockedPair.value) report(store.replacePair(props.court.court, props.index))
  else report(store.swap(props.court.court, props.index, value))
}
</script>

<template>
  <span v-if="court.status !== 'pending'" class="block truncate py-1 font-semibold">{{ name }}</span>
  <BaseSelect
    v-else
    class="min-h-10 bg-surface-2 font-semibold"
    :label="`Change ${name}`"
    :model-value="id"
    :options="options"
    @change="onChange"
  />
</template>
