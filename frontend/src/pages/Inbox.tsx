import { useState } from 'react'
import { api } from '../api/client'
import { useApi, useJob } from '../api/hooks'
import { Link } from 'react-router-dom'
import { Empty, ErrorBox, JobBox, PathLink } from '../components/common'
import { ReportView } from './Reports'
import { fmtBytes } from '../components/format'

export function InboxPage() {
  const inbox = useApi(() => api.inbox(), [])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [forceTrial, setForceTrial] = useState('')
  const [forceCase, setForceCase] = useState('')
  const job = useJob(() => inbox.reload())
  const [folder, setFolder] = useState('')
  const [impTrial, setImpTrial] = useState('')
  const [impCase, setImpCase] = useState('')
  const imp = useJob()
  const summaryOf = (j: { result: unknown } | null) => {
    const r = j?.result as { summary_name?: string } | undefined
    return r?.summary_name ?? null
  }
  const entries = inbox.data?.entries ?? []
  const toggle = (p: string) => setSel((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n })
  const start = (dry: boolean) => job.submit(() => api.ingest({ sources: [...sel], dry_run: dry, trial: forceTrial || undefined, case: forceCase || undefined }))
  return (
    <>
      <h1>Inbox</h1>
      {inbox.data && <PathLink path={inbox.data.path} />}
      <p className="muted">Drop folders or zip files here (Explorer). Preview shows how each drop would be classified from its DICOM headers; Ingest files them. Drops still being copied are skipped until they have been quiet for {inbox.data?.settle_seconds ?? '…'} s.</p>
      <ErrorBox error={inbox.error} />
      {inbox.data && entries.length === 0 && <Empty>Inbox is empty.</Empty>}
      {entries.length > 0 && (
        <div className="tbl"><table>
          <thead><tr><th><input type="checkbox" aria-label="select all" checked={sel.size === entries.length} onChange={(e) => setSel(e.target.checked ? new Set(entries.map((x) => x.path)) : new Set())} /></th><th>drop</th><th className="n">files</th><th className="n">size</th><th>state</th></tr></thead>
          <tbody>{entries.map((e) => (
            <tr key={e.path}><td><input type="checkbox" checked={sel.has(e.path)} onChange={() => toggle(e.path)} aria-label={'select ' + e.name} /></td>
              <td className="mono">{e.name}</td><td className="n">{e.n_files}</td><td className="n">{fmtBytes(e.bytes)}</td>
              <td>{e.settled ? <span className="chip ok">ready</span> : <span className="chip warn">still changing</span>}</td></tr>))}</tbody>
        </table></div>
      )}
      <div className="bar" style={{ marginTop: 12 }}>
        <button type="button" className="btn" disabled={job.busy || entries.length === 0} onClick={() => start(true)}>Preview classification{sel.size ? ` (${sel.size})` : ' (all)'}</button>
        <button type="button" className="btn primary" disabled={job.busy || entries.length === 0} onClick={() => start(false)}>Ingest{sel.size ? ` (${sel.size})` : ' (all)'}</button>
        <span className="sp" />
        <details><summary className="muted">force a target (only when you have verified the header yourself)</summary>
          <div className="bar"><input type="text" placeholder="trial id" value={forceTrial} onChange={(e) => setForceTrial(e.target.value)} style={{ flex: '0 1 160px' }} /><input type="text" placeholder="case id" value={forceCase} onChange={(e) => setForceCase(e.target.value)} style={{ flex: '0 1 160px' }} /></div>
        </details>
        <button type="button" className="btn" onClick={() => inbox.reload()}>refresh</button>
      </div>
      <JobBox job={job.job} error={job.submitError} />
      {job.job?.status === 'done' && summaryOf(job.job) && <ReportView name={summaryOf(job.job)!} />}

      <h2>Import from a folder</h2>
      <p className="muted">Point at any folder on this PC or a share (an old archive, a USB stick, a site export). Every file in it is classified from its DICOM header and copied into the store. The folder itself is never changed. Files already in the store are skipped.</p>
      <div className="bar">
        <input id="import-folder" type="text" placeholder="e.g. D:\archive\HN009 site exports  or  \\nas\old_data" value={folder} onChange={(e) => setFolder(e.target.value)} />
        <button type="button" className="btn" disabled={imp.busy || !folder.trim()} onClick={() => imp.submit(() => api.importFolder({ path: folder.trim(), dry_run: true, trial: impTrial || undefined, case: impCase || undefined }))}>Preview</button>
        <button type="button" className="btn primary" disabled={imp.busy || !folder.trim()} onClick={() => imp.submit(() => api.importFolder({ path: folder.trim(), trial: impTrial || undefined, case: impCase || undefined }))}>Import</button>
      </div>
      <details><summary className="muted">force a target for everything in the folder (only when you have verified the headers yourself)</summary>
        <div className="bar"><input type="text" placeholder="trial id" value={impTrial} onChange={(e) => setImpTrial(e.target.value)} style={{ flex: '0 1 160px' }} /><input type="text" placeholder="case id" value={impCase} onChange={(e) => setImpCase(e.target.value)} style={{ flex: '0 1 160px' }} /></div>
      </details>
      <JobBox job={imp.job} error={imp.submitError} />
      {imp.job?.status === 'done' && summaryOf(imp.job) && <ReportView name={summaryOf(imp.job)!} />}
      <p className="muted" style={{ marginTop: 16 }}>All summaries: <Link to="/reports">Summaries</Link></p>
    </>
  )
}
