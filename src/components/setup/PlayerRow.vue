<script setup lang="ts">
import { computed } from 'vue'
import { useToast } from '../../composables/useToast'
import { hasPlayed } from '../../domain/stats'
import type { Player } from '../../domain/types'
import { useSessionStore } from '../../stores/session'
import AppIcon from '../ui/AppIcon.vue'
import BaseSelect, { type SelectOption } from '../ui/BaseSelect.vue'
import StatusBadge from '../ui/StatusBadge.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'

const props = defineProps<{ player: Player; open: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const store = useSessionStore()
const { report } = useToast()

const isDoubles = computed(() => store.state.format === 'doubles')
const partner = computed(() => store.state.players.find((p) => p.id === props.player.partnerId))
const partnerOptions = computed<SelectOption[]>(() => [
  { value: '', label: 'None' },
  ...store.state.players
    .filter((p) => p.id !== props.player.id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: p.name })),
])
const played = computed(() => hasPlayed(store.state, props.player.id))
</script>

<template>
  <li class="rounded-xl border border-border">
    <div class="flex items-center gap-2 py-1 pr-2 pl-1">
      <button
        class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg pl-2 text-left"
        :aria-expanded="open"
        :aria-label="`${player.name}, options`"
        @click="emit('toggle')"
      >
        <AppIcon
          name="chevron"
          :size="16"
          class="text-muted transition-transform"
          :class="{ 'rotate-180': open }"
        />
        <span class="min-w-0" :class="{ 'text-muted': !player.arrived }">
          <span class="block truncate font-semibold">{{ player.name }}</span>
          <span v-if="isDoubles && partner" class="flex items-center gap-1 text-xs text-muted">
            <AppIcon name="link" :size="12" />
            <span class="truncate">{{ partner.name }}</span>
          </span>
        </span>
      </button>

      <StatusBadge :player="player" class="max-sm:hidden" />
      <span
        class="w-11 text-center text-sm font-semibold tabular-nums"
        :class="{ 'text-muted': !player.matchCount }"
      >
        {{ player.matchCount }}
      </span>
      <ToggleSwitch
        :model-value="player.arrived"
        :label="`${player.name} arrived`"
        hide-label
        @change="report(store.setArrived(player.id, $event))"
      />
    </div>

    <div v-if="open" class="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-3 py-2.5">
      <StatusBadge :player="player" class="sm:hidden" />
      <ToggleSwitch
        :model-value="!player.available"
        label="Sitting out"
        @change="report(store.setSittingOut(player.id, $event))"
      />
      <div v-if="isDoubles" class="flex min-w-48 flex-1 items-center gap-2 text-sm text-muted">
        <span class="whitespace-nowrap">Fixed partner</span>
        <BaseSelect
          class="min-h-9"
          label="Fixed partner"
          :model-value="player.partnerId ?? ''"
          :options="partnerOptions"
          @change="report(store.setPartner(player.id, $event || null))"
        />
      </div>
      <button class="btn btn-sm btn-danger ml-auto" @click="report(store.removePlayer(player.id), { undo: true })">
        {{ played ? 'Gone home' : 'Remove' }}
      </button>
    </div>
  </li>
</template>
