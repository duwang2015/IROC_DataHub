import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Health, Overview } from '../api/types'

export function Shell({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [ov, setOv] = useState<Overview | null>(null)
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const loc = useLocation()

  useEffect(() => {
    let alive = true
    api.health().then((h) => alive && setHealth(h)).catch(() => alive && setHealth(null))
    api.overview().then((o) => alive && setOv(o)).catch(() => alive && setOv(null))
    return () => { alive = false }
  }, [loc.pathname])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (q.trim()) nav('/search?q=' + encodeURIComponent(q.trim()))
  }
  const holding = ov?.stats.holding_open ?? 0
  const inbox = ov?.inbox.length ?? 0
  const cls = ({ isActive }: { isActive: boolean }) => 'nav' + (isActive ? ' active' : '')
  return (
    <div className="shell">
      <nav className="rail">
        <div className="brand">IROC DataHub</div>
        <div className="ws">{health?.store_ok ? (health.label || health.workspace) : 'no workspace'}</div>
        <form onSubmit={submit} role="search">
          <input id="global-search" type="search" placeholder="case id, trial…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="search" />
        </form>
        <NavLink to="/" end className={cls}>Dashboard</NavLink>
        {ov?.trials_config.map((t) => (
          <NavLink key={t.id} to={'/trials/' + encodeURIComponent(t.id)} className={cls}>{t.id}</NavLink>
        ))}
        <NavLink to="/inbox" className={cls}>Inbox {inbox > 0 && <span className="count warn">{inbox}</span>}</NavLink>
        <NavLink to="/holding" className={cls}>Holding {holding > 0 && <span className="count warn">{holding}</span>}</NavLink>
        <NavLink to="/log" className={cls}>Log</NavLink>
        <NavLink to="/settings" className={cls}>Settings</NavLink>
        <div className="foot">v{health?.version ?? '…'}{health && health.jobs_running > 0 ? ` · ${health.jobs_running} job(s) running` : ''}</div>
      </nav>
      <main className="content">{children}</main>
    </div>
  )
}
