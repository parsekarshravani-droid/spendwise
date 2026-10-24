const RAW = import.meta.env.VITE_API_BASE_URL
export const API_CONFIGURED = Boolean(RAW)
const BASE = (RAW || '').replace(/\/$/, '') + '/api'
const CUR = import.meta.env.VITE_CURRENCY || 'INR'
const LOC = import.meta.env.VITE_LOCALE || 'en-IN'
export const money = (n, d = 0) => new Intl.NumberFormat(LOC, { style: 'currency', currency: CUR, maximumFractionDigits: d }).format(n ?? 0)
export const monthLabel = (m) => new Date(m + '-01T00:00').toLocaleDateString(LOC, { month: 'short', year: 'numeric' })

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
