"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metrics = void 0;
exports.incrementDetections = incrementDetections;
exports.setDetectionLatency = setDetectionLatency;
exports.setActiveRecordings = setActiveRecordings;
exports.setDiskUsage = setDiskUsage;
exports.renderMetrics = renderMetrics;
// Simple in-memory counters/gauges for Prometheus exposition format
exports.metrics = {
    detectionsTotal: 0,
    averageDetectionLatencyMs: 0,
    activeRecordings: 0,
    diskUsageBytes: 0,
};
function incrementDetections() { exports.metrics.detectionsTotal++; }
function setDetectionLatency(ms) { exports.metrics.averageDetectionLatencyMs = ms; }
function setActiveRecordings(n) { exports.metrics.activeRecordings = n; }
function setDiskUsage(bytes) { exports.metrics.diskUsageBytes = bytes; }
function renderMetrics() {
    return [
        `# HELP detections_total Total bark detections`,
        `# TYPE detections_total counter`,
        `detections_total ${exports.metrics.detectionsTotal}`,
        `# HELP average_detection_latency_ms Average detection latency`,
        `# TYPE average_detection_latency_ms gauge`,
        `average_detection_latency_ms ${exports.metrics.averageDetectionLatencyMs}`,
        `# HELP active_recordings Number of active recordings`,
        `# TYPE active_recordings gauge`,
        `active_recordings ${exports.metrics.activeRecordings}`,
        `# HELP disk_usage_bytes Disk usage in bytes`,
        `# TYPE disk_usage_bytes gauge`,
        `disk_usage_bytes ${exports.metrics.diskUsageBytes}`,
    ].join('\n');
}
//# sourceMappingURL=index.js.map