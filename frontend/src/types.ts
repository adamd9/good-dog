export interface BarkEvent {
  id: string;
  detectorId: string;
  startTime: string;
  endTime: string;
  confidence: number;
  audioFilePath?: string;
  reviewed: boolean;
  label?: string;
  thresholdUsed: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Detector {
  id: string;
  name: string;
  type: string;
  config: DetectorConfig;
  enabled: boolean;
}

export interface DetectorConfig {
  threshold: number;
  sensitivity: number;
  modelName: string;
  sampleRate: number;
  [key: string]: unknown;
}

export interface DetectorHealth {
  healthy: boolean;
  message: string;
  latencyMs?: number;
  detectorId: string;
}

export interface HealthResponse {
  status: string;
  db: string;
  detectors: DetectorHealth[];
  diskUsage: {
    total: number;
    used: number;
    free: number;
  };
}

export interface Recording {
  id: string;
  filePath: string;
  startTime: string;
  endTime?: string;
  sizeBytes: number;
}

export interface AppConfig {
  preBufferSeconds: number;
  postBufferSeconds: number;
  retentionDays: number;
  detectorThreshold: number;
  webhookUrl?: string;
  emailAddress?: string;
}

export interface PaginatedEvents {
  events: BarkEvent[];
  total: number;
  page: number;
  limit: number;
}
