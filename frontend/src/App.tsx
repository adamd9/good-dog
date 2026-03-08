import React, { useState } from 'react';
import Dashboard from './pages/Dashboard';
import EventList from './pages/EventList';
import EventDetail from './pages/EventDetail';
import Settings from './pages/Settings';

type Page = 'dashboard' | 'events' | 'event' | 'settings';

function getInitialPage(): Page {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'events') return 'events';
  if (hash === 'settings') return 'settings';
  if (hash.startsWith('event/')) return 'event';
  return 'dashboard';
}

function getInitialEventId(): string | null {
  const hash = window.location.hash.replace('#', '');
  if (hash.startsWith('event/')) return hash.split('/')[1] ?? null;
  return null;
}

const App: React.FC = () => {
  const [page, setPage] = useState<Page>(getInitialPage);
  const [currentEventId, setCurrentEventId] = useState<string | null>(getInitialEventId);

  const navigate = (dest: string, id?: string) => {
    if (dest === 'event' && id) {
      setCurrentEventId(id);
      setPage('event');
      window.location.hash = `event/${id}`;
    } else if (dest === 'events') {
      setPage('events');
      window.location.hash = 'events';
    } else if (dest === 'settings') {
      setPage('settings');
      window.location.hash = 'settings';
    } else {
      setPage('dashboard');
      window.location.hash = 'dashboard';
    }
  };

  const navLinks: { label: string; dest: Page }[] = [
    { label: 'Dashboard', dest: 'dashboard' },
    { label: 'Events', dest: 'events' },
    { label: 'Settings', dest: 'settings' },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <a
            href="#dashboard"
            className="app-header__logo"
            onClick={(e) => { e.preventDefault(); navigate('dashboard'); }}
            aria-label="GoodDog home"
          >
            🐕 GoodDog
          </a>
          <nav className="app-nav" aria-label="Main navigation">
            {navLinks.map(({ label, dest }) => (
              <a
                key={dest}
                href={`#${dest}`}
                className={`app-nav__link ${page === dest || (page === 'event' && dest === 'events') ? 'app-nav__link--active' : ''}`}
                onClick={(e) => { e.preventDefault(); navigate(dest); }}
                aria-current={page === dest ? 'page' : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="app-main" id="main-content">
        {page === 'dashboard' && <Dashboard onNavigate={navigate} />}
        {page === 'events' && <EventList onNavigate={navigate} />}
        {page === 'event' && currentEventId && (
          <EventDetail
            eventId={currentEventId}
            onBack={() => navigate('events')}
          />
        )}
        {page === 'settings' && <Settings />}
      </main>
    </div>
  );
};

export default App;
