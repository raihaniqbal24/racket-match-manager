// Light by default; apply a saved dark choice before first paint to avoid a flash.
// Kept as a separate file (not inline in index.html) so the Content-Security-Policy
// can stay at script-src 'self' without hashes or 'unsafe-inline'.
try {
  if (localStorage.getItem('racket-match-manager:theme') === 'dark')
    document.documentElement.classList.add('dark')
} catch (e) {}
