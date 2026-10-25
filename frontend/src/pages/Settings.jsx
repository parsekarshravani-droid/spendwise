import { useEffect, useRef, useState } from 'react'
import { Bell, Monitor, Moon, Palette, PiggyBank, Sun, Tags, User, Wallet } from 'lucide-react'
import { CURRENCIES, DATE_FORMATS, api, fmtDate, money, monthLabel } from '../api'
import { useSettings } from '../settings'
import { applyTheme } from '../theme'
import { Confirm, ErrorState, Field, Skeleton, useApi, useToast } from '../ui'

const toForm = (s) => ({ display_name: s.display_name, currency: s.currency, date_format: s.date_format, theme: s.theme,
  monthly_income_target: s.monthly_income_target ?? '', monthly_spending_limit: s.monthly_spending_limit ?? '',
  notifications_enabled: s.notifications_enabled, budget_alert_threshold: String(s.budget_alert_threshold), monthly_summary_enabled: s.monthly_summary_enabled })
const amountOk = (v) => v === '' || (Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) < 1e9)
const payload = (f) => ({ ...f, display_name: f.display_name.trim(), budget_alert_threshold: Number(f.budget_alert_threshold),
  monthly_income_target: f.monthly_income_target === '' ? null : Number(f.monthly_income_target), monthly_spending_limit: f.monthly_spending_limit === '' ? null : Number(f.monthly_spending_limit) })

function validate(f) {
  const e = {}
  if (f.display_name.trim().length > 60) e.display_name = 'Use 60 characters or fewer.'
  for (const k of ['monthly_income_target', 'monthly_spending_limit']) if (!amountOk(f[k])) e[k] = 'Enter an amount greater than 0, or leave it empty.'
  const t = Number(f.budget_alert_threshold)
  if (!Number.isInteger(t) || t < 50 || t > 100) e.budget_alert_threshold = 'Enter a whole number from 50 to 100.'
  return e
}

const Section = ({ icon: Icon, title, text, children }) => <section className="card set-sec"><header><span className="set-ico"><Icon size={18} /></span><div><h2>{title}</h2><p className="muted small">{text}</p></div></header>{children}</section>
const Switch = ({ id, label, hint, checked, onChange }) => <div className="switch-row"><div><label htmlFor={id}>{label}</label><p className="muted small">{hint}</p></div>
  <input id={id} type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} /></div>

