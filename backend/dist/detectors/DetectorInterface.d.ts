export interface DetectionResult {
    confidence: number;
    startTime: Date;
    endTime: Date;
    detectorId: string;
    label: string;
    metadata?: Record<string, unknown>;
}
export interface HealthStatus {
    healthy: boolean;
    message: string;
    latencyMs?: number;
}
export interface DetectorConfig {
    threshold: number;
    sensitivity: number;
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
//# sourceMappingURL=DetectorInterface.d.ts.map