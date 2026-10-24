import { useState } from 'react'
import { Download } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { download, money, monthLabel } from '../api'
import { Empty, ErrorState, Skeleton, useApi, useToast } from '../ui'

const lbl = (p, l) => p === 'month' ? monthLabel(l) : p === 'week' ? new Date(l + 'T00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' }) : l
const name = { week: 'Weekly', month: 'Monthly', year: 'Yearly' }

export default function Reports() {
  const toast = useToast()
  const [p, setP] = useState('month')
  const { data, loading, error, reload } = useApi('/analytics?period=' + p)
  const has = data?.series.some((s) => s.income || s.expenses)
  const tot = data?.series.reduce((a, s) => ({ i: a.i + s.income, e: a.e + s.expenses }), { i: 0, e: 0 })
  return <>
    <header className="page-head"><div><h1>Reports</h1><p className="muted">{name[p]} summaries and category comparisons</p></div>
      <div className="head-actions"><div className="seg" role="tablist" aria-label="Period">{['week', 'month', 'year'].map((x) =>
        <button key={x} role="tab" aria-selected={p === x} className={p === x ? 'on' : ''} onClick={() => setP(x)}>{name[x]}</button>)}</div>
        <button className="btn" onClick={() => download(`/analytics/report.csv?period=${p}`, `spendwise-${p}-report.csv`).catch((e) => toast(e.message, 'err'))}><Download size={16} />Download CSV</button></div></header>
    {error && !data ? <ErrorState message={error} retry={reload} /> : !data ? <Skeleton h={400} /> : !has ? <Empty title="Nothing to report yet" text="Once you add transactions in this period, summaries appear here." /> :
      <div className={loading ? 'busy' : ''}>
        <section className="stats">
          <div className="card stat"><span className="muted">Income in range</span><strong>{money(tot.i)}</strong></div>
          <div className="card stat"><span className="muted">Expenses in range</span><strong>{money(tot.e)}</strong></div>
          <div className="card stat"><span className="muted">Net</span><strong className={tot.i - tot.e < 0 ? 'neg' : ''}>{money(tot.i - tot.e)}</strong></div></section>
        <div className="card"><h2>Income versus expenses</h2>
          <div className="chart"><ResponsiveContainer><BarChart data={data.series.map((s) => ({ ...s, name: lbl(p, s.label) }))}>
            <CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? v / 1000 + 'k' : v)} />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 }} cursor={{ fill: 'var(--wash)' }} /><Legend />
            <Bar dataKey="income" name="Income" fill="var(--pos)" radius={[4, 4, 0, 0]} /><Bar dataKey="expenses" name="Expenses" fill="var(--neg)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div className="card table-wrap"><h2>Category comparison</h2><p className="muted small">{lbl(p, data.current_label)} compared with {lbl(p, data.previous_label)}</p>
          {data.comparison.length ? <table><thead><tr><th>Category</th><th>Current</th><th>Previous</th><th>Change</th></tr></thead><tbody>{data.comparison.map((c) => {
            const ch = c.current - c.previous
            return <tr key={c.category}><td data-l="Category">{c.category}</td><td data-l="Current" className="num">{money(c.current)}</td><td data-l="Previous" className="num">{money(c.previous)}</td>
              <td data-l="Change" className={'num ' + (ch > 0 ? 'neg' : ch < 0 ? 'pos' : '')}>{ch > 0 ? '+' : ch < 0 ? '−' : ''}{money(Math.abs(ch))}</td></tr>})}</tbody></table>
            : <p className="muted">No expenses in these two periods.</p>}</div></div>}
  </>
}
