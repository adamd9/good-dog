import React, { useEffect, useState } from 'react';
import { getEvents } from '../api/client';
import type { BarkEvent } from '../types';
import DetectorHealth from '../components/DetectorHealth';
import LiveFeed from '../components/LiveFeed';
import EventCard from '../components/EventCard';

interface Props {
  onNavigate: (page: string, id?: string) => void;
}

const Dashboard: React.FC<Props> = ({ onNavigate }) => {
  const [recentEvents, setRecentEvents] = useState<BarkEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingEvents(true);
    getEvents({ limit: 5, page: 1 })
      .then((res) => { setRecentEvents(res.events); setEventsError(null); })
      .catch((e: unknown) => setEventsError(e instanceof Error ? e.message : 'Failed to load events'))
      .finally(() => setLoadingEvents(false));
  }, []);

  return (
    <div className="page dashboard">
      <h1 className="page__title">Dashboard</h1>

      <section className="dashboard__section" aria-labelledby="health-heading">
        <h2 id="health-heading" className="section-heading">System Health</h2>
        <DetectorHealth />
      </section>

      <div className="dashboard__grid">
        <section className="dashboard__section" aria-labelledby="live-heading">
          <h2 id="live-heading" className="section-heading">Live Feed</h2>
          <LiveFeed onEventClick={(id) => onNavigate('event', id)} />
        </section>

        <section className="dashboard__section" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="section-heading">Recent Events</h2>
          {loadingEvents && <p className="loading">Loading events…</p>}
          {eventsError && (
            <p className="error-msg" role="alert">⚠ {eventsError}</p>
          )}
          {!loadingEvents && !eventsError && recentEvents.length === 0 && (
            <p className="empty-msg">No events recorded yet.</p>
          )}
          <ul className="event-list" aria-label="Recent bark events">
            {recentEvents.map((ev) => (
              <li key={ev.id}>
                <EventCard
                  event={ev}
                  onClick={() => onNavigate('event', ev.id)}
                />
              </li>
            ))}
          </ul>
          {recentEvents.length > 0 && (
            <button
              className="btn btn--link"
              onClick={() => onNavigate('events')}
              type="button"
            >
              View all events →
            </button>
          )}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
