import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Inbox, X } from 'lucide-react'
import { api } from './api'

export function useApi(path) {
  const [s, set] = useState({ loading: true })
  const load = useCallback(() => {
    set((x) => ({ data: x.data, loading: true }))
    api(path).then((data) => set({ data, loading: false })).catch((e) => set({ loading: false, error: e.message }))
  }, [path])
  useEffect(load, [load])
  return { ...s, reload: load }
}

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [t, setT] = useState(null)
  const show = useCallback((msg, kind = 'ok') => { setT({ msg, kind, id: Date.now() }) }, [])
  useEffect(() => { if (t) { const h = setTimeout(() => setT(null), 4000); return () => clearTimeout(h) } }, [t])
  return <ToastCtx.Provider value={show}>{children}
    <div className="toast-region" role="status" aria-live="polite">
      {t && <div className={'toast ' + t.kind} key={t.id}>{t.kind === 'ok' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}{t.msg}</div>}
    </div></ToastCtx.Provider>
}

export function Modal({ title, onClose, children, narrow }) {
  const ref = useRef()
  useEffect(() => {
    const prev = document.activeElement
    ref.current?.querySelector('input,select,textarea,button')?.focus()
    const key = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); prev?.focus?.() }
  }, [onClose])
  return <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className={'modal' + (narrow ? ' narrow' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
      <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      {children}
    </div></div>
}

export function Confirm({ title, text, action, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  return <Modal title={title} onClose={onClose} narrow>
    <p className="muted">{text}</p>
    <div className="actions"><button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn danger" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false) }}>{busy ? 'Working…' : action}</button></div>
  </Modal>
}

export const Field = ({ label, error, children, id }) => <div className="field">
  <label htmlFor={id}>{label}</label>{children}
  {error && <p className="err" id={id + '-err'} role="alert">{error}</p>}</div>

export const Empty = ({ title, text, children }) => <div className="empty"><Inbox size={28} /><h3>{title}</h3><p className="muted">{text}</p>{children}</div>
export const ErrorState = ({ message, retry }) => <div className="empty err-state" role="alert"><AlertTriangle size={28} /><h3>Couldn't load this</h3><p className="muted">{message}</p>{retry && <button className="btn" onClick={retry}>Try again</button>}</div>
export const Skeleton = ({ h = 120 }) => <div className="skeleton" style={{ height: h }} aria-hidden="true" />
export const Delta = ({ v, goodWhenUp = true }) => v == null ? null :
  <span className={'delta ' + ((v >= 0) === goodWhenUp ? 'good' : 'bad')}>{v >= 0 ? '▲' : '▼'} {Math.abs(v)}% vs last month</span>