export default function Settings() {
  const { settings, save, reload } = useSettings(); const toast = useToast(); const meta = useApi('/meta').data
  const [form, setForm] = useState(() => toForm(settings)); const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(false)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); const [pending, setPending] = useState(null)
  const [edits, setEdits] = useState({}); const [berrs, setBerrs] = useState({})
  const budgets = useApi('/budgets?month=' + month)
  const root = useRef()

  const current = Object.fromEntries((budgets.data || []).map((b) => [b.category, b]))
  const changes = (meta?.expense_categories || []).filter((c) => edits[c] !== undefined && edits[c] !== (current[c] ? String(current[c].amount) : '')).map((c) => ({ category: c, amount: edits[c] }))
  const setDirty = JSON.stringify(form) !== JSON.stringify(toForm(settings)); const dirty = setDirty || changes.length > 0

  // Preview a theme choice immediately; if it isn't saved, return to the saved theme when leaving the page.
  const saved = useRef(settings.theme); saved.current = settings.theme
  useEffect(() => () => applyTheme(saved.current), [])
  useEffect(() => { if (!dirty) return; const h = (e) => { e.preventDefault(); e.returnValue = '' }; addEventListener('beforeunload', h); return () => removeEventListener('beforeunload', h) }, [dirty])

  const up = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const inv = (k, errors = errs) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `${k}-err` : undefined })
  const pickMonth = (m) => { if (!m || m === month) return; changes.length ? setPending(m) : (setMonth(m), setEdits({}), setBerrs({})) }

  const submit = async (ev) => {
    ev.preventDefault()
    const e = validate(form), be = {}
    for (const c of changes) if (c.amount === '') be[c.category] = 'Enter an amount. To remove a budget, delete it on the Budgets page.'; else if (!amountOk(c.amount)) be[c.category] = 'Enter an amount greater than 0.'
    setErrs(e); setBerrs(be)
    if (Object.keys(e).length || Object.keys(be).length) { toast('Fix the highlighted fields', 'err'); setTimeout(() => root.current?.querySelector('[aria-invalid=true]')?.focus(), 0); return }
    setBusy(true)
    // Budgets are saved first: saving a changed currency re-renders the app shell.
    if (changes.length) {
      try { await api('/budgets/bulk', { method: 'PUT', body: { month, budgets: changes.map((c) => ({ category: c.category, amount: Number(c.amount) })) } }); setEdits({}); setBerrs({}); budgets.reload() }
      catch (x) { setBerrs(x.fields || {}); toast(`Nothing was saved. ${x.message}`, 'err'); setBusy(false); return }
    }
    if (setDirty) {
      try { const s = await save(payload(form)); setForm(toForm(s)) }
      catch (x) { setErrs(x.fields || {}); toast(x.message, 'err'); if (x.status === 409) reload(); setBusy(false); return }
    }
    toast('Settings saved'); setBusy(false)
  }

  const themes = [['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'Match device', Monitor]]
  return <form onSubmit={submit} noValidate ref={root} className="settings">
    <header className="page-head"><div><h1>Settings</h1><p className="muted">Preferences for how SpendWise looks, counts and warns you.</p></div></header>
    <div className="banner warning"><User size={18} />These settings are shared by everyone who opens this app. SpendWise doesn’t have sign-in yet, so they can’t be private to you.</div>

    <Section icon={User} title="General" text="Your name and how amounts and dates are shown.">
      <div className="two"><Field label="Display name" id="display_name" error={errs.display_name}><input id="display_name" value={form.display_name} onChange={up('display_name')} maxLength={80} autoComplete="name" {...inv('display_name')} /></Field>
        <Field label="Date format" id="date_format"><select id="date_format" value={form.date_format} onChange={up('date_format')}>{DATE_FORMATS.map((d) => <option key={d} value={d}>{d} · {fmtDate('2026-03-27', d)}</option>)}</select></Field></div>
      <Field label="Currency" id="currency"><select id="currency" value={form.currency} onChange={up('currency')}>{Object.entries(CURRENCIES).map(([c, v]) => <option key={c} value={c}>{v.label}</option>)}</select></Field>
      <p className="muted small">Preview: {money(123456.5, 2, form.currency)}. Changing currency only changes how amounts are displayed. Your stored amounts are not converted.</p>
    </Section>

    <Section icon={Wallet} title="Financial preferences" text="Targets that sit alongside your real transactions. They never change your recorded income or expenses.">
      <div className="two"><Field label="Monthly income target" id="monthly_income_target" error={errs.monthly_income_target}><input id="monthly_income_target" type="number" inputMode="decimal" min="0" step="0.01" placeholder="Not set" value={form.monthly_income_target} onChange={up('monthly_income_target')} {...inv('monthly_income_target')} /></Field>
        <Field label="Monthly spending limit" id="monthly_spending_limit" error={errs.monthly_spending_limit}><input id="monthly_spending_limit" type="number" inputMode="decimal" min="0" step="0.01" placeholder="Not set" value={form.monthly_spending_limit} onChange={up('monthly_spending_limit')} {...inv('monthly_spending_limit')} /></Field></div>
      <p className="muted small">The spending limit appears on the Dashboard with a progress bar for the month’s actual expenses. Leave a field empty to turn it off.</p>
    </Section>

    <Section icon={Tags} title="Category budgets" text="Set the monthly limit for each expense category.">
      <div className="head-actions"><label htmlFor="bmonth" className="small muted">Month</label><input id="bmonth" type="month" value={month} onChange={(e) => pickMonth(e.target.value)} /></div>
      {budgets.error && !budgets.data ? <ErrorState message={budgets.error} retry={budgets.reload} /> : !budgets.data || !meta ? <Skeleton h={220} /> :
        <ul className={'brows' + (budgets.loading ? ' busy' : '')}>{meta.expense_categories.map((c) => { const b = current[c], id = 'b-' + c.replace(/\W+/g, '')
          return <li key={c}><div><label htmlFor={id}>{c}</label><span className="muted small block">{b ? `${money(b.spent)} spent in ${monthLabel(month)}` : 'No budget set'}</span></div>
            <div className="bin"><input id={id} type="number" inputMode="decimal" min="0" step="0.01" placeholder="No budget" value={edits[c] ?? (b ? String(b.amount) : '')}
              onChange={(e) => setEdits((x) => ({ ...x, [c]: e.target.value }))} {...inv(c, berrs)} />{berrs[c] && <p className="err" id={`${c}-err`} role="alert">{berrs[c]}</p>}</div></li> })}</ul>}
    </Section>

    <Section icon={Palette} title="Appearance" text="Applies right away. Save to keep it on every device.">
      <div className="themes" role="radiogroup" aria-label="Theme">{themes.map(([v, l, Icon]) => <label key={v} className={'theme-opt' + (form.theme === v ? ' on' : '')}>
        <input type="radio" name="theme" value={v} checked={form.theme === v} onChange={() => { setForm((f) => ({ ...f, theme: v })); applyTheme(v) }} /><Icon size={20} />{l}</label>)}</div>
    </Section>

    <Section icon={Bell} title="Notifications" text="Budget warnings inside SpendWise.">
      <Switch id="notif" label="Show budget and spending-limit warnings" hint="Warnings appear on the Dashboard and Budgets pages. Email and browser notifications aren’t available yet." checked={form.notifications_enabled} onChange={(v) => setForm((f) => ({ ...f, notifications_enabled: v }))} />
      <Field label="Warn me when a budget is this much used (%)" id="budget_alert_threshold" error={errs.budget_alert_threshold}><input id="budget_alert_threshold" type="number" min="50" max="100" step="1" value={form.budget_alert_threshold} onChange={up('budget_alert_threshold')} {...inv('budget_alert_threshold')} /></Field>
      <Switch id="summary" label="Monthly summary preference" hint="Saved for later. Summaries are not sent yet." checked={form.monthly_summary_enabled} onChange={(v) => setForm((f) => ({ ...f, monthly_summary_enabled: v }))} />
    </Section>

    <div className="savebar" role="region" aria-label="Save settings"><span className={dirty ? 'unsaved' : 'muted'} aria-live="polite">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
      <button className="btn primary" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    {pending && <Confirm title="Discard budget edits?" text={`You have unsaved budget changes for ${monthLabel(month)}. Switching to ${monthLabel(pending)} will discard them.`} action="Discard and switch" onClose={() => setPending(null)}
      onConfirm={() => { setMonth(pending); setEdits({}); setBerrs({}); setPending(null) }} />}
  </form>
}
