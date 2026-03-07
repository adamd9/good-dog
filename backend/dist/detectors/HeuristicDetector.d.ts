import { Detector, DetectorConfig, DetectionResult, HealthStatus } from './DetectorInterface';
export declare class HeuristicDetector implements Detector {
    readonly id: string;
    readonly name: string;
    config: DetectorConfig;
    constructor(id: string, config: DetectorConfig);
    detect(audioBuffer: Buffer, sampleRate: number): Promise<DetectionResult[]>;
    healthCheck(): Promise<HealthStatus>;
    updateConfig(partial: Partial<DetectorConfig>): void;
}
//# sourceMappingURL=HeuristicDetector.d.ts.map