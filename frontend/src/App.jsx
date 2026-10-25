import { NavLink, Route, Routes } from 'react-router-dom'
import { BarChart3, LayoutDashboard, Moon, PiggyBank, Receipt, Settings as Cog, Sparkles, Sun, TrendingUp } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Budgets from './pages/Budgets'
import Reports from './pages/Reports'
import Insights from './pages/Insights'
import SettingsPage from './pages/Settings'
import { useSettings } from './settings'
import { applyTheme, useResolvedTheme } from './theme'
import { useToast } from './ui'

const NAV = [['/', 'Dashboard', LayoutDashboard], ['/transactions', 'Transactions', Receipt], ['/budgets', 'Budgets', PiggyBank],
  ['/reports', 'Reports', BarChart3], ['/insights', 'Insights', Sparkles], ['/settings', 'Settings', Cog]]

export default function App() {
  const { settings, save } = useSettings(); const toast = useToast(); const theme = useResolvedTheme()
  // The sidebar toggle saves to the database, so the choice follows the user to other devices.
  const flip = () => { const t = theme === 'dark' ? 'light' : 'dark'; applyTheme(t); save({ theme: t }).catch((e) => toast(e.message, 'err')) }
  return <div className="shell">
    <aside className="side">
      <div className="brand"><span className="logo"><TrendingUp size={18} /></span>SpendWise</div>
      <nav aria-label="Main">{NAV.map(([to, label, Icon]) =>
        <NavLink key={to} to={to} end={to === '/'} className="nav"><Icon size={20} /><span>{label}</span></NavLink>)}</nav>
      <button className="nav theme" onClick={flip} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}<span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span></button>
    </aside>
    <main id="main" key={settings.currency + settings.date_format}>
      <Routes>
        <Route path="/" element={<Dashboard />} /><Route path="/transactions" element={<Transactions />} />
        <Route path="/budgets" element={<Budgets />} /><Route path="/reports" element={<Reports />} />
        <Route path="/insights" element={<Insights />} /><Route path="/settings" element={<SettingsPage />} /><Route path="*" element={<p>Page not found.</p>} />
      </Routes>
    </main>
  </div>
}
