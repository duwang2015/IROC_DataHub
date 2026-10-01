import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useApi, useJob } from '../api/hooks'
import { Chips, ErrorBox, JobBox, PathLink } from '../components/common'
import { fmtBytes, fmtTime } from '../components/format'

export function CasePage() {
  const { trial = '', caseId = '' } = useParams()
  const d = useApi(() => api.caseDetail(trial, caseId), [trial, caseId])
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const job = useJob(() => d.reload())
  const c = d.data

  const addNote = async () => {
    if (!note.trim()) return
    try { await api.note(trial, note.trim(), caseId); setNote(''); setMsg('note added'); d.reload() } catch (e) { setMsg(String(e)) }
  }
  const setCurrent = async (batch: string, pin: boolean) => {
    try { await api.setCurrent(trial, caseId, batch, pin); d.reload() } catch (e) { setMsg(String(e)) }
  }
  const run = (producer: string) => job.submit(() => api.run({ producer, trial, case: caseId, skip_rtstruct: false }))

  if (d.error) return <ErrorBox error={d.error} />
  if (!c) return <p className="muted">loading…</p>
  const mods = [...new Set(c.batches.flatMap((b) => b.series.map((s) => s.modality)))].sort()
  return (
    <>
      <div className="row muted"><Link to={'/trials/' + encodeURIComponent(trial)}>{trial}</Link> /</div>
      <h1 className="mono">{caseId} <Chips mods={mods} /></h1>
      <PathLink path={c.path} />
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn" disabled={job.busy} onClick={() => run('dicom_qc')}>Run DICOM QC</button>
        <button type="button" className="btn" disabled={job.busy} onClick={() => run('dcm2nii')}>Run dcm2nii</button>
        <span className="muted">derived runs are cached; rerun only when inputs or parameters change</span>
      </div>
      <JobBox job={job.job} error={job.submitError} />

      <h2>Original ({c.batches.length} batch{c.batches.length === 1 ? '' : 'es'})</h2>
      {c.batches.map((b) => (
        <div className="card" key={b.id} style={{ marginBottom: 10, borderColor: b.current ? 'var(--accent)' : undefined }}>
          <div className="row">
            <b>{b.name}</b><span className="muted">seq {b.seq} · {b.kind} · {b.n_files} files · {fmtBytes(b.total_bytes)} · {fmtTime(b.ingested_at)}</span>
            {b.current ? <span className="chip on">current{c.pinned ? ', pinned' : ''}</span> : <button type="button" className="btn small" onClick={() => setCurrent(b.name, false)}>make current</button>}
            {b.current && !c.pinned && <button type="button" className="btn small" onClick={() => setCurrent(b.name, true)}>pin</button>}
            <span className="sp" /><PathLink path={b.path} label="" />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>from {b.source}</div>
          {b.series.length > 0 && (
            <div className="tbl"><table style={{ marginTop: 6 }}>
              <thead><tr><th>series folder</th><th>modality</th><th className="n">files</th><th>description</th><th>study date</th><th></th></tr></thead>
              <tbody>{b.series.map((s) => (
                <tr key={s.id}><td className="mono">{s.name}</td><td>{s.modality}</td><td className="n">{s.n_instances}</td><td>{s.series_description}</td><td>{s.study_date}</td><td><PathLink path={s.path} label="" /></td></tr>))}</tbody>
            </table></div>
          )}
          {b.documents.length > 0 && (
            <div style={{ marginTop: 6 }}><span className="muted">documents: </span>{b.documents.map((f) => <span key={f.rel_path} className="chip" title={f.path}>{f.name}</span>)}</div>
          )}
        </div>
      ))}

      <h2>Derived</h2>
      {c.runs.length === 0 ? <div className="muted">no derived runs yet</div> : (
        <div className="tbl"><table>
          <thead><tr><th>module</th><th>run</th><th>status</th><th>started</th><th>outputs</th><th></th></tr></thead>
          <tbody>{c.runs.map((r) => (
            <tr key={r.id}><td className="mono">{r.module}@{r.version}</td><td className="mono">{r.run_name}</td>
              <td><span className={'chip ' + (r.status === 'completed' ? 'ok' : r.status === 'failed' ? 'bad' : '')}>{r.status}</span></td>
              <td>{fmtTime(r.started_at)}</td>
              <td className="mono">{r.files.slice(0, 6).map((f) => f.name).join(', ')}{r.files.length > 6 ? ` (+${r.files.length - 6})` : ''}</td>
              <td><PathLink path={r.path} label="" /></td></tr>))}</tbody>
        </table></div>
      )}

      <h2>IROC notes folder</h2>
      <PathLink path={c.notes_path} />
      {c.notes.length > 0 && <div style={{ marginTop: 6 }}>{c.notes.map((n) => <span key={n.name} className="chip" title={n.path}>{n.name}</span>)}</div>}

      {c.holding.length > 0 && (
        <>
          <h2>Holding</h2>
          {c.holding.map((h) => <div key={h.ingest_id + h.group_no} className="muted"><Link to={'/holding/' + h.ingest_id}>{h.ingest_id}</Link> group {h.group_no}: <span className="chip bad">{h.reason}</span></div>)}
        </>
      )}

      <h2>Log</h2>
      <div className="bar">
        <input id="note-text" type="text" placeholder="add a note: who took what, for which purpose" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
        <button type="button" className="btn primary" onClick={addNote} disabled={!note.trim()}>Add note</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      {c.log.length === 0 ? <div className="muted">nothing logged for this case</div> : (
        <div className="tbl"><table>
          <thead><tr><th>time</th><th>who</th><th>action</th><th>message</th></tr></thead>
          <tbody>{c.log.map((r, i) => <tr key={i}><td className="mono">{r.at}</td><td>{r.username}@{r.host}</td><td><span className="chip">{r.action}</span></td><td>{r.message}</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  )
}
