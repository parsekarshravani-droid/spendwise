import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api, setFormat } from './api'
import { applyTheme } from './theme'
import { ErrorState, Skeleton } from './ui'

const Ctx = createContext(null)
export const useSettings = () => useContext(Ctx)

const apply = (s) => { setFormat({ currency: s.currency, dateFormat: s.date_format }); applyTheme(s.theme) }

export function SettingsProvider({ children }) {
  const [st, setSt] = useState({ loading: true, settings: null, error: null })
  const ref = useRef(null); ref.current = st.settings
  const load = useCallback(async () => {
    setSt((x) => ({ ...x, loading: true, error: null }))
    try { const s = await api('/settings'); apply(s); setSt({ loading: false, settings: s, error: null }) }
    catch (e) { setSt((x) => ({ ...x, loading: false, error: e.message })) }
  }, [])
  useEffect(() => { load() }, [load])
  // Sends the version we last saw; the API rejects the save (409) if another device saved in between.
  const save = useCallback(async (patch) => {
    const s = await api('/settings', { method: 'PUT', body: { ...patch, version: ref.current?.version } })
    apply(s); setSt({ loading: false, settings: s, error: null }); return s
  }, [])
  // Follow OS changes while the theme is "system".
  useEffect(() => {
    if (st.settings?.theme !== 'system' || typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)'), h = () => applyTheme('system')
    mq.addEventListener('change', h); return () => mq.removeEventListener('change', h)
  }, [st.settings?.theme])

  if (st.loading && !st.settings) return <div style={{ padding: 32 }}><Skeleton h={300} /></div>
  if (!st.settings) return <div style={{ padding: 32 }}><ErrorState message={st.error} retry={load} /></div>
  return <Ctx.Provider value={{ settings: st.settings, save, reload: load }}>{children}</Ctx.Provider>
}
