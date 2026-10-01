import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useApi, useJob } from '../api/hooks'
import { Chips, Empty, ErrorBox, JobBox, Tile } from '../components/common'
import { BADGE, fmtBytes, fmtTime } from '../components/format'

const MODS = ['CT', 'MR', 'PT', 'RTSTRUCT', 'RTPLAN', 'RTDOSE']

export function TrialPage() {
  const { trial = '' } = useParams()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [has, setHas] = useState('')
  const [missing, setMissing] = useState('')
  const [holding, setHolding] = useState(false)
  const [noMod, setNoMod] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [dest, setDest] = useState('')
  const [note, setNote] = useState('')
  const [derived, setDerived] = useState('')
  const exportJob = useJob()
  const stats = useApi(() => api.trials(), [trial])
  const list = useApi(() => api.cases(trial, { q, modality: has ? [has] : [], missing: missing ? [missing] : [], holding, no_module: noMod ? 'dcm2nii' : '' }), [trial, q, has, missing, holding, noMod])
  const t = stats.data?.find((x) => x.id === trial)
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const rows = list.data?.cases ?? []
  const doExport = () => exportJob.submit(() => api.exportCases({ trial, cases: [...sel], dest, derived: derived || undefined, note }))

  return (
    <>
      <h1>{trial} <span className="muted" style={{ fontWeight: 400 }}>{t?.name && t.name !== trial ? t.name : ''}</span></h1>
      <div className="row muted" style={{ marginBottom: 10 }}>
        <Link to={'/log/' + encodeURIComponent(trial)}>trial log</Link>
      </div>
      {t && (
        <div className="tiles">
          <Tile v={t.cases ?? 0} k="cases" /><Tile v={t.batches ?? 0} k="batches" /><Tile v={t.files ?? 0} k="files" /><Tile v={fmtBytes(t.bytes ?? 0)} k="on disk" />
          {MODS.map((m) => <Tile key={m} v={t.cases_by_modality?.[m] ?? 0} k={'with ' + (BADGE[m] ?? m)} />)}
          <Tile v={t.cases_by_module?.dcm2nii ?? 0} k="dcm2nii done" />
        </div>
      )}
      <div className="bar">
        <input id="case-filter" type="search" placeholder="case id…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="filter cases" />
        <label>has <select id="f-has" value={has} onChange={(e) => setHas(e.target.value)}><option value="">any</option>{MODS.map((m) => <option key={m} value={m}>{BADGE[m]}</option>)}</select></label>
        <label>missing <select id="f-missing" value={missing} onChange={(e) => setMissing(e.target.value)}><option value="">-</option>{MODS.map((m) => <option key={m} value={m}>{BADGE[m]}</option>)}</select></label>
        <label><input id="f-holding" type="checkbox" checked={holding} onChange={(e) => setHolding(e.target.checked)} /> has holding</label>
        <label><input id="f-nomod" type="checkbox" checked={noMod} onChange={(e) => setNoMod(e.target.checked)} /> no dcm2nii</label>
        <span className="sp" />
        <span className="muted">{rows.length} / {list.data?.total ?? 0} cases</span>
      </div>
      <ErrorBox error={list.error} />
      {list.data && rows.length === 0 && <Empty>No cases match. Drop data into the inbox to add cases.</Empty>}
      {rows.length > 0 && (
        <div className="tbl"><table>
          <thead><tr><th><input type="checkbox" aria-label="select all" checked={sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.case_id)) : new Set())} /></th><th>case</th><th>modalities</th><th>derived</th><th className="n">batches</th><th>current</th><th className="n">files</th><th>last ingest</th><th>flags</th></tr></thead>
          <tbody>{rows.map((c) => {
            const missingMods = ['CT', 'RTSTRUCT', 'RTDOSE'].filter((m) => !c.modalities.includes(m))
            return (
              <tr key={c.case_id} className="link" onClick={() => nav(`/cases/${encodeURIComponent(trial)}/${encodeURIComponent(c.case_id)}`)}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(c.case_id)} onChange={() => toggle(c.case_id)} aria-label={'select ' + c.case_id} /></td>
                <td className="mono"><b>{c.case_id}</b></td>
                <td><Chips mods={c.modalities} /></td>
                <td><span className="chips">{c.modules.map((m) => <span key={m} className="chip ok">{m}</span>)}</span></td>
                <td className="n">{c.n_batches}</td><td className="mono">{c.current}{c.pinned ? ' (pinned)' : ''}</td>
                <td className="n">{c.n_files}</td><td>{fmtTime(c.last_ingest)}</td>
                <td><span className="chips">{c.holding > 0 && <span className="chip bad">holding {c.holding}</span>}{missingMods.map((m) => <span key={m} className="chip bad">no {BADGE[m]}</span>)}</span></td>
              </tr>)
          })}</tbody>
        </table></div>
      )}
      <h2>Export selected ({sel.size})</h2>
      <div className="bar">
        <input id="export-dest" type="text" placeholder="destination folder, e.g. D:\work\autoseg_v1" value={dest} onChange={(e) => setDest(e.target.value)} />
        <label>what <select id="export-what" value={derived} onChange={(e) => setDerived(e.target.value)}><option value="">original (current batch)</option><option value="dcm2nii">derived: dcm2nii</option><option value="dicom_qc">derived: dicom_qc</option></select></label>
        <input id="export-note" type="text" placeholder="purpose (goes to the trial log)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn primary" disabled={!dest || sel.size === 0 || exportJob.busy} onClick={doExport}>Export</button>
      </div>
      <JobBox job={exportJob.job} error={exportJob.submitError} />
    </>
  )
}
