import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { PrismaClient } from '@prisma/client';
import { CircularBuffer } from './CircularBuffer';
import { config as appConfig } from '../config';
import pino from 'pino';

const logger = pino({ name: 'SliceAssembler', level: appConfig.logLevel });

export class SliceAssembler {
  private storagePath: string;
  private prisma: PrismaClient;
  private circularBuffer: CircularBuffer;
  private sampleRate: number;

  constructor(
    storagePath: string,
    prisma: PrismaClient,
    circularBuffer: CircularBuffer,
    sampleRate = appConfig.sampleRate,
  ) {
    this.storagePath = storagePath;
    this.prisma = prisma;
    this.circularBuffer = circularBuffer;
    this.sampleRate = sampleRate;
  }

  async assembleSlice(
    eventId: string,
    startTime: Date,
    endTime: Date,
    preBuffer: number,
    postBuffer: number,
  ): Promise<string> {
    const sliceStart = new Date(startTime.getTime() - preBuffer * 1000);
    const sliceEnd = new Date(endTime.getTime() + postBuffer * 1000);

    const outDir = this.buildSliceDir(sliceStart);
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${eventId}.wav`);

    // Try to find relevant recording files from DB
    let recordings: Array<{ filePath: string }> = [];
    try {
      recordings = await this.prisma.recording.findMany({
        where: {
          startTime: { lte: sliceEnd },
          OR: [{ endTime: null }, { endTime: { gte: sliceStart } }],
        },
        orderBy: { startTime: 'asc' },
        select: { filePath: true },
      });
    } catch (err) {
      logger.warn({ err }, 'DB unavailable for slice assembly, falling back to buffer');
    }

    if (recordings.length > 0) {
      const existingFiles = recordings
        .map((r) => r.filePath)
        .filter((f) => fs.existsSync(f));

      if (existingFiles.length > 0) {
        const assembled = await this.assembleWithFfmpeg(existingFiles, outPath);
        if (assembled) return outPath;
      }
    }

    // Fallback: pull from circular buffer
    logger.info({ eventId }, 'Falling back to circular buffer for slice');
    const totalSeconds = preBuffer + postBuffer + (sliceEnd.getTime() - sliceStart.getTime()) / 1000;
    const pcmData = this.circularBuffer.getLastNSeconds(totalSeconds, this.sampleRate);
    this.writeWavFile(outPath, pcmData, this.sampleRate);
    return outPath;
  }

  private assembleWithFfmpeg(inputFiles: string[], outPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      let cmd = ffmpeg();
      for (const f of inputFiles) {
        cmd = cmd.input(f);
      }
      cmd
        .audioCodec('pcm_s16le')
        .on('error', (err: Error) => {
          logger.warn({ err }, 'ffmpeg assembly failed, will fall back to buffer');
          resolve(false);
        })
        .on('end', () => resolve(true))
        .mergeToFile(outPath, os.tmpdir());
    });
  }

  writeWavFile(filePath: string, pcmData: Buffer, sampleRate: number): void {
    const dataSize = pcmData.length;
    const fileSize = 36 + dataSize;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);           // PCM chunk size
    header.writeUInt16LE(1, 20);            // PCM format
    header.writeUInt16LE(1, 22);            // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28); // byte rate
    header.writeUInt16LE(2, 32);            // block align
    header.writeUInt16LE(16, 34);           // bits per sample
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(dataSize, 40);
    fs.writeFileSync(filePath, Buffer.concat([header, pcmData]));
  }

  private buildSliceDir(date: Date): string {
    const year = date.getFullYear().toString();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return path.join(this.storagePath, 'slices', year, month, day);
  }
}
