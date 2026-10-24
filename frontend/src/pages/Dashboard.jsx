import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { monthLabel, money } from '../api'
import { Delta, Empty, ErrorState, Skeleton, useApi } from '../ui'

export const PALETTE = ['#0b7a75', '#3b5bdb', '#c7443a', '#d49a0b', '#7b4fc9', '#2b9348', '#d6336c', '#5c677d', '#e07a1f', '#1098ad']
const tip = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)' }

export function BudgetBar({ b }) {
  return <div className="bbar">
    <div className="row"><strong>{b.category}</strong><span className={'pill ' + b.status}>{b.status === 'over' ? 'Over budget' : b.status === 'warning' ? 'Nearly used' : 'On track'}</span></div>
    <div className="track" role="progressbar" aria-valuenow={Math.min(b.pct, 100)} aria-valuemin="0" aria-valuemax="100" aria-label={`${b.category} budget used`}>
      <div className={'fill ' + b.status} style={{ width: Math.min(b.pct, 100) + '%' }} /></div>
    <div className="row muted small"><span>{money(b.spent)} of {money(b.amount)}</span>
      <span>{b.remaining >= 0 ? `${money(b.remaining)} left` : `${money(-b.remaining)} over`}</span></div></div>
}

export default function Dashboard() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const { data: d, loading, error, reload } = useApi('/dashboard?month=' + month)
  const empty = d && !d.recent.length && !d.series.some((s) => s.income || s.expenses)
  const spentPct = d && d.income ? Math.min(100, (d.expenses / d.income) * 100) : d?.expenses ? 100 : 0
  return <>
    <header className="page-head"><div><h1>Dashboard</h1><p className="muted">Your money in {monthLabel(month)}</p></div>
      <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" /></header>
    {error && !d ? <ErrorState message={error} retry={reload} /> : !d ? <Skeleton h={420} /> : empty ? <Empty title="No transactions yet" text="Add your first income or expense to see your dashboard come alive.">
      <Link to="/transactions" className="btn primary">Add a transaction</Link></Empty> : <div className={loading ? 'busy' : ''}>
      <section className="ledger card">
        <div><span className="muted">Total balance</span><div className="big">{money(d.balance)}</div>
          <Delta v={d.change.expenses} goodWhenUp={false} /></div>
        <div className="split">
          <div className="track tall" aria-hidden="true"><div className={'fill ' + (d.savings < 0 ? 'over' : 'spent')} style={{ width: spentPct + '%' }} /></div>
          <p className="small muted">{d.income ? (d.savings >= 0 ? `You've spent ${spentPct.toFixed(0)}% of this month's income` : `You've spent ${money(-d.savings)} more than you earned this month`) : 'No income recorded this month'}</p></div>
      </section>
      <section className="stats">
        {[['Income', d.income, d.change.income, true], ['Expenses', d.expenses, d.change.expenses, false], ['Savings', d.savings, null, true]].map(([l, v, c, up]) =>
          <div className="card stat" key={l}><span className="muted">{l}</span><strong className={l === 'Savings' && v < 0 ? 'neg' : ''}>{money(v)}</strong>
            {c != null ? <Delta v={c} goodWhenUp={up} /> : <span className="muted small">{d.savings_rate != null ? `${d.savings_rate}% of income` : '—'}</span>}</div>)}
      </section>
      <section className="grid2">
        <div className="card"><h2>Income vs expenses</h2><p className="muted small">Last 6 months</p>
          <div className="chart"><ResponsiveContainer><BarChart data={d.series.map((s) => ({ ...s, name: monthLabel(s.label) }))}>
            <CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? v / 1000 + 'k' : v)} />
            <Tooltip formatter={(v) => money(v)} contentStyle={tip} cursor={{ fill: 'var(--wash)' }} />
            <Bar dataKey="income" name="Income" fill="var(--pos)" radius={[4, 4, 0, 0]} /><Bar dataKey="expenses" name="Expenses" fill="var(--neg)" radius={[4, 4, 0, 0]} />
          </BarChart></ResponsiveContainer></div></div>
        <div className="card"><h2>Where it went</h2><p className="muted small">Expenses by category</p>
          {d.categories.length ? <><div className="chart short"><ResponsiveContainer><PieChart><Pie data={d.categories} dataKey="amount" nameKey="category" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="none">
            {d.categories.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie><Tooltip formatter={(v) => money(v)} contentStyle={tip} /></PieChart></ResponsiveContainer></div>
            <ul className="legend">{d.categories.slice(0, 6).map((c, i) => <li key={c.category}><i style={{ background: PALETTE[i % PALETTE.length] }} />{c.category}<span>{money(c.amount)} · {c.share}%</span></li>)}</ul></>
            : <Empty title="No expenses this month" text="Spending by category will show up here." />}</div>
      </section>
      <section className="grid2">
        <div className="card"><div className="row"><h2>Budgets</h2><Link to="/budgets">Manage</Link></div>
          {d.budgets.length ? d.budgets.map((b) => <BudgetBar b={b} key={b.id} />) : <Empty title="No budgets for this month" text="Set a limit per category to track your spending."><Link className="btn" to="/budgets">Create a budget</Link></Empty>}</div>
        <div className="card"><div className="row"><h2>Recent transactions</h2><Link to="/transactions">View all</Link></div>
          <ul className="tx-list">{d.recent.map((t) => <li key={t.id}><div><strong>{t.title}</strong><span className="muted small">{t.category} · {t.date}</span></div>
            <span className={t.type === 'income' ? 'pos' : 'neg'}>{t.type === 'income' ? '+' : '−'}{money(t.amount)}</span></li>)}</ul></div>
      </section></div>}
  </>
}
