"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeuristicDetector = void 0;
class HeuristicDetector {
    constructor(id, config) {
        this.name = 'Heuristic Bark Detector';
        this.id = id;
        this.config = { ...config };
    }
    async detect(audioBuffer, sampleRate) {
        if (audioBuffer.length < 2)
            return [];
        const sampleCount = Math.floor(audioBuffer.length / 2);
        let sumSq = 0;
        let sumAbs = 0;
        let weightedSum = 0;
        for (let i = 0; i < sampleCount; i++) {
            const sample = audioBuffer.readInt16LE(i * 2);
            sumSq += sample * sample;
            const mag = Math.abs(sample);
            sumAbs += mag;
            weightedSum += mag * i;
        }
        const rms = Math.sqrt(sumSq / sampleCount);
        const normalizedRms = rms / 32768;
        const spectralCentroid = sumAbs > 0 ? weightedSum / sumAbs : 0;
        const effectiveThreshold = this.config.threshold * this.config.sensitivity;
        if (normalizedRms <= effectiveThreshold)
            return [];
        const confidence = Math.min(normalizedRms / effectiveThreshold, 1.0);
        const now = new Date();
        const durationMs = (audioBuffer.length / 2 / sampleRate) * 1000;
        const startTime = new Date(now.getTime() - durationMs);
        return [
            {
                confidence,
                startTime,
                endTime: now,
                detectorId: this.id,
                label: 'bark',
                metadata: { normalizedRms, spectralCentroid },
            },
        ];
    }
    async healthCheck() {
        return { healthy: true, message: 'Heuristic detector is healthy', latencyMs: 0 };
    }
    updateConfig(partial) {
        this.config = { ...this.config, ...partial };
    }
}
exports.HeuristicDetector = HeuristicDetector;
//# sourceMappingURL=HeuristicDetector.js.map