export interface DetectionResult {
  confidence: number;        // 0-1
  startTime: Date;
  endTime: Date;
  detectorId: string;
  label: string;             // e.g. 'bark'
  metadata?: Record<string, unknown>;
}

export interface HealthStatus {
  healthy: boolean;
  message: string;
  latencyMs?: number;
}

export interface DetectorConfig {
  threshold: number;         // 0-1
  sensitivity: number;       // 0-1
  modelName: string;
  sampleRate: number;
  [key: string]: unknown;
}

export interface Detector {
  id: string;
  name: string;
  config: DetectorConfig;
  detect(audioBuffer: Buffer, sampleRate: number): Promise<DetectionResult[]>;
  healthCheck(): Promise<HealthStatus>;
  updateConfig(config: Partial<DetectorConfig>): void;
}
