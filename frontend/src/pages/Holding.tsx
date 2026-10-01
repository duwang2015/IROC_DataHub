import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useApi, useJob } from '../api/hooks'
import { Empty, ErrorBox, JobBox, PathLink } from '../components/common'
import { fmtTime } from '../components/format'
import type { HoldingGroup } from '../api/types'

export function HoldingPage() {
  const { ingestId } = useParams()
  if (ingestId) return <HoldingDetail id={ingestId} />
  return <HoldingList />
}

function HoldingList() {
  const list = useApi(() => api.holding(), [])
  const nav = useNavigate()
  return (
    <>
      <h1>Holding</h1>
      <p className="muted">Groups that could not be filed automatically. Open one, compare the DICOM header values with the folder name, then file it to the right case or discard it. Every decision is logged.</p>
      <ErrorBox error={list.error} />
      {list.data && list.data.length === 0 && <Empty>Nothing in holding.</Empty>}
      {list.data && list.data.length > 0 && (
        <div className="tbl"><table>
          <thead><tr><th>ingest</th><th>group</th><th>reason</th><th>what</th><th>header says</th><th>from</th><th>since</th></tr></thead>
          <tbody>{list.data.map((h) => (
            <tr key={h.ingest_id + h.group_no} className="link" onClick={() => nav('/holding/' + h.ingest_id)}>
              <td className="mono">{h.ingest_id}</td><td className="n">{h.group_no}</td>
              <td><span className="chip bad">{h.reason}</span></td><td>{h.summary}</td>
              <td className="mono">{h.suggested_trial ?? '?'}/{h.suggested_case ?? '?'}</td>
              <td className="muted">{h.source.split(/[\\/]/).pop()}</td><td>{fmtTime(h.created_at)}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  )
}

function HoldingDetail({ id }: { id: string }) {
  const d = useApi(() => api.holdingDetail(id), [id])
  const nav = useNavigate()
  const job = useJob((j) => { if (j.status === 'done') d.reload() })
  if (d.error?.status === 404) return <><h1>Holding {id}</h1><Empty>Resolved. <Link to="/holding">Back to holding</Link></Empty></>
  if (d.error) return <ErrorBox error={d.error} />
  if (!d.data) return <p className="muted">loading…</p>
  const rep = d.data.report
  const groups = rep.groups.filter((g) => g.present)
  return (
    <>
      <div className="row muted"><Link to="/holding">Holding</Link> /</div>
      <h1 className="mono">{id}</h1>
      <div className="muted">from <span className="mono">{rep.source}</span></div>
      <PathLink path={d.data.path} />
      <JobBox job={job.job} error={job.submitError} />
      {groups.length === 0 && <Empty>All groups resolved. <button type="button" className="btn small" onClick={() => nav('/holding')}>back</button></Empty>}
      {groups.map((g) => <GroupCard key={g.group_no} id={id} g={g} trials={d.data!.trials} busy={job.busy}
        onResolve={(b) => job.submit(() => api.resolve(id, b))} />)}
      <details style={{ marginTop: 16 }}><summary className="muted">report.md</summary><pre className="log">{d.data.markdown}</pre></details>
    </>
  )
}

function GroupCard({ id, g, trials, busy, onResolve }: { id: string; g: HoldingGroup; trials: string[]; busy: boolean;
  onResolve: (b: { groups: number[]; trial?: string; case?: string; discard?: boolean; force_new_batch?: boolean }) => void }) {
  const [trial, setTrial] = useState(g.decision.trial ?? trials[0] ?? '')
  const [caseId, setCaseId] = useState(g.decision.case ?? '')
  const [force, setForce] = useState(g.reason === 'uid_conflict')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const auth = g.decision.evidence.filter((e) => e.category === 'authoritative')
  const checks = g.decision.evidence.filter((e) => e.category !== 'authoritative')
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row"><b>Group {g.group_no}</b><span className="chip bad">{g.reason}</span><span className="muted">{g.files.length} files</span></div>
      <div style={{ marginTop: 6 }}>{g.summary}</div>
      <div className="row" style={{ marginTop: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>DICOM header (authoritative)</div>
          {auth.length === 0 && <div className="muted">nothing usable in the header</div>}
          {auth.map((e, i) => <div key={i} className="mono">{e.source}: {e.trial ?? '?'}/{e.case ?? '?'} <span className="muted">{e.detail}</span></div>)}
        </div>
        <div style={{ flex: '1 1 260px' }}>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>Folder / keywords (check only)</div>
          {checks.length === 0 && <div className="muted">-</div>}
          {checks.map((e, i) => <div key={i} className="mono">{e.source}: {e.trial ?? '?'}/{e.case ?? '?'} <span className="muted">{e.detail}</span></div>)}
        </div>
      </div>
      {g.decision.notes.map((n, i) => <div key={i} className="muted" style={{ marginTop: 4 }}>note: {n}</div>)}
      <div className="bar" style={{ marginTop: 10 }}>
        <label>trial <select value={trial} onChange={(e) => setTrial(e.target.value)} aria-label="trial">{trials.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        <label>case <input type="text" value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="e.g. BN011-0031" aria-label="case id" style={{ width: 160 }} /></label>
        {g.reason === 'uid_conflict' && <label><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> accept as new batch</label>}
        <button type="button" className="btn primary" disabled={busy || !trial || !caseId.trim()} onClick={() => onResolve({ groups: [g.group_no], trial, case: caseId.trim(), force_new_batch: force })}>File to {trial}/{caseId.trim() || '…'}</button>
        <span className="sp" />
        {!confirmDiscard ? <button type="button" className="btn danger" disabled={busy} onClick={() => setConfirmDiscard(true)}>Discard…</button>
          : <><span className="muted">moves to _holding/_discarded, nothing is deleted</span><button type="button" className="btn danger" disabled={busy} onClick={() => onResolve({ groups: [g.group_no], discard: true })}>Confirm discard</button><button type="button" className="btn" onClick={() => setConfirmDiscard(false)}>cancel</button></>}
      </div>
      <div className="muted mono" style={{ fontSize: 12 }}>{id}/{g.dir}</div>
    </div>
  )
}
