import { Link } from 'react-router-dom'

import { EmptyBlock } from '../components/States'
import { usePageTitle } from '../lib/use-page-title'

export function NotFound() {
  usePageTitle('Nie znaleziono strony')
  return (
    <div className="page">
      <div className="card">
        <EmptyBlock icon="search" title="Nie znaleziono strony">
          <p>Adres, który otworzyłeś, nie istnieje.</p>
          <Link to="/" className="btn btn-primary">
            Wróć do przeglądu
          </Link>
        </EmptyBlock>
      </div>
    </div>
  )
}
