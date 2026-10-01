// The only module that talks to the backend.
import type * as T from './types'

export class ApiFailure extends Error {
  code: string
  status: number
  constructor(status: number, code: string, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function call<R>(method: string, path: string, body?: unknown, params?: Record<string, unknown>): Promise<R> {
  const url = new URL(path, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '' || v === false || v === null) continue
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)))
      else url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let detail: T.ApiError = { code: 'http_' + res.status, message: res.statusText }
    try {
      const j = await res.json()
      if (j && j.detail) detail = typeof j.detail === 'string' ? { code: 'error', message: j.detail } : j.detail
    } catch { /* keep default */ }
    throw new ApiFailure(res.status, detail.code, detail.message)
  }
  return (await res.json()) as R
}

export const api = {
  health: () => call<T.Health>('GET', '/api/health'),
  workspaces: () => call<T.Workspaces>('GET', '/api/workspaces'),
  addWorkspace: (b: { root: string; label?: string; create?: boolean; trials?: string[] }) => call<{ root: string }>('POST', '/api/workspaces', b),
  setActive: (root: string) => call<{ root: string }>('POST', '/api/workspaces/active', { root }),
  removeWorkspace: (root: string) => call<{ ok: boolean }>('DELETE', '/api/workspaces', undefined, { root }),
  overview: () => call<T.Overview>('GET', '/api/overview'),
  trials: () => call<T.Trial[]>('GET', '/api/trials'),
  cases: (trial: string, p: { q?: string; modality?: string[]; missing?: string[]; holding?: boolean; no_module?: string }) =>
    call<T.CaseList>('GET', `/api/trials/${enc(trial)}/cases`, undefined, p),
  caseDetail: (trial: string, caseId: string) => call<T.CaseDetail>('GET', `/api/cases/${enc(trial)}/${enc(caseId)}`),
  search: (q: string) => call<T.SearchResult>('GET', '/api/search', undefined, { q }),
  holding: () => call<T.HoldingItem[]>('GET', '/api/holding'),
  holdingDetail: (id: string) => call<T.HoldingDetail>('GET', `/api/holding/${enc(id)}`),
  resolve: (id: string, b: { groups?: number[]; all?: boolean; trial?: string; case?: string; discard?: boolean; force_new_batch?: boolean }) =>
    call<T.Job>('POST', `/api/holding/${enc(id)}/resolve`, b),
  inbox: () => call<T.Inbox>('GET', '/api/inbox'),
  ingest: (b: { sources?: string[]; dry_run?: boolean; trial?: string; case?: string; keep_source?: boolean }) => call<T.Job>('POST', '/api/ingest', b),
  log: (trial: string, p: { case?: string; action?: string; since?: string; limit?: number }) => call<T.TrialLog>('GET', `/api/log/${enc(trial)}`, undefined, p),
  note: (trial: string, message: string, caseId?: string) => call<T.LogEntry>('POST', `/api/log/${enc(trial)}/note`, { message, case: caseId ?? '' }),
  setCurrent: (trial: string, caseId: string, batch: string, pin: boolean) => call<{ ok: boolean }>('POST', `/api/cases/${enc(trial)}/${enc(caseId)}/current`, { batch, pin }),
  exportCases: (b: { trial: string; cases?: string[]; dest: string; derived?: string; current_only?: boolean; note?: string }) => call<T.Job>('POST', '/api/export', b),
  run: (b: { producer: string; trial: string; case: string; batch?: string; force?: boolean; skip_rtstruct?: boolean; skip_suv?: boolean; no_resample?: boolean }) => call<T.Job>('POST', '/api/run', b),
  reindex: (full = false) => call<T.Job>('POST', '/api/reindex', undefined, { full }),
  verify: (trial?: string) => call<T.Job>('POST', '/api/verify', undefined, { trial }),
  openFolder: (path: string) => call<{ ok: boolean }>('POST', '/api/open-folder', { path }),
  config: () => call<T.Config>('GET', '/api/config'),
  saveConfig: (text: string) => call<{ ok: boolean; trials: string[] }>('PUT', '/api/config', { text }),
  jobs: () => call<T.Job[]>('GET', '/api/jobs'),
  job: (id: string) => call<T.Job>('GET', `/api/jobs/${enc(id)}`),
}

function enc(s: string): string {
  return encodeURIComponent(s)
}
