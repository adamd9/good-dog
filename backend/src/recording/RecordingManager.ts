import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { AudioChunk, CircularBuffer } from './CircularBuffer';
import { config as appConfig } from '../config';
import pino from 'pino';

const logger = pino({ name: 'RecordingManager', level: appConfig.logLevel });

export class RecordingManager {
  private storagePath: string;
  private prisma: PrismaClient;
  private circularBuffer: CircularBuffer;
  private rollingMinutes: number;
  private sampleRate: number;
  private currentFile: string | null = null;
  private currentStream: fs.WriteStream | null = null;
  private currentRecordingId: string | null = null;
  private rollTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private currentStartTime: Date | null = null;

  constructor(
    storagePath: string,
    prisma: PrismaClient,
    circularBuffer: CircularBuffer,
    rollingMinutes = appConfig.rollingFileMinutes,
    sampleRate = appConfig.sampleRate,
  ) {
    this.storagePath = storagePath;
    this.prisma = prisma;
    this.circularBuffer = circularBuffer;
    this.rollingMinutes = rollingMinutes;
    this.sampleRate = sampleRate;
  }

  async start(): Promise<void> {
    this.running = true;
    await this.openNewFile();
    logger.info('RecordingManager started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.rollTimer) {
      clearTimeout(this.rollTimer);
      this.rollTimer = null;
    }
    await this.closeCurrentFile();
    logger.info('RecordingManager stopped');
  }

  getCurrentFile(): string | null {
    return this.currentFile;
  }

  async addAudioChunk(chunk: AudioChunk): Promise<void> {
    this.circularBuffer.push(chunk);
    if (this.currentStream && this.running) {
      await new Promise<void>((resolve, reject) => {
        this.currentStream!.write(chunk.data, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  private buildFilePath(now: Date): string {
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const dir = path.join(this.storagePath, 'recordings', year, month, day);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${hh}-${mm}-${ss}.wav`);
  }

  private writeWavHeader(stream: fs.WriteStream, sampleRate: number): void {
    // Placeholder WAV header - size fields will be invalid until file is finalized,
    // but enough to mark the file as a WAV container.
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(0xffffffff, 4); // file size - filled in on close
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);          // PCM chunk size
    header.writeUInt16LE(1, 20);           // PCM format
    header.writeUInt16LE(1, 22);           // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28); // byte rate
    header.writeUInt16LE(2, 32);           // block align
    header.writeUInt16LE(16, 34);          // bits per sample
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(0xffffffff, 40);  // data size - filled in on close
    stream.write(header);
  }

  private async openNewFile(): Promise<void> {
    if (this.currentStream) {
      await this.closeCurrentFile();
    }
    const now = new Date();
    this.currentStartTime = now;
    const filePath = this.buildFilePath(now);
    this.currentFile = filePath;

    const stream = fs.createWriteStream(filePath);
    this.writeWavHeader(stream, this.sampleRate);
    this.currentStream = stream;

    try {
      const record = await this.prisma.recording.create({
        data: {
          filePath,
          startTime: now,
          sizeBytes: 0n,
        },
      });
      this.currentRecordingId = record.id;
    } catch (err) {
      logger.warn({ err }, 'DB unavailable - recording metadata not persisted');
      this.currentRecordingId = null;
    }

    this.rollTimer = setTimeout(() => {
      if (this.running) {
        this.openNewFile().catch((e) => logger.error({ e }, 'Roll failed'));
      }
    }, this.rollingMinutes * 60 * 1000);

    logger.info({ filePath }, 'Opened new recording file');
  }

  private async closeCurrentFile(): Promise<void> {
    if (!this.currentStream) return;
    const stream = this.currentStream;
    const filePath = this.currentFile;
    const recordingId = this.currentRecordingId;

    this.currentStream = null;
    this.currentFile = null;
    this.currentRecordingId = null;

    await new Promise<void>((resolve) => stream.end(resolve));

    if (filePath && recordingId) {
      try {
        const stat = fs.statSync(filePath);
        await this.prisma.recording.update({
          where: { id: recordingId },
          data: { endTime: new Date(), sizeBytes: BigInt(stat.size) },
        });
      } catch (err) {
        logger.warn({ err }, 'Could not update recording record on close');
      }
    }
  }
}
