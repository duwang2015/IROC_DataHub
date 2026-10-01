import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useApi } from '../api/hooks'
import { Chips, Empty, ErrorBox } from '../components/common'

export function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const r = useApi(() => api.search(q), [q])
  return (
    <>
      <h1>Search: <span className="mono">{q}</span></h1>
      <ErrorBox error={r.error} />
      {r.data && r.data.trials.length === 0 && r.data.cases.length === 0 && <Empty>Nothing matches “{q}”.</Empty>}
      {r.data && r.data.trials.length > 0 && (<><h2>Trials</h2>{r.data.trials.map((t) => <div key={t.id}><Link to={'/trials/' + encodeURIComponent(t.id)}>{t.id}</Link> <span className="muted">{t.name}</span></div>)}</>)}
      {r.data && r.data.cases.length > 0 && (
        <><h2>Cases</h2>
          <div className="tbl"><table><thead><tr><th>trial</th><th>case</th><th>modalities</th></tr></thead>
            <tbody>{r.data.cases.map((c) => <tr key={c.trial + c.case_id}><td>{c.trial}</td><td className="mono"><Link to={`/cases/${encodeURIComponent(c.trial)}/${encodeURIComponent(c.case_id)}`}>{c.case_id}</Link></td><td><Chips mods={c.modalities} /></td></tr>)}</tbody></table></div></>
      )}
    </>
  )
}
