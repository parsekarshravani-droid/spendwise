import { useEffect, useRef, useState } from 'react'
import { ArrowDownUp, Download, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { api, download, fmtDate, money, qs } from '../api'
import { Confirm, Empty, ErrorState, Field, Modal, Skeleton, useApi, useToast } from '../ui'

const INCOME = ['Salary', 'Freelance', 'Investments', 'Other']
const today = () => new Date().toISOString().slice(0, 10)

function TxForm({ tx, meta, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState(tx || { title: '', amount: '', type: 'expense', category: 'Food & Dining', date: today(), notes: '' })
  const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(false)
  const cats = f.type === 'income' ? INCOME : meta.expense_categories
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value, ...(k === 'type' ? { category: e.target.value === 'income' ? 'Salary' : 'Food & Dining' } : {}) }))
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({})
    try { await api(tx ? `/transactions/${tx.id}` : '/transactions', { method: tx ? 'PUT' : 'POST', body: f }); toast(tx ? 'Transaction updated' : 'Transaction added'); onSaved() }
    catch (x) { setErrs(x.fields || {}); if (!Object.keys(x.fields || {}).length) toast(x.message, 'err') } finally { setBusy(false) }
  }
  const inv = (k) => ({ 'aria-invalid': !!errs[k], 'aria-describedby': errs[k] ? `${k}-err` : undefined })
  return <Modal title={tx ? 'Edit transaction' : 'Add transaction'} onClose={onClose}>
    <form onSubmit={submit} noValidate className="form">
      <Field label="Title" id="title" error={errs.title}><input id="title" value={f.title} onChange={set('title')} maxLength={120} required {...inv('title')} /></Field>
      <div className="two"><Field label="Amount" id="amount" error={errs.amount}><input id="amount" type="number" inputMode="decimal" min="0" step="0.01" value={f.amount} onChange={set('amount')} required {...inv('amount')} /></Field>
        <Field label="Date" id="date" error={errs.date}><input id="date" type="date" value={f.date} onChange={set('date')} required {...inv('date')} /></Field></div>
      <div className="two"><Field label="Type" id="type" error={errs.type}><select id="type" value={f.type} onChange={set('type')}><option value="expense">Expense</option><option value="income">Income</option></select></Field>
        <Field label="Category" id="category" error={errs.category}><select id="category" value={f.category} onChange={set('category')}>{cats.map((c) => <option key={c}>{c}</option>)}</select></Field></div>
      <Field label="Notes (optional)" id="notes" error={errs.notes}><textarea id="notes" rows="2" value={f.notes} onChange={set('notes')} maxLength={500} /></Field>
      <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : tx ? 'Save changes' : 'Add transaction'}</button></div>
    </form></Modal>
}

