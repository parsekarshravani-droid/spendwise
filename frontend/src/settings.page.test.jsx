import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const SETTINGS = { display_name: 'Asha', currency: 'USD', date_format: 'DD/MM/YYYY', theme: 'dark', monthly_income_target: null, monthly_spending_limit: 5000,
  notifications_enabled: true, budget_alert_threshold: 80, monthly_summary_enabled: false, version: 3 }
const META = { categories: ['Groceries', 'Salary'], expense_categories: ['Groceries', 'Transport'], ai_available: false }
let calls, root, el

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.test'); calls = []
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const path = url.replace('https://api.test/api', ''), method = init.method || 'GET'; calls.push([method, path, init.body && JSON.parse(init.body)])
    const ok = (b) => ({ ok: true, status: 200, json: async () => b })
    if (path === '/settings' && method === 'GET') return ok(SETTINGS)
    if (path === '/settings') return ok({ ...SETTINGS, ...JSON.parse(init.body), version: 4 })
    if (path === '/meta') return ok(META)
    if (path.startsWith('/budgets')) return ok([{ id: 1, category: 'Groceries', month: '2026-10', amount: 2000, spent: 500, remaining: 1500, pct: 25, status: 'ok' }])
    return { ok: false, status: 404, json: async () => ({ error: 'nope' }) }
  })
  el = document.createElement('div'); document.body.append(el); root = createRoot(el)
})
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllEnvs() })

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)) })
const type = async (input, value) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) }) }

it('loads saved settings, validates, then saves with the version it loaded', async () => {
  const { default: App } = await import('./App'); const { SettingsProvider } = await import('./settings'); const { ToastProvider } = await import('./ui')
  await act(async () => root.render(<MemoryRouter initialEntries={['/settings']}><ToastProvider><SettingsProvider><App /></SettingsProvider></ToastProvider></MemoryRouter>)); await tick(); await tick()

  expect(el.querySelector('h1').textContent).toBe('Settings')
  expect(el.querySelector('#display_name').value).toBe('Asha')                  // loaded from API
  expect(el.querySelector('#currency').value).toBe('USD')
  expect(document.documentElement.dataset.theme).toBe('dark')                   // theme restored from saved settings
  expect(el.querySelector('#b-Groceries').value).toBe('2000')                   // existing budget shown
  expect(el.querySelector('.savebar button').disabled).toBe(true)               // nothing to save yet

  await type(el.querySelector('#monthly_spending_limit'), '-5')
  await act(async () => el.querySelector('.savebar button').click())
  expect(el.querySelector('#monthly_spending_limit-err').textContent).toMatch(/greater than 0/)
  expect(calls.some(([m]) => m === 'PUT')).toBe(false)                          // invalid input never reaches the API

  await type(el.querySelector('#monthly_spending_limit'), '7500'); await type(el.querySelector('#b-Transport'), '900')
  await act(async () => el.querySelector('.savebar button').click()); await tick()
  const put = (p) => calls.find(([m, path]) => m === 'PUT' && path === p)
  expect(put('/budgets/bulk')[2]).toEqual({ month: new Date().toISOString().slice(0, 7), budgets: [{ category: 'Transport', amount: 900 }] })  // only the changed budget
  expect(put('/settings')[2]).toMatchObject({ monthly_spending_limit: 7500, currency: 'USD', version: 3 })
})
