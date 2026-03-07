export declare const metrics: {
    detectionsTotal: number;
    averageDetectionLatencyMs: number;
    activeRecordings: number;
    diskUsageBytes: number;
};
export declare function incrementDetections(): void;
export declare function setDetectionLatency(ms: number): void;
export declare function setActiveRecordings(n: number): void;
export declare function setDiskUsage(bytes: number): void;
export declare function renderMetrics(): string;
//# sourceMappingURL=index.d.ts.map