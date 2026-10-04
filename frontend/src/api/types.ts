// Response shapes of /api. Keep in step with backend/iroc_datahub/api.py.
export interface ApiError { code: string; message: string }

export interface Health { version: string; workspace: string | null; label: string | null; store_ok: boolean; jobs_running: number }
export interface Workspace { root: string; label: string; last_opened: string; exists: boolean }
export interface Workspaces { active: string | null; workspaces: Workspace[] }

export interface TrialStats {
  id: string; name: string; site?: string; kind?: 'trial' | 'source'; cases: number; batches: number; files: number; bytes: number;
  cases_by_modality: Record<string, number>; cases_by_module: Record<string, number>; last_ingest: string | null
}
export interface Stats { trials: TrialStats[]; holding_open: number; last_ingest: Record<string, unknown> | null }
export interface LogEntry { id?: number; trial_id: string; case_id: string | null; at: string; username: string; host: string; action: string; message: string }
export interface InboxEntry { name: string; path: string; is_dir: boolean; n_files: number; bytes: number; settled: boolean }
export interface HoldingRow { ingest_id: string; group_no: number; reason: string; created_at: string; resolved_at?: string | null }
export interface Overview {
  root: string; stats: Stats; holding: HoldingRow[]; inbox: InboxEntry[];
  lock: Record<string, string> | null; recent_log: LogEntry[]; jobs: Job[];
  trials_config: { id: string; name: string; site: string; kind: 'trial' | 'source' }[]; sites: string[];
  last_summary: ReportRow | null
}
export interface Trial extends Partial<TrialStats> { id: string; name: string; site: string; kind: 'trial' | 'source' }
export interface SiteGroup { site: string; cases: number; files: number; bytes: number; collections: { id: string; name: string; kind: 'trial' | 'source'; site: string; cases: number; batches: number; files: number; bytes: number }[] }
export interface CaseSummary {
  trial: string; case_id: string; modalities: string[]; modules: string[]; n_batches: number;
  current: string; pinned: boolean; last_ingest: string | null; n_files: number; holding: number
}
export interface CaseList { trial: string; total: number; cases: CaseSummary[] }
export interface Series { id: string; name: string; modality: string; series_number: number | null; series_description: string; study_date: string; n_instances: number; rel_dir: string; path: string }
export interface Doc { rel_path: string; name: string; kind: string; size: number; path: string }
export interface Batch { id: string; name: string; seq: number; kind: string; ingest_id: string; source: string; ingested_at: string; n_files: number; total_bytes: number; current: boolean; path: string; series: Series[]; documents: Doc[] }
export interface Run { id: string; module: string; version: string; run_name: string; status: string; started_at: string; finished_at: string | null; path: string; files: { name: string; kind: string; size: number; path: string }[] }
export interface HoldingItem { ingest_id: string; group_no: number; reason: string; created_at: string; suggested_trial: string | null; suggested_case: string | null; notes: string[]; summary: string; source: string; path: string; report: string }
export interface CaseDetail {
  trial: string; case_id: string; pk: string; site: string; kind: 'trial' | 'source'; path: string; notes_path: string; current: string; pinned: boolean;
  batches: Batch[]; runs: Run[]; notes: { name: string; size: number; path: string }[];
  holding: (HoldingRow & { decision: Record<string, unknown>; report: string })[]; log: LogEntry[]
}
export interface SearchResult { cases: { trial: string; case_id: string; site: string; kind: string; modalities: string[] }[]; trials: { id: string; name: string }[] }
export interface Evidence { category: string; source: string; trial: string | null; case: string | null; detail: string }
export interface HoldingGroup { group_no: number; dir: string; reason: string; summary: string; present: boolean; decision: { trial: string | null; case: string | null; notes: string[]; evidence: Evidence[] }; files: string[] }
export interface HoldingDetail { report: { ingest_id: string; source: string; groups: HoldingGroup[] }; markdown: string; path: string; trials: string[] }
export interface Inbox { path: string; entries: InboxEntry[]; settle_seconds: number }
export interface TrialLog { trial: string; path: string; entries: LogEntry[] }
export interface ReportRow { name: string; mode: string; started_at: string; finished_at?: string; user: string; dry_run: boolean; path: string; totals: { drops: number; files_scanned: number; batches: number; files_filed: number; duplicates: number; held_groups: number; failures: number; cases: string[] } }
export interface Report { name: string; path: string; markdown: string; data: unknown }
export interface Job { id: string; kind: string; status: 'queued' | 'running' | 'done' | 'failed'; created_at: string; started_at: string | null; finished_at: string | null; progress: string[]; result: unknown; error: string | null }
export interface Config { path: string; text: string }
