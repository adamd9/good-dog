import { HeuristicDetector } from '../src/detectors/HeuristicDetector';

describe('HeuristicDetector', () => {
  let detector: HeuristicDetector;

  beforeEach(() => {
    detector = new HeuristicDetector('test-id', {
      threshold: 0.6,
      sensitivity: 1.0,
      modelName: 'heuristic-v1',
      sampleRate: 16000,
    });
  });

  it('returns no detections for silent buffer (all zeros)', async () => {
    const silent = Buffer.alloc(16000 * 2); // 1 second of silence, 16-bit
    const results = await detector.detect(silent, 16000);
    expect(results).toHaveLength(0);
  });

  it('returns detection for high-energy buffer', async () => {
    // Fill with max amplitude 16-bit samples (32767)
    const buf = Buffer.alloc(16000 * 2);
    for (let i = 0; i < buf.length; i += 2) {
      buf.writeInt16LE(32767, i);
    }
    const results = await detector.detect(buf, 16000);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].confidence).toBeCloseTo(1.0, 1);
  });

  it('healthCheck returns healthy', async () => {
    const health = await detector.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it('updateConfig changes threshold', () => {
    detector.updateConfig({ threshold: 0.9 });
    expect(detector.config.threshold).toBe(0.9);
  });
});
