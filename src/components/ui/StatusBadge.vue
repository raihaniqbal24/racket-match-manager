<script setup lang="ts">
import { computed } from 'vue'
import { playerStatus } from '../../domain/stats'
import type { Player } from '../../domain/types'
import { useSessionStore } from '../../stores/session'

const props = defineProps<{ player: Player }>()
const store = useSessionStore()
const status = computed(() => playerStatus(store.state, props.player))
</script>

<template>
  <span class="badge" :class="`badge-${status.kind}`">{{ status.label }}</span>
</template>
