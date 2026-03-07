// Simple in-memory counters/gauges for Prometheus exposition format
export const metrics = {
  detectionsTotal: 0,
  averageDetectionLatencyMs: 0,
  activeRecordings: 0,
  diskUsageBytes: 0,
};

export function incrementDetections(): void { metrics.detectionsTotal++; }
export function setDetectionLatency(ms: number): void { metrics.averageDetectionLatencyMs = ms; }
export function setActiveRecordings(n: number): void { metrics.activeRecordings = n; }
export function setDiskUsage(bytes: number): void { metrics.diskUsageBytes = bytes; }

export function renderMetrics(): string {
  return [
    `# HELP detections_total Total bark detections`,
    `# TYPE detections_total counter`,
    `detections_total ${metrics.detectionsTotal}`,
    `# HELP average_detection_latency_ms Average detection latency`,
    `# TYPE average_detection_latency_ms gauge`,
    `average_detection_latency_ms ${metrics.averageDetectionLatencyMs}`,
    `# HELP active_recordings Number of active recordings`,
    `# TYPE active_recordings gauge`,
    `active_recordings ${metrics.activeRecordings}`,
    `# HELP disk_usage_bytes Disk usage in bytes`,
    `# TYPE disk_usage_bytes gauge`,
    `disk_usage_bytes ${metrics.diskUsageBytes}`,
  ].join('\n');
}
