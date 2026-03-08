import React, { useEffect, useState } from 'react';
import { getEvent, labelEvent, reprocessDetector } from '../api/client';
import { getAudioUrl } from '../api/client';
import type { BarkEvent } from '../types';
import AudioPlayer from '../components/AudioPlayer';

interface Props {
  eventId: string;
  onBack: () => void;
}

const LABELS = [
  { value: 'bark', display: 'Bark ✓', cls: 'btn--success' },
  { value: 'false_positive', display: 'False Positive ✗', cls: 'btn--danger' },
  { value: 'false_negative', display: 'False Negative ⚠', cls: 'btn--warning' },
];

function confidenceColor(c: number): string {
  if (c >= 0.8) return 'var(--color-success)';
  if (c >= 0.5) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

const EventDetail: React.FC<Props> = ({ eventId, onBack }) => {
  const [event, setEvent] = useState<BarkEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labeling, setLabeling] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getEvent(eventId)
      .then((ev) => { setEvent(ev); setError(null); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load event'))
      .finally(() => setLoading(false));
  }, [eventId]);

  const handleLabel = (label: string) => {
    if (!event) return;
    setLabeling(true);
    setActionMsg(null);
    labelEvent(event.id, label)
      .then((updated) => {
        setEvent(updated);
        setActionMsg('Label saved.');
      })
      .catch((e: unknown) => setActionMsg(`Error: ${e instanceof Error ? e.message : 'Failed'}`))
      .finally(() => setLabeling(false));
  };

  const handleReprocess = () => {
    if (!event) return;
    setReprocessing(true);
    setActionMsg(null);
    reprocessDetector(event.detectorId)
      .then(() => setActionMsg('Reprocess started.'))
      .catch((e: unknown) => setActionMsg(`Error: ${e instanceof Error ? e.message : 'Failed'}`))
      .finally(() => setReprocessing(false));
  };

  if (loading) return <div className="page"><p className="loading">Loading event…</p></div>;
  if (error) return (
    <div className="page">
      <button className="btn btn--link" onClick={onBack} type="button">← Back</button>
      <p className="error-msg" role="alert">⚠ {error}</p>
    </div>
  );
  if (!event) return null;

  const pct = Math.round(event.confidence * 100);
  const duration = event.endTime
    ? ((new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 1000).toFixed(2)
    : null;

  return (
    <div className="page event-detail">
      <div className="event-detail__nav">
        <button className="btn btn--link" onClick={onBack} type="button">← Back to Events</button>
      </div>

      <h1 className="page__title">Event Detail</h1>

      <div className="event-detail__card">
        <dl className="event-detail__meta">
          <div className="event-detail__meta-row">
            <dt>Event ID</dt>
            <dd><code>{event.id}</code></dd>
          </div>
          <div className="event-detail__meta-row">
            <dt>Detector</dt>
            <dd>{event.detectorId}</dd>
          </div>
          <div className="event-detail__meta-row">
            <dt>Start Time</dt>
            <dd>{new Date(event.startTime).toLocaleString()}</dd>
          </div>
          <div className="event-detail__meta-row">
            <dt>End Time</dt>
            <dd>{event.endTime ? new Date(event.endTime).toLocaleString() : '—'}</dd>
          </div>
          {duration && (
            <div className="event-detail__meta-row">
              <dt>Duration</dt>
              <dd>{duration}s</dd>
            </div>
          )}
          <div className="event-detail__meta-row">
            <dt>Confidence</dt>
            <dd>
              <span
                className="event-detail__confidence"
                style={{ color: confidenceColor(event.confidence) }}
                aria-label={`Confidence ${pct}%`}
              >
                {pct}%
              </span>
              <div className="confidence-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="confidence-bar__fill"
                  style={{ width: `${pct}%`, backgroundColor: confidenceColor(event.confidence) }}
                />
              </div>
            </dd>
          </div>
          <div className="event-detail__meta-row">
            <dt>Threshold Used</dt>
            <dd>{event.thresholdUsed}</dd>
          </div>
          <div className="event-detail__meta-row">
            <dt>Reviewed</dt>
            <dd>{event.reviewed ? <span className="badge badge--success">Yes</span> : <span className="badge badge--warning">No</span>}</dd>
          </div>
          {event.label && (
            <div className="event-detail__meta-row">
              <dt>Label</dt>
              <dd><span className="badge badge--info">{event.label}</span></dd>
            </div>
          )}
        </dl>

        {event.audioFilePath && (
          <div className="event-detail__audio">
            <h2 className="section-heading">Recording</h2>
            <AudioPlayer src={getAudioUrl(event.audioFilePath)} label="Bark event recording" />
            <p className="event-detail__audio-hint">
              Audio includes pre/post buffer around detected bark.
            </p>
          </div>
        )}

        <div className="event-detail__actions">
          <h2 className="section-heading">Label This Event</h2>
          <div className="event-detail__label-btns" role="group" aria-label="Label event">
            {LABELS.map(({ value, display, cls }) => (
              <button
                key={value}
                className={`btn ${cls} ${event.label === value ? 'btn--active' : ''}`}
                onClick={() => handleLabel(value)}
                disabled={labeling}
                type="button"
                aria-pressed={event.label === value}
              >
                {display}
              </button>
            ))}
          </div>

          <div className="event-detail__reprocess">
            <button
              className="btn"
              onClick={handleReprocess}
              disabled={reprocessing}
              type="button"
            >
              {reprocessing ? 'Reprocessing…' : '🔄 Reprocess with current settings'}
            </button>
          </div>

          {actionMsg && (
            <p className="event-detail__action-msg" role="status">{actionMsg}</p>
          )}
        </div>

        {event.metadata && Object.keys(event.metadata).length > 0 && (
          <div className="event-detail__metadata">
            <h2 className="section-heading">Metadata</h2>
            <pre className="event-detail__json">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventDetail;
