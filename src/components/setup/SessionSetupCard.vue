<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from '../../composables/useToast'
import { MAX_COURTS } from '../../domain/session'
import { SPORTS } from '../../domain/sports'
import type { Format, SportId } from '../../domain/types'
import { useSessionStore } from '../../stores/session'
import AppIcon from '../ui/AppIcon.vue'
import BaseSelect, { type SelectOption } from '../ui/BaseSelect.vue'

const store = useSessionStore()
const { report } = useToast()
const showNames = ref(false)
const venue = computed(() => store.sport.venue.toLowerCase())

const sportOptions: SelectOption[] = SPORTS.map((s) => ({ value: s.id, label: `${s.icon} ${s.label}` }))
const formatOptions: SelectOption[] = [
  { value: 'doubles', label: 'Doubles (4)' },
  { value: 'singles', label: 'Singles (2)' },
]

function setCourts(n: number) {
  report(store.setCourts(n))
}

function onCourtsInput(e: Event) {
  const el = e.target as HTMLInputElement
  setCourts(Number(el.value))
  el.value = String(store.state.courts)
}

function onCourtName(i: number, e: Event) {
  const el = e.target as HTMLInputElement
  store.setCourtName(i, el.value)
  el.value = store.state.courtNames[i] ?? ''
}
</script>

<template>
  <section class="card">
    <h2 class="card-title mb-4">Session setup</h2>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div>
        <span class="field-label">Sport</span>
        <BaseSelect
          label="Sport"
          :model-value="store.state.sport"
          :options="sportOptions"
          :disabled="store.hasStarted"
          @change="report(store.setSport($event as SportId))"
        />
      </div>

      <div>
        <span class="field-label">Format</span>
        <BaseSelect
          label="Format"
          :model-value="store.state.format"
          :options="formatOptions"
          :disabled="store.hasStarted"
          @change="report(store.setFormat($event as Format))"
        />
      </div>

      <div class="col-span-2 sm:col-span-1">
        <label class="field-label" for="courtCount">{{ store.sport.venue }}s</label>
        <div class="flex gap-1.5">
          <button
            class="btn btn-ghost w-11 shrink-0 px-0 text-lg"
            :disabled="store.state.courts <= 1"
            :aria-label="`Remove a ${venue}`"
            @click="setCourts(store.state.courts - 1)"
          >
            −
          </button>
          <input
            id="courtCount"
            class="input text-center"
            type="number"
            inputmode="numeric"
            min="1"
            :max="MAX_COURTS"
            :value="store.state.courts"
            @change="onCourtsInput"
          />
          <button
            class="btn btn-ghost w-11 shrink-0 px-0"
            :disabled="store.state.courts >= MAX_COURTS"
            :aria-label="`Add a ${venue}`"
            @click="setCourts(store.state.courts + 1)"
          >
            <AppIcon name="plus" :size="16" />
          </button>
        </div>
      </div>
    </div>

    <p v-if="store.hasStarted" class="mt-3 text-xs text-muted">
      Sport and format are locked once matches have started.
    </p>

    <button
      class="mt-3 -ml-1 inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-primary"
      :aria-expanded="showNames"
      @click="showNames = !showNames"
    >
      <AppIcon name="chevron" :size="16" class="transition-transform" :class="{ 'rotate-180': showNames }" />
      {{ store.sport.venue }} names
    </button>

    <div v-if="showNames" class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <input
        v-for="(name, i) in store.state.courtNames"
        :key="i"
        class="input"
        maxlength="40"
        :value="name"
        :aria-label="`Name for ${venue} ${i + 1}`"
        @change="onCourtName(i, $event)"
      />
    </div>
  </section>
</template>