export default function Transactions() {
  const toast = useToast()
  const meta = useApi('/meta').data
  const [flt, setFlt] = useState({ q: '', type: '', category: '', start: '', end: '', sort: 'date', order: 'desc', page: 1 })
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null); const [del, setDel] = useState(null); const [report, setReport] = useState(null)
  const file = useRef()
  useEffect(() => { const h = setTimeout(() => setFlt((p) => (p.q === q ? p : { ...p, q, page: 1 })), 300); return () => clearTimeout(h) }, [q])
  const { data, loading, error, reload } = useApi('/transactions?' + qs({ ...flt, per_page: 10 }))
  const upd = (k) => (e) => setFlt((p) => ({ ...p, [k]: e.target.value, page: 1 }))
  const sortBy = (col) => setFlt((p) => ({ ...p, sort: col, order: p.sort === col && p.order === 'desc' ? 'asc' : 'desc', page: 1 }))
  const filtered = flt.q || flt.type || flt.category || flt.start || flt.end

  const doImport = async (e) => {
    const fl = e.target.files[0]; e.target.value = ''; if (!fl) return
    const fd = new FormData(); fd.append('file', fl)
    try { const r = await api('/transactions/import', { method: 'POST', form: fd }); setReport(r); toast(`Imported ${r.imported} transaction${r.imported === 1 ? '' : 's'}`); reload() }
    catch (x) { setReport({ imported: 0, skipped: 0, errors: [], message: x.message }); toast(x.message, 'err') }
  }
  const doExport = () => download('/transactions/export?' + qs({ ...flt, page: '' }), 'transactions.csv').catch((x) => toast(x.message, 'err'))
  const th = (col, label) => <th scope="col" aria-sort={flt.sort === col ? (flt.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button className="sort" onClick={() => sortBy(col)}>{label}<ArrowDownUp size={13} /></button></th>

  return <>
    <header className="page-head"><div><h1>Transactions</h1><p className="muted">{data ? `${data.total} record${data.total === 1 ? '' : 's'}` : 'Loading…'}</p></div>
      <div className="head-actions">
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={doImport} />
        <button className="btn" onClick={() => file.current.click()}><Upload size={16} />Import CSV</button>
        <button className="btn" onClick={doExport}><Download size={16} />Export CSV</button>
        <button className="btn primary" onClick={() => setForm({})} disabled={!meta}><Plus size={16} />Add transaction</button></div></header>
    <div className="card filters">
      <div className="search"><Search size={16} /><input type="search" placeholder="Search title or notes" aria-label="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <select aria-label="Type" value={flt.type} onChange={upd('type')}><option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option></select>
      <select aria-label="Category" value={flt.category} onChange={upd('category')}><option value="">All categories</option>{meta?.categories.map((c) => <option key={c}>{c}</option>)}</select>
      <input type="date" aria-label="From date" value={flt.start} onChange={upd('start')} /><input type="date" aria-label="To date" value={flt.end} onChange={upd('end')} />
    </div>
    {report && <div className="card note" role="status"><strong>{report.message || `Imported ${report.imported}, skipped ${report.skipped}`}</strong>
      {report.errors?.length > 0 && <ul className="small">{report.errors.slice(0, 8).map((e) => <li key={e.row}>Row {e.row}: {e.error}</li>)}</ul>}
      <button className="btn ghost" onClick={() => setReport(null)}>Dismiss</button></div>}
    {error && !data ? <ErrorState message={error} retry={reload} /> : !data ? <Skeleton h={360} /> : !data.items.length ?
      <Empty title={filtered ? 'No matching transactions' : 'No transactions yet'} text={filtered ? 'Try clearing a filter or searching for something else.' : 'Add one manually or import a CSV with title, amount, category, date and type columns.'} /> :
      <div className={'card table-wrap' + (loading ? ' busy' : '')}><table>
        <thead><tr>{th('date', 'Date')}{th('title', 'Title')}{th('category', 'Category')}{th('amount', 'Amount')}<th scope="col"><span className="sr">Actions</span></th></tr></thead>
        <tbody>{data.items.map((t) => <tr key={t.id}>
          <td data-l="Date">{fmtDate(t.date)}</td><td data-l="Title"><strong>{t.title}</strong>{t.notes && <span className="muted small block">{t.notes}</span>}</td>
          <td data-l="Category"><span className="chip">{t.category}</span></td>
          <td data-l="Amount" className={t.type === 'income' ? 'pos num' : 'neg num'}>{t.type === 'income' ? '+' : '−'}{money(t.amount, 2)}</td>
          <td className="acts"><button className="icon-btn" aria-label={`Edit ${t.title}`} onClick={() => setForm(t)}><Pencil size={16} /></button>
            <button className="icon-btn" aria-label={`Delete ${t.title}`} onClick={() => setDel(t)}><Trash2 size={16} /></button></td></tr>)}</tbody></table>
        <div className="pager"><button className="btn" disabled={data.page <= 1} onClick={() => setFlt((p) => ({ ...p, page: p.page - 1 }))}>Previous</button>
          <span className="muted">Page {data.page} of {data.pages || 1}</span>
          <button className="btn" disabled={data.page >= data.pages} onClick={() => setFlt((p) => ({ ...p, page: p.page + 1 }))}>Next</button></div></div>}
    {form && <TxForm tx={form.id ? form : null} meta={meta} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />}
    {del && <Confirm title="Delete this transaction?" text={`“${del.title}” (${money(del.amount, 2)}) will be permanently removed.`} action="Delete transaction" onClose={() => setDel(null)}
      onConfirm={async () => { try { await api(`/transactions/${del.id}`, { method: 'DELETE' }); toast('Transaction deleted'); setDel(null); reload() } catch (x) { toast(x.message, 'err') } }} />}
  </>
}
