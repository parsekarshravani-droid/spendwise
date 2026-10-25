import { useState } from 'react'
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, monthLabel, money } from '../api'
import { Confirm, Empty, ErrorState, Field, Modal, Skeleton, useApi, useToast } from '../ui'
import { BudgetBar } from './Dashboard'
import { useSettings } from '../settings'

function BudgetForm({ b, month, cats, used, onClose, onSaved }) {
  const toast = useToast()
  const avail = cats.filter((c) => !used.includes(c))
  const [f, setF] = useState({ category: b?.category || avail[0] || '', amount: b?.amount ?? '' })
  const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({})
    try { await api(b ? `/budgets/${b.id}` : '/budgets', { method: b ? 'PUT' : 'POST', body: { ...f, month } }); toast(b ? 'Budget updated' : 'Budget created'); onSaved() }
    catch (x) { setErrs(x.fields || {}); if (!Object.keys(x.fields || {}).length) toast(x.message, 'err') } finally { setBusy(false) }
  }
  return <Modal title={b ? `Edit ${b.category} budget` : 'New budget'} onClose={onClose} narrow>
    <form className="form" onSubmit={submit} noValidate>
      <Field label="Category" id="bcat" error={errs.category}><select id="bcat" value={f.category} disabled={!!b} onChange={(e) => setF({ ...f, category: e.target.value })}>
        {(b ? [b.category] : avail).map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label={`Monthly limit for ${monthLabel(month)}`} id="bamt" error={errs.amount}><input id="bamt" type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-invalid={!!errs.amount} required /></Field>
      <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.category}>{busy ? 'Saving…' : 'Save budget'}</button></div>
    </form></Modal>
}

export default function Budgets() {
  const toast = useToast(); const { settings } = useSettings()
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const meta = useApi('/meta').data
  const { data, loading, error, reload } = useApi('/budgets?month=' + month)
  const [form, setForm] = useState(null); const [del, setDel] = useState(null)
  const alerts = settings.notifications_enabled ? data?.filter((b) => b.status !== 'ok') || [] : []
  return <>
    <header className="page-head"><div><h1>Budgets</h1><p className="muted">Monthly limits by category</p></div>
      <div className="head-actions"><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
        <button className="btn primary" onClick={() => setForm({})} disabled={!meta}><Plus size={16} />New budget</button></div></header>
    {alerts.map((b) => <div key={b.id} className={'banner ' + b.status} role="alert"><AlertTriangle size={18} />
      {b.status === 'over' ? `${b.category} is over budget by ${money(-b.remaining)}.` : `${b.category} is ${b.pct.toFixed(0)}% used — ${money(b.remaining)} left.`}</div>)}
    {error && !data ? <ErrorState message={error} retry={reload} /> : !data ? <Skeleton h={260} /> : !data.length ?
      <Empty title="No budgets for this month" text="Pick a category and a limit. Spending is tracked against it automatically."><button className="btn primary" onClick={() => setForm({})}>Create a budget</button></Empty> :
      <div className={'cards3' + (loading ? ' busy' : '')}>{data.map((b) => <div className="card" key={b.id}><BudgetBar b={b} />
        <div className="actions left"><button className="btn ghost" onClick={() => setForm(b)}><Pencil size={14} />Edit</button><button className="btn ghost" onClick={() => setDel(b)}><Trash2 size={14} />Delete</button></div></div>)}</div>}
    {form && <BudgetForm b={form.id ? form : null} month={month} cats={meta.expense_categories} used={data?.map((b) => b.category) || []} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />}
    {del && <Confirm title="Delete this budget?" text={`The ${del.category} budget for ${monthLabel(del.month)} will be removed. Your transactions are not affected.`} action="Delete budget" onClose={() => setDel(null)}
      onConfirm={async () => { try { await api(`/budgets/${del.id}`, { method: 'DELETE' }); toast('Budget deleted'); setDel(null); reload() } catch (x) { toast(x.message, 'err') } }} />}
  </>
}
