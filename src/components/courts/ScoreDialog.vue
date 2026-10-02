<script setup lang="ts">
import { computed, ref } from 'vue'
import { getCourtName, getPlayerName } from '../../domain/session'
import { sides } from '../../domain/stats'
import type { Court, Score } from '../../domain/types'
import { useSessionStore } from '../../stores/session'
import BaseDialog from '../ui/BaseDialog.vue'

const props = defineProps<{ court: Court }>()
const emit = defineEmits<{ close: []; complete: [score: Score | null] }>()

const store = useSessionStore()
const a = ref<number | ''>('')
const b = ref<number | ''>('')

const names = computed(() =>
  sides(props.court.players).map((side) =>
    side.map((id) => getPlayerName(store.state, id)).join(' & '),
  ),
)

const isCount = (v: number | '') => v !== '' && Number.isInteger(v) && v >= 0
const valid = computed(() => isCount(a.value) && isCount(b.value))

function save() {
  if (valid.value) emit('complete', { a: Number(a.value), b: Number(b.value) })
}
</script>

<template>
  <BaseDialog :title="`Complete ${getCourtName(store.state, court.court)}`" @close="emit('close')">
    <p class="mb-4 text-sm text-muted">
      Enter the {{ store.sport.scoreUnit }} each side won to feed the leaderboard, or skip it.
    </p>
    <form class="grid gap-3" @submit.prevent="save">
      <label v-for="(side, i) in names" :key="i" class="flex items-center gap-3">
        <span class="min-w-0 flex-1 text-sm font-semibold">{{ side }}</span>
        <input
          v-if="i === 0"
          v-model.number="a"
          class="input w-20 text-center text-lg font-semibold"
          type="number"
          inputmode="numeric"
          min="0"
          placeholder="–"
        />
        <input
          v-else
          v-model.number="b"
          class="input w-20 text-center text-lg font-semibold"
          type="number"
          inputmode="numeric"
          min="0"
          placeholder="–"
        />
      </label>
      <div class="mt-2 grid gap-2">
        <button class="btn btn-primary" :disabled="!valid">Save score &amp; complete</button>
        <button type="button" class="btn btn-ghost" @click="emit('complete', null)">
          Complete without a score
        </button>
        <button type="button" class="btn btn-sm text-muted" @click="emit('close')">Cancel</button>
      </div>
    </form>
  </BaseDialog>
</template>
