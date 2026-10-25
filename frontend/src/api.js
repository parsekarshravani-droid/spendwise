const RAW = import.meta.env.VITE_API_BASE_URL
export const API_CONFIGURED = Boolean(RAW)
const BASE = (RAW || '').replace(/\/$/, '') + '/api'
export const CURRENCIES = {
  INR: { locale: 'en-IN', label: 'Indian rupee (INR)' }, USD: { locale: 'en-US', label: 'US dollar (USD)' },
  EUR: { locale: 'en-IE', label: 'Euro (EUR)' }, GBP: { locale: 'en-GB', label: 'British pound (GBP)' }, AED: { locale: 'en-AE', label: 'UAE dirham (AED)' },
}
export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']
// Display preferences. Defaults apply until saved settings load from the API (VITE_CURRENCY is only a fallback).
let fmt = { currency: CURRENCIES[import.meta.env.VITE_CURRENCY] ? import.meta.env.VITE_CURRENCY : 'INR', dateFormat: 'DD/MM/YYYY' }
export const setFormat = (p) => { fmt = { ...fmt, ...p } }
export const getFormat = () => fmt
const locale = () => CURRENCIES[fmt.currency].locale
// Formatting only: stored amounts are never converted between currencies.
export const money = (n, d = 0, currency = fmt.currency) => new Intl.NumberFormat(CURRENCIES[currency].locale, { style: 'currency', currency, maximumFractionDigits: d }).format(n ?? 0)
export const monthLabel = (m) => new Date(m + '-01T00:00').toLocaleDateString(locale(), { month: 'short', year: 'numeric' })
export function fmtDate(iso, f = fmt.dateFormat) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return f === 'MM/DD/YYYY' ? `${m}/${d}/${y}` : f === 'YYYY-MM-DD' ? iso : `${d}/${m}/${y}`
}

export class ApiError extends Error { constructor(m, fields, status) { super(m); this.fields = fields || {}; this.status = status } }

export async function api(path, { method = 'GET', body, form, raw } = {}) {
  if (!API_CONFIGURED) throw new ApiError('VITE_API_BASE_URL is not set. Add your API URL in the Netlify environment settings and redeploy.')
  let res
  try {
    res = await fetch(BASE + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: form || (body && JSON.stringify(body)) })
  } catch { throw new ApiError('Cannot reach the server. Check your connection or that the API is running.') }
  if (raw && res.ok) return res
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, data.fields, res.status)
  return data
}

export async function download(path, name) {
  const res = await api(path, { raw: true })
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name }); a.click(); URL.revokeObjectURL(url)
}
export const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString()
