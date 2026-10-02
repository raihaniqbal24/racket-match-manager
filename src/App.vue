<script setup lang="ts">
import { computed, ref } from 'vue'
import HelpPanel from './components/HelpPanel.vue'
import AppIcon, { type IconName } from './components/ui/AppIcon.vue'
import BaseDialog from './components/ui/BaseDialog.vue'
import ToastHost from './components/ui/ToastHost.vue'
import { useTheme } from './composables/useTheme'
import { useToast } from './composables/useToast'
import { useSessionStore } from './stores/session'
import CourtsView from './views/CourtsView.vue'
import OverviewView from './views/OverviewView.vue'
import PlayersView from './views/PlayersView.vue'

type Tab = 'players' | 'courts' | 'overview'

const store = useSessionStore()
const { dark, toggle: toggleTheme } = useTheme()
const { report, show } = useToast()

const tabs = computed<{ id: Tab; label: string; icon: IconName }[]>(() => [
  { id: 'players', label: 'Players', icon: 'users' },
  { id: 'courts', label: `${store.sport.venue}s`, icon: 'court' },
  { id: 'overview', label: 'Overview', icon: 'chart' },
])

// Land on the courts when a session is already under way.
const tab = ref<Tab>(store.hasStarted || store.hasPending ? 'courts' : 'players')

const menuOpen = ref(false)
const newSessionOpen = ref(false)
const fileInput = ref<HTMLInputElement>()

const HELP_SEEN_KEY = 'racket-match-manager:help-seen'

function helpSeen(): boolean {
  try {
    return localStorage.getItem(HELP_SEEN_KEY) === '1'
  } catch {
    return true
  }
}

// First visit: show the guide once, unless a session already exists.
const helpOpen = ref(!helpSeen() && !store.state.players.length)

function openHelp() {
  menuOpen.value = false
  helpOpen.value = true
}

function closeHelp() {
  helpOpen.value = false
  try {
    localStorage.setItem(HELP_SEEN_KEY, '1')
  } catch {
    // The guide will just show again next visit.
  }
}

const savedAt = computed(() =>
  store.lastSaved
    ? new Date(store.lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null,
)

function undo() {
  report(store.undo())
}

function exportSession() {
  menuOpen.value = false
  const blob = new Blob([store.exportJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `racket-match-manager-${new Date().toLocaleDateString('en-CA')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function pickImport() {
  menuOpen.value = false
  fileInput.value?.click()
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    if (report(store.importJson(await file.text()), { undo: true })) tab.value = 'courts'
  } catch {
    show("Couldn't read that file.")
  }
}

function newSession(keepPlayers: boolean) {
  newSessionOpen.value = false
  report(store.resetSession(keepPlayers), { undo: true })
  tab.value = 'players'
}
</script>

<template>
  <div class="min-h-dvh pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
    <header class="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
      <div class="mx-auto flex max-w-5xl items-center gap-1.5 py-2 pr-2 pl-4 sm:gap-2 sm:pr-4">
        <span class="text-2xl leading-none" aria-hidden="true">{{ store.sport.icon }}</span>
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-[15px] leading-tight font-semibold tracking-tight sm:text-base">Racket Match Manager</h1>
          <p class="truncate text-xs text-muted">
            {{ store.sport.label }} · {{ store.state.format === 'doubles' ? 'Doubles' : 'Singles' }}
          </p>
        </div>

        <nav class="mr-2 hidden gap-1 md:flex" aria-label="Sections">
          <button
            v-for="t in tabs"
            :key="t.id"
            class="btn btn-sm"
            :class="tab === t.id ? 'btn-secondary' : 'text-muted hover:bg-surface-2'"
            :aria-current="tab === t.id ? 'page' : undefined"
            @click="tab = t.id"
          >
            <AppIcon :name="t.icon" :size="16" />
            {{ t.label }}
          </button>
        </nav>

        <button class="btn-icon" :disabled="!store.canUndo" aria-label="Undo" title="Undo" @click="undo">
          <AppIcon name="undo" />
        </button>
        <button
          class="btn-icon"
          :aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'"
          :title="dark ? 'Light theme' : 'Dark theme'"
          @click="toggleTheme"
        >
          <AppIcon :name="dark ? 'sun' : 'moon'" />
        </button>
        <button class="btn-icon max-sm:hidden" aria-label="How it works" title="How it works" @click="openHelp">
          <AppIcon name="help" />
        </button>
        <div class="relative">
          <button
            class="btn-icon"
            aria-label="Session menu"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen"
          >
            <AppIcon name="more" />
          </button>
          <template v-if="menuOpen">
            <div class="fixed inset-0 z-40" @click="menuOpen = false" />
            <div
              class="absolute right-0 z-50 mt-1 w-56 rounded-xl border border-border bg-surface p-1 shadow-xl"
              role="menu"
              @keydown.esc="menuOpen = false"
            >
              <button class="menu-item" role="menuitem" @click="openHelp">
                <AppIcon name="help" :size="16" />
                How it works
              </button>
              <button class="menu-item" role="menuitem" @click="exportSession">
                <AppIcon name="download" :size="16" />
                Export session
              </button>
              <button class="menu-item" role="menuitem" @click="pickImport">
                <AppIcon name="upload" :size="16" />
                Import session
              </button>
              <button class="menu-item text-danger" role="menuitem" @click="((menuOpen = false), (newSessionOpen = true))">
                <AppIcon name="refresh" :size="16" />
                New session…
              </button>
            </div>
          </template>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 pt-4">
      <PlayersView v-if="tab === 'players'" />
      <CourtsView v-else-if="tab === 'courts'" @go-to-players="tab = 'players'" />
      <OverviewView v-else />

      <footer class="mt-6 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span>Your session is saved in this browser only.</span>
        <span>{{ savedAt ? `Saved ${savedAt}` : 'Not saved yet' }}</span>
      </footer>
    </main>

    <nav
      class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Sections"
    >
      <button
        v-for="t in tabs"
        :key="t.id"
        class="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold"
        :class="tab === t.id ? 'text-primary' : 'text-muted'"
        :aria-current="tab === t.id ? 'page' : undefined"
        @click="tab = t.id"
      >
        <AppIcon :name="t.icon" :size="22" />
        {{ t.label }}
      </button>
    </nav>

    <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onImport" />

    <BaseDialog v-if="newSessionOpen" title="Start a new session?" @close="newSessionOpen = false">
      <p class="mb-4 text-sm text-muted">
        This clears all matches, history and scores. You can undo it straight afterwards.
      </p>
      <div class="grid gap-2">
        <button class="btn btn-primary" :disabled="!store.state.players.length" @click="newSession(true)">
          Keep the player list
        </button>
        <button class="btn btn-danger" @click="newSession(false)">Clear everything</button>
        <button class="btn btn-sm text-muted" @click="newSessionOpen = false">Cancel</button>
      </div>
    </BaseDialog>

    <HelpPanel v-if="helpOpen" @close="closeHelp" />

    <ToastHost />
  </div>
</template>

<style scoped>
@reference './style.css';

.menu-item {
  @apply flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium hover:bg-surface-2;
}
</style>
