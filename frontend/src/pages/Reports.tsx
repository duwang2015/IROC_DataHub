import { useState } from 'react'
import { api } from '../api/client'
import { useApi } from '../api/hooks'
import { Empty, ErrorBox, PathLink } from '../components/common'
import { fmtTime } from '../components/format'
import type { ReportRow } from '../api/types'

/** List of per-run summaries with an inline reader. */
export function ReportsPage() {
  const list = useApi(() => api.reports(50), [])
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      <h1>Run summaries</h1>
      <p className="muted">One summary per inbox ingest or folder import: what was filed where, what was skipped as duplicate, what needs review. Also saved as Markdown under <span className="mono">_reports</span> in the store.</p>
      <ErrorBox error={list.error} />
      {list.data && list.data.length === 0 && <Empty>No runs yet.</Empty>}
      {list.data && list.data.length > 0 && <ReportTable rows={list.data} open={open} setOpen={setOpen} />}
      {open && <ReportView name={open} />}
    </>
  )
}

export function ReportTable({ rows, open, setOpen }: { rows: ReportRow[]; open: string | null; setOpen: (n: string | null) => void }) {
  return (
    <div className="tbl"><table>
      <thead><tr><th>when</th><th>run</th><th>by</th><th className="n">scanned</th><th className="n">batches</th><th className="n">filed</th><th className="n">dup</th><th className="n">held</th><th className="n">fail</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.name} className={'link' + (open === r.name ? ' cur' : '')} onClick={() => setOpen(open === r.name ? null : r.name)}>
          <td className="mono">{fmtTime(r.started_at)}</td>
          <td>{r.mode}{r.dry_run ? <span className="chip" style={{ marginLeft: 6 }}>dry run</span> : ''}</td>
          <td>{r.user}</td>
          <td className="n">{r.totals.files_scanned}</td><td className="n">{r.totals.batches}</td><td className="n">{r.totals.files_filed}</td>
          <td className="n">{r.totals.duplicates}</td>
          <td className="n">{r.totals.held_groups > 0 ? <span className="chip bad">{r.totals.held_groups}</span> : 0}</td>
          <td className="n">{r.totals.failures > 0 ? <span className="chip bad">{r.totals.failures}</span> : 0}</td>
        </tr>))}</tbody>
    </table></div>
  )
}

export function ReportView({ name }: { name: string }) {
  const r = useApi(() => api.report(name), [name])
  if (r.error) return <ErrorBox error={r.error} />
  if (!r.data) return <p className="muted">loading…</p>
  return (
    <div style={{ marginTop: 12 }}>
      <PathLink path={r.data.path} />
      <pre className="log" style={{ maxHeight: 'none', marginTop: 6 }}>{r.data.markdown}</pre>
    </div>
  )
}
