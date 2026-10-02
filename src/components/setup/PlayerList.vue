<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from '../../composables/useToast'
import { useSessionStore } from '../../stores/session'
import AddPlayers from './AddPlayers.vue'
import PlayerRow from './PlayerRow.vue'

const store = useSessionStore()
const { report } = useToast()
const openId = ref<string | null>(null)

// Alphabetical so names stay put while arrivals are being ticked off.
const players = computed(() =>
  [...store.state.players].sort((a, b) => a.name.localeCompare(b.name)),
)
const arrived = computed(() => store.state.players.filter((p) => p.arrived).length)
</script>

<template>
  <section class="card">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <h2 class="card-title">Players</h2>
        <span v-if="players.length" class="badge">{{ arrived }} of {{ players.length }} here</span>
      </div>
      <div v-if="players.length" class="flex gap-2">
        <button
          class="btn btn-sm btn-secondary"
          :disabled="arrived === players.length"
          @click="report(store.arriveAll())"
        >
          All arrived
        </button>
        <button class="btn btn-sm btn-ghost" :disabled="!arrived" @click="report(store.clearArrivals())">
          Clear arrivals
        </button>
      </div>
    </div>

    <AddPlayers />

    <div v-if="!players.length" class="empty mt-4">
      No players yet. Add everyone who might play, then switch them on as they arrive.
    </div>
    <template v-else>
      <div
        class="mt-4 mb-1 flex items-center gap-2 pr-2 text-[11px] font-semibold tracking-wide text-muted uppercase"
      >
        <span class="flex-1 pl-9">Name</span>
        <span class="w-11 text-center">Played</span>
        <span class="w-11 text-center">Here</span>
      </div>
      <ul class="grid gap-1.5">
        <PlayerRow
          v-for="p in players"
          :key="p.id"
          :player="p"
          :open="openId === p.id"
          @toggle="openId = openId === p.id ? null : p.id"
        />
      </ul>
    </template>
  </section>
</template>
