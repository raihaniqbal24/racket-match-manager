<script setup lang="ts">
import { useToast } from '../../composables/useToast'
import { useSessionStore } from '../../stores/session'

const { toast, show, dismiss } = useToast()
const store = useSessionStore()

function undo() {
  dismiss()
  const result = store.undo()
  if (result.message) show(result.message)
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6"
    role="status"
    aria-live="polite"
  >
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="translate-y-3 opacity-0"
      leave-active-class="transition duration-150"
      leave-to-class="translate-y-3 opacity-0"
    >
      <div
        v-if="toast"
        :key="toast.id"
        class="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-fg py-2.5 pr-3 pl-4 text-sm font-medium text-bg shadow-lg"
      >
        <span>{{ toast.message }}</span>
        <button
          v-if="toast.undo && store.canUndo"
          class="rounded-lg px-2 py-1 font-bold underline underline-offset-2"
          @click="undo"
        >
          Undo
        </button>
      </div>
    </Transition>
  </div>
</template>
