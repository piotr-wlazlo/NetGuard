import { NavLink, Outlet } from 'react-router-dom'

import { useAlerts, useHealth } from '../api/hooks'
import { Icon } from './icons'

export function Layout() {
  const health = useHealth()
  const alerts = useAlerts()

  const newAlerts = alerts.data?.filter((alert) => alert.status === 'NEW').length ?? 0
  const healthState = health.isError ? 'offline' : health.isSuccess ? 'online' : 'loading'
  const healthLabel = { online: 'API online', offline: 'API niedostępne', loading: 'Łączenie z API…' }[healthState]

  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="NetGuard — strona główna">
          <img className="brand-crest" src="/logo.svg" alt="" width={67} height={46} />
          <span className="brand-name">NetGuard</span>
        </NavLink>

        <nav className="nav" aria-label="Główna nawigacja">
          <NavLink to="/" end>
            <Icon name="dashboard" /> Przegląd
          </NavLink>
          <NavLink to="/alerts">
            <Icon name="bell" /> Alerty
            {newAlerts > 0 && (
              <span className="nav-count" aria-label={`${newAlerts} nowych`}>
                {newAlerts > 99 ? '99+' : newAlerts}
              </span>
            )}
          </NavLink>
          <NavLink to="/analysis">
            <Icon name="play" /> Analiza
          </NavLink>
          <NavLink to="/settings">
            <Icon name="sliders" /> Konfiguracja
          </NavLink>
        </nav>

        <div className="sidebar-foot">
          <span className="health" data-state={healthState} role="status">
            {healthLabel}
          </span>
          <span className="version">NetGuard 0.1 · prototyp</span>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
