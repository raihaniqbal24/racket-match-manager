<script setup lang="ts">
import { onMounted, ref } from 'vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDialogElement>()

// Native <dialog> gives focus trapping, Esc to close and a backdrop for free.
onMounted(() => dialog.value?.showModal())

function onBackdropClick(e: MouseEvent) {
  if (e.target === dialog.value) emit('close')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(92vw,26rem)] rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50"
    @cancel.prevent="emit('close')"
    @click="onBackdropClick"
  >
    <div class="p-5">
      <h2 class="mb-1 text-lg font-semibold">{{ title }}</h2>
      <slot />
    </div>
  </dialog>
</template>
