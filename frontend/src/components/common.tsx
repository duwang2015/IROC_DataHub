import type { ReactNode } from 'react'
import { api, type ApiFailure } from '../api/client'
import type { Job } from '../api/types'
import { BADGE, fmtTime } from './format'

const HIGHLIGHT = new Set(['CT', 'MR', 'PT', 'RTSTRUCT', 'RTPLAN', 'RTDOSE'])

export function Chips({ mods }: { mods: string[] }) {
  return (
    <span className="chips">
      {mods.map((m) => <span key={m} className={HIGHLIGHT.has(m) ? 'chip on' : 'chip'}>{BADGE[m] ?? m}</span>)}
    </span>
  )
}

/** A path shown as text plus an "open" action that asks the backend to open Explorer. */
export function PathLink({ path, label }: { path: string; label?: string }) {
  const open = () => api.openFolder(path).catch((e: Error) => alert(e.message))
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="mono muted" style={{ wordBreak: 'break-all' }}>{label ?? path}</span>
      <button type="button" className="plink" onClick={open} title={path}>open folder</button>
    </span>
  )
}

export function ErrorBox({ error }: { error: ApiFailure | string | null }) {
  if (!error) return null
  const msg = typeof error === 'string' ? error : error.message
  return <div className="err">{msg}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Tile({ v, k, tone }: { v: ReactNode; k: string; tone?: 'warn' | 'bad' }) {
  return <div className={'tile ' + (tone ?? '')}><div className="v">{v}</div><div className="k">{k}</div></div>
}

export function JobBox({ job, error }: { job: Job | null; error?: string | null }) {
  if (error) return <div className="err">{error}</div>
  if (!job) return null
  const tail = job.progress.slice(-12)
  return (
    <div className={'job ' + job.status}>
      <div className="row">
        <b>{job.kind}</b>
        <span className={'chip ' + (job.status === 'done' ? 'ok' : job.status === 'failed' ? 'bad' : '')}>{job.status}</span>
        <span className="muted">{fmtTime(job.started_at)}</span>
      </div>
      {tail.length > 0 && <pre className="log" style={{ marginTop: 6, maxHeight: 220 }}>{tail.join('\n')}</pre>}
      {job.error && <pre className="log" style={{ marginTop: 6, color: 'var(--bad)' }}>{job.error.split('\n')[0]}</pre>}
      {job.status === 'done' && job.result !== null && job.result !== undefined && (
        <JobResult result={job.result} />
      )}
    </div>
  )
}

function JobResult({ result }: { result: unknown }) {
  if (typeof result === 'object' && result !== null && 'summary' in result) {
    return <pre className="log" style={{ marginTop: 6 }}>{String((result as { summary: string }).summary)}</pre>
  }
  return <pre className="log" style={{ marginTop: 6 }}>{JSON.stringify(result, null, 1)}</pre>
}
