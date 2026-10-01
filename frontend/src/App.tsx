import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { CasePage } from './pages/Case'
import { Dashboard } from './pages/Dashboard'
import { HoldingPage } from './pages/Holding'
import { InboxPage } from './pages/Inbox'
import { LogPage } from './pages/Log'
import { SearchPage } from './pages/Search'
import { SettingsPage } from './pages/Settings'
import { TrialPage } from './pages/Trial'

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trials/:trial" element={<TrialPage />} />
        <Route path="/cases/:trial/:caseId" element={<CasePage />} />
        <Route path="/holding" element={<HoldingPage />} />
        <Route path="/holding/:ingestId" element={<HoldingPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/log/:trial" element={<LogPage />} />
        <Route path="/log" element={<LogPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
