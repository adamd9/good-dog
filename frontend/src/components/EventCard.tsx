import React from 'react';
import type { BarkEvent } from '../types';
import AudioPlayer from './AudioPlayer';
import { getAudioUrl } from '../api/client';

interface Props {
  event: BarkEvent;
  compact?: boolean;
  onClick?: () => void;
}

function confidenceClass(c: number): string {
  if (c >= 0.8) return 'confidence-high';
  if (c >= 0.5) return 'confidence-medium';
  return 'confidence-low';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const EventCard: React.FC<Props> = ({ event, compact = false, onClick }) => {
  const pct = Math.round(event.confidence * 100);

  return (
    <div
      className={`event-card ${compact ? 'event-card--compact' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      aria-label={`Bark event at ${formatDate(event.startTime)}, confidence ${pct}%`}
    >
      <div className="event-card__header">
        <span className="event-card__time">{formatDate(event.startTime)}</span>
        <span className={`event-card__confidence ${confidenceClass(event.confidence)}`}>
          {pct}%
        </span>
      </div>

      {!compact && (
        <div className="event-card__body">
          <div className="event-card__meta">
            <span className="event-card__detector">
              Detector: <strong>{event.detectorId}</strong>
            </span>
            <span className="event-card__reviewed">
              {event.reviewed ? (
                <span className="badge badge--success">Reviewed</span>
              ) : (
                <span className="badge badge--warning">Unreviewed</span>
              )}
            </span>
            {event.label && (
              <span className="badge badge--info">{event.label}</span>
            )}
          </div>

          {event.audioFilePath && (
            <div className="event-card__audio">
              <AudioPlayer src={getAudioUrl(event.audioFilePath)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EventCard;
