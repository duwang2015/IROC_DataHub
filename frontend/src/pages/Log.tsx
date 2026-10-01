import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useApi } from '../api/hooks'
import { Empty, ErrorBox, PathLink } from '../components/common'

export function LogPage() {
  const { trial } = useParams()
  const trials = useApi(() => api.trials(), [])
  const [action, setAction] = useState('')
  const [caseId, setCaseId] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const log = useApi(() => trial ? api.log(trial, { action, case: caseId }) : Promise.resolve(null), [trial, action, caseId])
  if (!trial) {
    return (<><h1>Trial logs</h1><ErrorBox error={trials.error} />
      {trials.data?.map((t) => <div key={t.id}><Link to={'/log/' + encodeURIComponent(t.id)}>{t.id}</Link></div>)}</>)
  }
  const addNote = async () => {
    if (!note.trim()) return
    try { await api.note(trial, note.trim(), caseId || undefined); setNote(''); setMsg('note added'); log.reload() } catch (e) { setMsg(String(e)) }
  }
  return (
    <>
      <h1>{trial} log</h1>
      {log.data && <PathLink path={log.data.path} />}
      <div className="bar">
        <label>action <select value={action} onChange={(e) => setAction(e.target.value)}><option value="">any</option>{['ingest', 'holding', 'resolve', 'discard', 'derive', 'export', 'note', 'current'].map((a) => <option key={a}>{a}</option>)}</select></label>
        <input type="text" placeholder="case id" value={caseId} onChange={(e) => setCaseId(e.target.value)} style={{ flex: '0 1 160px' }} />
      </div>
      <div className="bar">
        <input id="log-note" type="text" placeholder="add a note (who took what, for what purpose)" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
        <button type="button" className="btn primary" disabled={!note.trim()} onClick={addNote}>Add note</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      <ErrorBox error={log.error} />
      {log.data && log.data.entries.length === 0 && <Empty>No entries.</Empty>}
      {log.data && log.data.entries.length > 0 && (
        <div className="tbl"><table>
          <thead><tr><th>time</th><th>who</th><th>action</th><th>case</th><th>message</th></tr></thead>
          <tbody>{log.data.entries.map((r, i) => (
            <tr key={i}><td className="mono">{r.at}</td><td>{r.username}@{r.host}</td><td><span className="chip">{r.action}</span></td>
              <td className="mono">{r.case_id ? <Link to={`/cases/${encodeURIComponent(trial)}/${encodeURIComponent(r.case_id)}`}>{r.case_id}</Link> : '-'}</td><td>{r.message}</td></tr>))}</tbody>
        </table></div>
      )}
    </>
  )
}
