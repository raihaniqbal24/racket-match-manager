import { ref } from 'vue'
import type { ActionResult } from '../domain/types'

export interface Toast {
  id: number
  message: string
  /** Offer an Undo button alongside the message. */
  undo: boolean
}

const current = ref<Toast | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let nextId = 1

function show(message: string, options: { undo?: boolean } = {}) {
  current.value = { id: nextId++, message, undo: !!options.undo }
  clearTimeout(timer)
  timer = setTimeout(dismiss, options.undo ? 6000 : 2800)
}

function dismiss() {
  clearTimeout(timer)
  current.value = null
}

// Shows a store action's message, if it has one. Returns whether it succeeded.
function report(result: ActionResult, options: { undo?: boolean } = {}): boolean {
  if (result.message) show(result.message, { undo: result.ok && options.undo })
  return result.ok
}

export function useToast() {
  return { toast: current, show, dismiss, report }
}
