import type {
  AppConfig,
  BarkEvent,
  Detector,
  DetectorConfig,
  HealthResponse,
  PaginatedEvents,
  Recording,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const API_KEY = import.meta.env.VITE_API_KEY || 'changeme';

const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

export function getDetectors(): Promise<Detector[]> {
  return request<Detector[]>('/api/detectors');
}

export function updateDetector(
  id: string,
  config: Partial<DetectorConfig>,
): Promise<Detector> {
  return request<Detector>(`/api/detectors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ config }),
  });
}

export function reprocessDetector(id: string): Promise<void> {
  return request<void>(`/api/detectors/${id}/reprocess`, { method: 'POST' });
}

export interface GetEventsParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  reviewed?: boolean;
  minConfidence?: number;
}

export function getEvents(params: GetEventsParams = {}): Promise<PaginatedEvents> {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.reviewed !== undefined) query.set('reviewed', String(params.reviewed));
  if (params.minConfidence !== undefined)
    query.set('minConfidence', String(params.minConfidence));
  const qs = query.toString();
  return request<PaginatedEvents>(`/api/events${qs ? `?${qs}` : ''}`);
}

export function getEvent(id: string): Promise<BarkEvent> {
  return request<BarkEvent>(`/api/events/${id}`);
}

export function labelEvent(id: string, label: string): Promise<BarkEvent> {
  return request<BarkEvent>(`/api/events/${id}/label`, {
    method: 'POST',
    body: JSON.stringify({ label }),
  });
}

export function getRecordings(from?: string, to?: string): Promise<Recording[]> {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const qs = query.toString();
  return request<Recording[]>(`/api/recordings${qs ? `?${qs}` : ''}`);
}

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>('/api/config');
}

export function updateConfig(config: Partial<AppConfig>): Promise<AppConfig> {
  return request<AppConfig>('/api/config', {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
}

export function getAudioUrl(filePath: string): string {
  return `${BASE_URL}/files/${filePath}`;
}
