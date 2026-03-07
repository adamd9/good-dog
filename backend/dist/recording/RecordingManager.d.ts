import { PrismaClient } from '@prisma/client';
import { AudioChunk, CircularBuffer } from './CircularBuffer';
export declare class RecordingManager {
    private storagePath;
    private prisma;
    private circularBuffer;
    private rollingMinutes;
    private sampleRate;
    private currentFile;
    private currentStream;
    private currentRecordingId;
    private rollTimer;
    private running;
    private currentStartTime;
    constructor(storagePath: string, prisma: PrismaClient, circularBuffer: CircularBuffer, rollingMinutes?: number, sampleRate?: number);
    start(): Promise<void>;
    stop(): Promise<void>;
    getCurrentFile(): string | null;
    addAudioChunk(chunk: AudioChunk): Promise<void>;
    private buildFilePath;
    private writeWavHeader;
    private openNewFile;
    private closeCurrentFile;
}
//# sourceMappingURL=RecordingManager.d.ts.map