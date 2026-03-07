import { CircularBuffer } from '../src/recording/CircularBuffer';

describe('CircularBuffer', () => {
  it('push and size', () => {
    const buf = new CircularBuffer(10);
    buf.push({ data: Buffer.alloc(100), timestamp: new Date(), sampleRate: 16000 });
    expect(buf.size).toBe(1);
  });

  it('getLastNSeconds returns correct bytes', () => {
    const buf = new CircularBuffer(100);
    const sampleRate = 16000;
    const seconds = 1;
    const chunkData = Buffer.alloc(sampleRate * 2); // exactly 1 second at 16-bit
    buf.push({ data: chunkData, timestamp: new Date(), sampleRate });
    const result = buf.getLastNSeconds(seconds, sampleRate);
    expect(result.length).toBe(sampleRate * 2);
  });

  it('overflow wrapping behavior', () => {
    const buf = new CircularBuffer(3);
    for (let i = 0; i < 5; i++) {
      buf.push({ data: Buffer.alloc(10), timestamp: new Date(), sampleRate: 16000 });
    }
    expect(buf.size).toBe(3); // capacity is 3
  });

  it('clear resets buffer', () => {
    const buf = new CircularBuffer(10);
    buf.push({ data: Buffer.alloc(10), timestamp: new Date(), sampleRate: 16000 });
    buf.clear();
    expect(buf.size).toBe(0);
  });
});
