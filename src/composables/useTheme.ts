import { ref } from 'vue'

const KEY = 'racket-match-manager:theme'

// index.html applies a saved dark choice before first paint; read it back.
const dark = ref(document.documentElement.classList.contains('dark'))

function toggle() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
  try {
    localStorage.setItem(KEY, dark.value ? 'dark' : 'light')
  } catch {
    // Preference just won't persist.
  }
}

export function useTheme() {
  return { dark, toggle }
}
