import { useSyncExternalStore } from 'react'

const dark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
export const resolveTheme = (t) => (t === 'dark' || t === 'light' ? t : dark() ? 'dark' : 'light')

/** Applies a theme choice (light | dark | system) to the page. localStorage is only a cache that
 *  prevents a flash before settings load; the saved source of truth is the database. */
export function applyTheme(t) {
  document.documentElement.dataset.theme = resolveTheme(t)
  try { t === 'light' || t === 'dark' ? localStorage.setItem('sw-theme', t) : localStorage.removeItem('sw-theme') } catch {}
  window.dispatchEvent(new Event('sw-theme'))
}

const subscribe = (cb) => { window.addEventListener('sw-theme', cb); return () => window.removeEventListener('sw-theme', cb) }
export const useResolvedTheme = () => useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme || 'light')
