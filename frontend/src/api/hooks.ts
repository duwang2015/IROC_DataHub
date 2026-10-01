import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiFailure, api } from './client'
import type { Job } from './types'

export interface Loaded<R> { data: R | null; error: ApiFailure | null; loading: boolean; reload: () => void }

/** Fetch once per dependency change; `reload()` refetches. */
export function useApi<R>(fn: () => Promise<R>, deps: unknown[]): Loaded<R> {
  const [data, setData] = useState<R | null>(null)
  const [error, setError] = useState<ApiFailure | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    let alive = true
    setLoading(true)
    fnRef.current().then(
      (d) => { if (alive) { setData(d); setError(null); setLoading(false) } },
      (e: unknown) => { if (alive) { setError(e instanceof ApiFailure ? e : new ApiFailure(0, 'network', String(e))); setLoading(false) } },
    )
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}

/** Submit a job and poll it until it finishes. */
export function useJob(onDone?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  const stop = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null } }
  useEffect(() => stop, [])
  const poll = useCallback(function pollJob(id: string) {
    api.job(id).then((j) => {
      setJob(j)
      if (j.status === 'done' || j.status === 'failed') { stop(); onDone?.(j) }
      else timer.current = window.setTimeout(() => pollJob(id), 700)
    }, (e: unknown) => setSubmitError(String(e)))
  }, [onDone])
  const submit = useCallback(async (start: () => Promise<Job>) => {
    setSubmitError(null)
    try {
      const j = await start()
      setJob(j)
      poll(j.id)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    }
  }, [poll])
  const busy = !!job && (job.status === 'queued' || job.status === 'running')
  return { job, busy, submitError, submit, clear: () => { stop(); setJob(null); setSubmitError(null) } }
}
