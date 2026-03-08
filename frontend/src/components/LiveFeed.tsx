import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { BarkEvent } from '../types';
import EventCard from './EventCard';

interface Props {
  onEventClick?: (id: string) => void;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'paused';

function buildWsUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    return apiUrl.replace(/^http/, 'ws') + '/events';
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://localhost:4000/events`;
}

const MAX_EVENTS = 50;
const INITIAL_BACKOFF = 1000;
const MAX_BACKOFF = 30000;

const LiveFeed: React.FC<Props> = ({ onEventClick }) => {
  const [events, setEvents] = useState<BarkEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [paused, setPaused] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);

  pausedRef.current = paused;

  const connect = useCallback(() => {
    if (pausedRef.current) return;

    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      setStatus('connected');
      backoffRef.current = INITIAL_BACKOFF;
    };

    ws.onmessage = (msg) => {
      if (pausedRef.current) return;
      try {
        const event = JSON.parse(msg.data as string) as BarkEvent;
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (!pausedRef.current) {
        timerRef.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
          connect();
        }, backoffRef.current);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    if (next) {
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      setStatus('paused');
    } else {
      backoffRef.current = INITIAL_BACKOFF;
      connect();
    }
  };

  const statusLabel: Record<ConnectionStatus, string> = {
    connecting: '🟡 Connecting…',
    connected: '🟢 Live',
    disconnected: '🔴 Disconnected – reconnecting…',
    paused: '⏸ Paused',
  };

  return (
    <section className="live-feed" aria-label="Live bark event feed">
      <div className="live-feed__toolbar">
        <span
          className={`live-feed__status live-feed__status--${status}`}
          aria-live="polite"
        >
          {statusLabel[status]}
        </span>
        <button
          className="btn btn--sm"
          onClick={togglePause}
          aria-pressed={paused}
          type="button"
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {events.length === 0 ? (
        <p className="live-feed__empty">No events received yet.</p>
      ) : (
        <ul className="live-feed__list" aria-label="Recent bark events">
          {events.map((ev) => (
            <li key={ev.id} className="live-feed__item">
              <EventCard
                event={ev}
                compact
                onClick={onEventClick ? () => onEventClick(ev.id) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default LiveFeed;
