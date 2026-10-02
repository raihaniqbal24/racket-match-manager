<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue'
import AppIcon from './AppIcon.vue'

export interface SelectOption {
  value: string
  label: string
}

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  modelValue: string
  options: SelectOption[]
  /** Accessible name; the current choice is appended for screen readers. */
  label: string
  disabled?: boolean
}>()
// Controlled, like ToggleSwitch: the parent decides whether a choice sticks.
const emit = defineEmits<{ change: [value: string] }>()

const id = useId()
const button = ref<HTMLButtonElement>()
const list = ref<HTMLUListElement>()
const open = ref(false)
const active = ref(0)
const position = ref<Record<string, string>>({})

const selected = computed(() => props.options.find((o) => o.value === props.modelValue))

// The list is teleported to <body> so cards with clipped overflow cannot cut
// it off; it is placed under the button, or above when there is no room.
function place() {
  const rect = button.value!.getBoundingClientRect()
  const gap = 4
  const edge = 8
  const width = Math.min(Math.max(rect.width, 176), window.innerWidth - edge * 2)
  const below = window.innerHeight - rect.bottom - gap - edge
  const above = rect.top - gap - edge
  const wanted = Math.min(props.options.length * 40 + 8, 264)
  const up = below < wanted && above > below
  position.value = {
    left: `${Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge))}px`,
    width: `${width}px`,
    maxHeight: `${Math.min(264, up ? above : below)}px`,
    ...(up
      ? { bottom: `${window.innerHeight - rect.top + gap}px` }
      : { top: `${rect.bottom + gap}px` }),
  }
}

function scrollActiveIntoView() {
  nextTick(() => list.value?.children[active.value]?.scrollIntoView({ block: 'nearest' }))
}

function show() {
  if (props.disabled || open.value) return
  active.value = Math.max(0, props.options.findIndex((o) => o.value === props.modelValue))
  place()
  open.value = true
  scrollActiveIntoView()
  document.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', hide)
}

function hide() {
  if (!open.value) return
  open.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', hide)
}

function onOutside(e: Event) {
  const target = e.target as Node
  if (!button.value?.contains(target) && !list.value?.contains(target)) hide()
}

function onScroll(e: Event) {
  if (!list.value?.contains(e.target as Node)) hide()
}

function choose(index: number) {
  const option = props.options[index]
  hide()
  if (option && option.value !== props.modelValue) emit('change', option.value)
}

function move(to: number) {
  active.value = Math.max(0, Math.min(props.options.length - 1, to))
  scrollActiveIntoView()
}

let typed = ''
let typedTimer: ReturnType<typeof setTimeout> | undefined

function typeahead(char: string) {
  clearTimeout(typedTimer)
  typed += char.toLowerCase()
  typedTimer = setTimeout(() => (typed = ''), 600)
  const match = props.options.findIndex((o) => o.label.toLowerCase().startsWith(typed))
  if (match >= 0) move(match)
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      show()
    }
    return
  }
  const actions: Record<string, () => void> = {
    ArrowDown: () => move(active.value + 1),
    ArrowUp: () => move(active.value - 1),
    Home: () => move(0),
    End: () => move(props.options.length - 1),
    Enter: () => choose(active.value),
    ' ': () => choose(active.value),
    Escape: hide,
    Tab: hide,
  }
  const action = actions[e.key]
  if (action) {
    if (e.key !== 'Tab') e.preventDefault()
    action()
  } else if (e.key.length === 1) typeahead(e.key)
}

onBeforeUnmount(hide)
</script>

<template>
  <button
    ref="button"
    type="button"
    role="combobox"
    class="input flex items-center justify-between gap-1.5 text-left"
    v-bind="$attrs"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="`${id}-list`"
    :aria-activedescendant="open ? `${id}-${active}` : undefined"
    :aria-label="`${label}: ${selected?.label ?? ''}`"
    :disabled="disabled"
    @click="open ? hide() : show()"
    @keydown="onKeydown"
  >
    <span class="truncate">{{ selected?.label }}</span>
    <AppIcon
      name="chevron"
      :size="16"
      class="text-muted transition-transform"
      :class="{ 'rotate-180': open }"
    />
  </button>

  <Teleport to="body">
    <ul
      v-if="open"
      :id="`${id}-list`"
      ref="list"
      role="listbox"
      :aria-label="label"
      class="fixed z-50 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-1 shadow-xl"
      :style="position"
    >
      <li
        v-for="(o, i) in options"
        :id="`${id}-${i}`"
        :key="o.value"
        role="option"
        :aria-selected="o.value === modelValue"
        class="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm"
        :class="[
          i === active ? 'bg-surface-2' : '',
          o.value === modelValue ? 'font-semibold text-primary-soft-fg' : '',
        ]"
        @pointermove="active = i"
        @click="choose(i)"
      >
        <span class="min-w-0 flex-1 truncate">{{ o.label }}</span>
        <AppIcon v-if="o.value === modelValue" name="check" :size="16" />
      </li>
    </ul>
  </Teleport>
</template>
