<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useToast } from '../../composables/useToast'
import { useSessionStore } from '../../stores/session'

const store = useSessionStore()
const { report } = useToast()
const text = ref('')
const field = ref<HTMLTextAreaElement>()

function resize() {
  const el = field.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight + 2, 160)}px`
}

function add() {
  const result = store.addPlayers(text.value)
  report(result)
  if (result.added) text.value = ''
  nextTick(() => {
    resize()
    field.value?.focus()
  })
}
</script>

<template>
  <form class="flex items-start gap-2" @submit.prevent="add">
    <textarea
      ref="field"
      v-model="text"
      rows="1"
      class="input resize-none py-2.5 leading-5"
      placeholder="Add a player, or paste a list"
      aria-label="Player names"
      autocomplete="off"
      @input="resize"
      @keydown.enter.exact.prevent="add"
    />
    <button class="btn btn-primary" :disabled="!text.trim()">Add</button>
  </form>
  <p class="mt-1.5 text-xs text-muted">Separate several names with commas or new lines.</p>
</template>
