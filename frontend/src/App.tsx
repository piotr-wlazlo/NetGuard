import { Route, Routes } from 'react-router-dom'

import { Layout } from './components/Layout'
import { Alerts } from './pages/Alerts'
import { Analysis } from './pages/Analysis'
import { Dashboard } from './pages/Dashboard'
import { NotFound } from './pages/NotFound'
import { Settings } from './pages/Settings'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="alerts/:id" element={<Alerts />} />
        <Route path="analysis" element={<Analysis />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
