import path from 'path';
import os from 'os';
import fs from 'fs';
import { SliceAssembler } from '../src/recording/SliceAssembler';
import { CircularBuffer } from '../src/recording/CircularBuffer';

// Mock fluent-ffmpeg to simulate ffmpeg not available
jest.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = jest.fn(() => ({
    input: jest.fn().mockReturnThis(),
    audioCodec: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(function(this: unknown, event: string, cb: (err?: Error) => void) {
      if (event === 'error') cb(new Error('ffmpeg not available'));
      return this;
    }),
    mergeToFile: jest.fn().mockReturnThis(),
    save: jest.fn().mockReturnThis(),
  }));
  return mockFfmpeg;
});

describe('SliceAssembler', () => {
  let tmpDir: string;
  let circularBuffer: CircularBuffer;
  let assembler: SliceAssembler;
  const mockPrisma = {
    recording: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gooddog-test-'));
    circularBuffer = new CircularBuffer(100);
    // Add some audio data to the circular buffer
    const chunk = Buffer.alloc(16000 * 2); // 1 second
    circularBuffer.push({ data: chunk, timestamp: new Date(), sampleRate: 16000 });
    assembler = new SliceAssembler(tmpDir, mockPrisma as unknown as import('@prisma/client').PrismaClient, circularBuffer);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('assembleSlice falls back to PCM when no recordings in DB', async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 2000);
    const end = now;
    const filePath = await assembler.assembleSlice('test-event-1', start, end, 1, 1);
    expect(filePath).toBeTruthy();
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('WAV file has proper 44-byte RIFF header', async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 2000);
    const end = now;
    const filePath = await assembler.assembleSlice('test-event-2', start, end, 1, 1);
    const data = fs.readFileSync(filePath);
    // Check RIFF header
    expect(data.slice(0, 4).toString('ascii')).toBe('RIFF');
    expect(data.slice(8, 12).toString('ascii')).toBe('WAVE');
    expect(data.length).toBeGreaterThan(44);
  });
});
