<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSessionStore } from '../stores/session'
import AppIcon, { type IconName } from './ui/AppIcon.vue'

const emit = defineEmits<{ close: [] }>()

const store = useSessionStore()
const dialog = ref<HTMLDialogElement>()

onMounted(() => dialog.value?.showModal())

function onBackdropClick(e: MouseEvent) {
  if (e.target === dialog.value) emit('close')
}

const venue = computed(() => store.sport.venue.toLowerCase())
const Venues = computed(() => `${store.sport.venue}s`)

const steps = computed<{ icon: IconName; title: string; body: string }[]>(() => [
  {
    icon: 'users',
    title: 'Set up and add players',
    body: `On Players, pick the sport, singles or doubles, and how many ${venue.value}s you have. Then add everyone who might play. You can paste a whole list separated by commas or new lines.`,
  },
  {
    icon: 'check',
    title: 'Switch players on as they arrive',
    body: 'Only players marked as here are put into matches. Tap a name for more: sit them out for a while, give them a fixed partner, or remove them.',
  },
  {
    icon: 'court',
    title: 'Generate matches',
    body: `On ${Venues.value}, press Generate matches. Each empty ${venue.value} gets a suggested line-up, chosen so everyone ends up with the same number of matches and nobody waits too long.`,
  },
  {
    icon: 'shuffle',
    title: 'Review, then start',
    body: 'A suggested match counts for nothing until you start it. Before that you can re-roll for a different line-up, tap a name to swap in someone from the bench, or swap the pairing in doubles.',
  },
  {
    icon: 'play',
    title: 'Complete and refill',
    body: `When a match ends, press Complete match and enter the score, or skip it. That ${venue.value} is free again, so generate its next match straight away. No need to wait for the other ${venue.value}s.`,
  },
  {
    icon: 'chart',
    title: 'Keep an eye on fairness',
    body: 'Overview shows how many matches each player has had, and a leaderboard built from the scores you entered.',
  },
])

const notes = computed(() => [
  {
    title: 'What the coloured labels mean',
    body: `Green is ready to play, blue is on ${venue.value}, purple is in a match waiting to start. Amber means a player has waited through 2 match starts and orange means 4 or more. They are picked first next time.`,
  },
  {
    title: 'Fixed partners',
    body: 'Two players linked as fixed partners are always put on the same team, and both rest if one is away. They are only split when that is the only way to keep match counts even. Doubles only.',
  },
  {
    title: 'Made a mistake?',
    body: 'The undo arrow at the top steps back through your last 20 actions, including completing a match or starting a new session.',
  },
  {
    title: 'Where your data lives',
    body: 'Everything is saved in this browser on this device, and nowhere else. Use Export session in the menu to back it up or move it to another device, and Import session to load it.',
  },
  {
    title: 'Next week',
    body: 'Choose New session in the menu and keep the player list. Matches and scores are cleared; names and fixed partners stay.',
  },
])
</script>

<template>
  <dialog
    ref="dialog"
    class="help-panel my-0 mr-0 ml-auto h-dvh max-h-none w-full max-w-md border-l border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50"
    aria-labelledby="help-title"
    @cancel.prevent="emit('close')"
    @click="onBackdropClick"
  >
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between gap-2 border-b border-border py-2 pr-2 pl-5">
        <h2 id="help-title" class="text-lg font-semibold">How it works</h2>
        <button class="btn-icon" aria-label="Close" @click="emit('close')">
          <AppIcon name="x" />
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <p class="mb-5 text-sm text-muted">
          Racket Match Manager runs a social session for you: it decides who plays next on each
          {{ venue }} so that everyone gets a fair share of matches.
        </p>

        <ol class="grid gap-4">
          <li v-for="(s, i) in steps" :key="s.title" class="flex gap-3">
            <span
              class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg"
            >
              <AppIcon :name="s.icon" :size="18" />
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-semibold">{{ i + 1 }}. {{ s.title }}</h3>
              <p class="mt-0.5 text-sm leading-relaxed text-muted">{{ s.body }}</p>
            </div>
          </li>
        </ol>

        <h3 class="mt-7 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Good to know</h3>
        <dl class="divide-y divide-border">
          <div v-for="n in notes" :key="n.title" class="py-3">
            <dt class="text-sm font-semibold">{{ n.title }}</dt>
            <dd class="mt-0.5 text-sm leading-relaxed text-muted">{{ n.body }}</dd>
          </div>
        </dl>
      </div>

      <footer class="border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button class="btn btn-primary w-full" @click="emit('close')">Got it</button>
        <p class="mt-2 text-center text-xs text-muted">Open this again any time from the menu at the top right.</p>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.help-panel[open] {
  animation: slide-in 0.2s ease-out;
}

@keyframes slide-in {
  from {
    transform: translateX(2rem);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .help-panel[open] {
    animation: none;
  }
}
</style>
