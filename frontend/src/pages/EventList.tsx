import React, { useEffect, useState, useCallback } from 'react';
import { getEvents } from '../api/client';
import type { BarkEvent, PaginatedEvents } from '../types';
import AudioPlayer from '../components/AudioPlayer';
import { getAudioUrl } from '../api/client';

interface Props {
  onNavigate: (page: string, id?: string) => void;
}

const PAGE_SIZE = 20;

const EventList: React.FC<Props> = ({ onNavigate }) => {
  const [data, setData] = useState<PaginatedEvents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reviewed, setReviewed] = useState<'all' | 'yes' | 'no'>('all');
  const [minConfidence, setMinConfidence] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params: Parameters<typeof getEvents>[0] = {
      page,
      limit: PAGE_SIZE,
    };
    if (from) params.from = new Date(from).toISOString();
    if (to) params.to = new Date(to).toISOString();
    if (reviewed !== 'all') params.reviewed = reviewed === 'yes';
    if (minConfidence > 0) params.minConfidence = minConfidence / 100;

    getEvents(params)
      .then((res) => { setData(res); setError(null); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load events'))
      .finally(() => setLoading(false));
  }, [page, from, to, reviewed, minConfidence]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const handleFilterChange = () => { setPage(1); };

  return (
    <div className="page event-list-page">
      <h1 className="page__title">Events</h1>

      <form
        className="filter-bar"
        onSubmit={(e) => { e.preventDefault(); handleFilterChange(); load(); }}
        aria-label="Filter events"
      >
        <div className="filter-bar__group">
          <label htmlFor="filter-from">From</label>
          <input
            id="filter-from"
            type="datetime-local"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
          />
        </div>
        <div className="filter-bar__group">
          <label htmlFor="filter-to">To</label>
          <input
            id="filter-to"
            type="datetime-local"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
          />
        </div>
        <div className="filter-bar__group">
          <label htmlFor="filter-reviewed">Reviewed</label>
          <select
            id="filter-reviewed"
            value={reviewed}
            onChange={(e) => { setReviewed(e.target.value as 'all' | 'yes' | 'no'); setPage(1); }}
          >
            <option value="all">All</option>
            <option value="yes">Reviewed</option>
            <option value="no">Unreviewed</option>
          </select>
        </div>
        <div className="filter-bar__group filter-bar__group--slider">
          <label htmlFor="filter-confidence">
            Min Confidence: {minConfidence}%
          </label>
          <input
            id="filter-confidence"
            type="range"
            min={0}
            max={100}
            value={minConfidence}
            onChange={(e) => { setMinConfidence(Number(e.target.value)); setPage(1); }}
          />
        </div>
        <button className="btn" type="submit">Apply</button>
      </form>

      {loading && <p className="loading">Loading events…</p>}
      {error && <p className="error-msg" role="alert">⚠ {error}</p>}

      {!loading && !error && data && (
        <>
          <p className="event-list-page__count">
            {data.total} event{data.total !== 1 ? 's' : ''} found
          </p>
          {data.events.length === 0 ? (
            <p className="empty-msg">No events match the current filters.</p>
          ) : (
            <div className="event-table" role="table" aria-label="Bark events">
              <div className="event-table__header" role="row">
                <span role="columnheader">Time</span>
                <span role="columnheader">Confidence</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Label</span>
                <span role="columnheader">Audio</span>
                <span role="columnheader">Actions</span>
              </div>
              {data.events.map((ev) => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  onView={() => onNavigate('event', ev.id)}
                />
              ))}
            </div>
          )}

          <div className="pagination" aria-label="Pagination">
            <button
              className="btn btn--sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              type="button"
              aria-label="Previous page"
            >
              ← Prev
            </button>
            <span className="pagination__info">
              Page {page} of {totalPages}
            </span>
            <button
              className="btn btn--sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              type="button"
              aria-label="Next page"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const EventRow: React.FC<{ event: BarkEvent; onView: () => void }> = ({ event, onView }) => {
  const pct = Math.round(event.confidence * 100);
  const confClass = pct >= 80 ? 'confidence-high' : pct >= 50 ? 'confidence-medium' : 'confidence-low';

  return (
    <div className="event-table__row" role="row">
      <span role="cell">{new Date(event.startTime).toLocaleString()}</span>
      <span role="cell" className={confClass}>{pct}%</span>
      <span role="cell">
        {event.reviewed
          ? <span className="badge badge--success">Reviewed</span>
          : <span className="badge badge--warning">Unreviewed</span>}
      </span>
      <span role="cell">{event.label || '—'}</span>
      <span role="cell">
        {event.audioFilePath
          ? <AudioPlayer src={getAudioUrl(event.audioFilePath)} label={`Audio for event ${event.id}`} />
          : '—'}
      </span>
      <span role="cell">
        <button className="btn btn--sm" onClick={onView} type="button">
          View
        </button>
      </span>
    </div>
  );
};

export default EventList;
