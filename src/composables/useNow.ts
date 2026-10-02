import { onScopeDispose, ref } from 'vue'

const now = ref(Date.now())
let users = 0
let timer: ReturnType<typeof setInterval> | undefined

// One shared 1-second tick for every match timer on screen.
export function useNow() {
  if (users++ === 0) {
    now.value = Date.now()
    timer = setInterval(() => (now.value = Date.now()), 1000)
  }
  onScopeDispose(() => {
    if (--users === 0) clearInterval(timer)
  })
  return now
}
