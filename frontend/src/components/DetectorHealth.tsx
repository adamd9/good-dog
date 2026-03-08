import React, { useEffect, useState } from 'react';
import { getHealth } from '../api/client';
import type { HealthResponse } from '../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

const DetectorHealth: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetch = () => {
      getHealth()
        .then((h) => { if (!cancelled) { setHealth(h); setError(null); } })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    fetch();
    const id = setInterval(fetch, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loading) return <div className="health-card health-card--loading">Loading health…</div>;
  if (error) return (
    <div className="health-card health-card--error" role="alert">
      ⚠ Health check failed: {error}
    </div>
  );
  if (!health) return null;

  const diskPct = health.diskUsage
    ? Math.round((health.diskUsage.used / health.diskUsage.total) * 100)
    : null;

  return (
    <div className="health-card" aria-label="System health">
      <div className="health-card__row">
        <span className="health-card__label">System</span>
        <span className={`badge badge--${health.status === 'ok' ? 'success' : 'danger'}`}>
          {health.status === 'ok' ? '✓ Healthy' : '✗ Degraded'}
        </span>
        <span className={`badge badge--${health.db === 'ok' ? 'success' : 'danger'}`}>
          DB: {health.db}
        </span>
      </div>

      {health.diskUsage && diskPct !== null && (
        <div className="health-card__row">
          <span className="health-card__label">Disk</span>
          <div className="health-card__progress" role="progressbar" aria-valuenow={diskPct} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`health-card__progress-bar ${diskPct > 90 ? 'health-card__progress-bar--danger' : diskPct > 70 ? 'health-card__progress-bar--warning' : ''}`}
              style={{ width: `${diskPct}%` }}
            />
          </div>
          <span className="health-card__disk-text">
            {formatBytes(health.diskUsage.used)} / {formatBytes(health.diskUsage.total)} ({diskPct}%)
          </span>
        </div>
      )}

      {health.detectors.length > 0 && (
        <div className="health-card__detectors">
          <span className="health-card__label">Detectors</span>
          <ul className="health-card__detector-list">
            {health.detectors.map((d) => (
              <li key={d.detectorId} className="health-card__detector">
                <span className={`status-dot status-dot--${d.healthy ? 'ok' : 'err'}`} aria-hidden="true" />
                <span>{d.detectorId}</span>
                {d.latencyMs !== undefined && (
                  <span className="health-card__latency">{d.latencyMs}ms</span>
                )}
                {!d.healthy && <span className="health-card__msg">{d.message}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DetectorHealth;
