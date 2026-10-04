import { useState } from 'react'
import { api } from '../api/client'
import { useApi, useJob } from '../api/hooks'
import { ErrorBox, JobBox } from '../components/common'
import { fmtTime } from '../components/format'

export function NoWorkspace() {
  return (
    <>
      <h1>Welcome</h1>
      <p>No data root is open yet. Open an existing store root (the folder that contains <span className="mono">iroc_store.yaml</span>) or create a new one.</p>
      <WorkspaceForm onDone={() => window.location.assign('/')} />
    </>
  )
}

function WorkspaceForm({ onDone }: { onDone: () => void }) {
  const [root, setRoot] = useState('')
  const [label, setLabel] = useState('')
  const [create, setCreate] = useState(false)
  const [trials, setTrials] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const submit = async () => {
    setErr(null)
    try {
      await api.addWorkspace({ root: root.trim(), label: label.trim(), create, trials: trials.split(/[,\s]+/).filter(Boolean) })
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="field"><label htmlFor="ws-root">store root</label><input id="ws-root" type="text" placeholder="E:\iroc_data  or  \\nas\iroc" value={root} onChange={(e) => setRoot(e.target.value)} /></div>
      <div className="field"><label htmlFor="ws-label">label</label><input id="ws-label" type="text" placeholder="optional" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
      <label className="row"><input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} /> create a new store there</label>
      {create && <div className="field"><label htmlFor="ws-trials">trial ids (comma separated)</label><input id="ws-trials" type="text" placeholder="NRG-BN011, NRG-HN009" value={trials} onChange={(e) => setTrials(e.target.value)} /></div>}
      <ErrorBox error={err} />
      <button type="button" className="btn primary" disabled={!root.trim()} onClick={submit}>{create ? 'Create and open' : 'Open'}</button>
    </div>
  )
}

export function SettingsPage() {
  const ws = useApi(() => api.workspaces(), [])
  const cfg = useApi(() => api.config(), [ws.data?.active])
  const job = useJob()
  const activate = async (root: string) => { await api.setActive(root); window.location.reload() }
  const remove = async (root: string) => { await api.removeWorkspace(root); ws.reload() }
  return (
    <>
      <h1>Settings</h1>
      <h2>Workspaces (store roots)</h2>
      <p className="muted">A store root is self-contained and relocatable: copy the folder anywhere, open it here, run reindex.</p>
      <ErrorBox error={ws.error} />
      <div className="tbl"><table>
        <thead><tr><th>label</th><th>root</th><th>last opened</th><th></th></tr></thead>
        <tbody>{ws.data?.workspaces.map((w) => (
          <tr key={w.root} className={w.root === ws.data?.active ? 'cur' : ''}>
            <td>{w.label}</td><td className="mono">{w.root}{!w.exists && <span className="chip bad" style={{ marginLeft: 6 }}>not found</span>}</td><td>{fmtTime(w.last_opened)}</td>
            <td className="row">{w.root !== ws.data?.active && <button type="button" className="btn small" onClick={() => activate(w.root)}>open</button>}<button type="button" className="btn small" onClick={() => remove(w.root)}>forget</button></td>
          </tr>))}</tbody>
      </table></div>
      <details style={{ marginTop: 10 }}><summary>add a workspace</summary><div style={{ marginTop: 8 }}><WorkspaceForm onDone={() => window.location.reload()} /></div></details>

      <h2>Maintenance</h2>
      <div className="bar">
        <button type="button" className="btn" disabled={job.busy} onClick={() => job.submit(() => api.reindex(false))}>Reindex catalog from the tree</button>
        <button type="button" className="btn" disabled={job.busy} onClick={() => job.submit(() => api.verify())}>Verify files against catalog</button>
      </div>
      <JobBox job={job.job} error={job.submitError} />

      <h2>Collections and rules (iroc_store.yaml)</h2>
      {cfg.data && <div className="muted mono" style={{ marginBottom: 6 }}>{cfg.data.path}</div>}
      <ErrorBox error={cfg.error} />
      <p className="muted">Data is organised as site / collection / case. <span className="mono">trials</span> need <span className="mono">site</span> and <span className="mono">case_id_patterns</span> with a <span className="mono">(?P&lt;case&gt;…)</span> group; <span className="mono">sources</span> (hospitals, public datasets) need <span className="mono">site</span> plus <span className="mono">institution_patterns</span> (matched against InstitutionName) or <span className="mono">patient_id_patterns</span>. The file is validated before it is written; the previous version is kept as <span className="mono">.bak</span>.</p>
      {cfg.data && <ConfigEditor key={cfg.data.text} initial={cfg.data.text} onSaved={() => cfg.reload()} />}
    </>
  )
}

function ConfigEditor({ initial, onSaved }: { initial: string; onSaved: () => void }) {
  const [text, setText] = useState(initial)
  const [saved, setSaved] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    setErr(null); setSaved(null)
    try { const r = await api.saveConfig(text); setSaved('saved; trials: ' + r.trials.join(', ')); onSaved() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <>
      <textarea id="config-text" className="code" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="bar"><button type="button" className="btn primary" onClick={save} disabled={!text || text === initial}>Save</button>{saved && <span className="ok-msg">{saved}</span>}<ErrorBox error={err} /></div>
    </>
  )
}
