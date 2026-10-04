import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useApi } from '../api/hooks'
import { Empty, ErrorBox, Tile } from '../components/common'
import { fmtBytes, fmtTime } from '../components/format'
import { NoWorkspace } from './Settings'

export function Dashboard() {
  const { data, error, loading } = useApi(() => api.overview(), [])
  if (error?.code === 'no_workspace') return <NoWorkspace />
  if (error) return <ErrorBox error={error} />
  if (loading || !data) return <p className="muted">loading…</p>
  const st = data.stats
  const totals = st.trials.reduce((a, t) => ({ cases: a.cases + t.cases, files: a.files + t.files, bytes: a.bytes + t.bytes }), { cases: 0, files: 0, bytes: 0 })
  return (
    <>
      <h1>Dashboard</h1>
      <div className="muted mono" style={{ marginBottom: 12 }}>{data.root}</div>
      <div className="tiles">
        <Tile v={st.trials.length} k="trials" />
        <Tile v={totals.cases} k="cases" />
        <Tile v={totals.files} k="files" />
        <Tile v={fmtBytes(totals.bytes)} k="on disk" />
        <Tile v={st.holding_open} k="holding groups" tone={st.holding_open ? 'warn' : undefined} />
        <Tile v={data.inbox.length} k="waiting in inbox" tone={data.inbox.length ? 'warn' : undefined} />
      </div>
      {data.last_summary && (
        <div className="muted" style={{ marginTop: 10 }}>
          last run: {data.last_summary.mode}{data.last_summary.dry_run ? ' (dry run)' : ''} at {fmtTime(data.last_summary.started_at)} · {data.last_summary.totals.batches} batch(es), {data.last_summary.totals.held_groups} held · <Link to="/reports">summaries</Link>
        </div>
      )}
      {data.lock && <div className="err">Store locked by {data.lock.user}@{data.lock.host} since {fmtTime(data.lock.started_at)} ({data.lock.cmd})</div>}
      {data.jobs.length > 0 && <div className="job">{data.jobs.length} job(s) running: {data.jobs.map((j) => j.kind).join(', ')}</div>}

      {st.trials.length === 0 && <Empty>No collections configured. Edit the rules in Settings.</Empty>}
      {data.sites.map((site) => {
        const cols = st.trials.filter((t) => (t.site ?? 'OTHER') === site)
        if (cols.length === 0) return null
        return (<div key={site}>
      <h2>{site}</h2>
      <div className="cards">
        {cols.map((t) => (
          <div className="card" key={t.id}>
            <h3 style={{ margin: 0 }}><Link to={'/trials/' + encodeURIComponent(t.id)}>{t.id}</Link> <span className="chip">{t.kind ?? 'trial'}</span> <span className="muted">{t.name !== t.id ? t.name : ''}</span></h3>
            <div className="row" style={{ marginTop: 6 }}>
              <span><b className="num">{t.cases}</b> cases</span>
              <span><b className="num">{t.batches}</b> batches</span>
              <span><b className="num">{t.files}</b> files</span>
              <span><b>{fmtBytes(t.bytes)}</b></span>
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              {Object.entries(t.cases_by_modality).sort().map(([m, n]) => <span key={m} className="chip">{m} {n}</span>)}
              {Object.entries(t.cases_by_module).sort().map(([m, n]) => <span key={m} className="chip ok">{m} {n}</span>)}
            </div>
            <div className="muted" style={{ marginTop: 6 }}>last ingest {fmtTime(t.last_ingest)}</div>
          </div>
        ))}
      </div>
        </div>)
      })}

      {data.holding.length > 0 && (
        <>
          <h2>Holding</h2>
          <div className="tbl"><table>
            <thead><tr><th>ingest</th><th>group</th><th>reason</th><th>since</th></tr></thead>
            <tbody>{data.holding.map((h) => (
              <tr key={h.ingest_id + h.group_no}>
                <td className="mono"><Link to={'/holding/' + h.ingest_id}>{h.ingest_id}</Link></td>
                <td className="n">{h.group_no}</td><td><span className="chip bad">{h.reason}</span></td><td>{fmtTime(h.created_at)}</td>
              </tr>))}</tbody>
          </table></div>
        </>
      )}

      <h2>Recent activity</h2>
      {data.recent_log.length === 0 ? <Empty>Nothing logged yet.</Empty> : (
        <div className="tbl"><table>
          <thead><tr><th>time</th><th>who</th><th>action</th><th>trial</th><th>case</th><th>message</th></tr></thead>
          <tbody>{data.recent_log.map((r, i) => (
            <tr key={i}><td className="mono">{r.at}</td><td>{r.username}</td><td><span className="chip">{r.action}</span></td>
              <td><Link to={'/trials/' + encodeURIComponent(r.trial_id)}>{r.trial_id}</Link></td>
              <td className="mono">{r.case_id ? <Link to={`/cases/${encodeURIComponent(r.trial_id)}/${encodeURIComponent(r.case_id)}`}>{r.case_id}</Link> : '-'}</td>
              <td>{r.message}</td></tr>))}</tbody>
        </table></div>
      )}
    </>
  )
}
