import { PrismaClient } from '@prisma/client';
import { CircularBuffer } from './CircularBuffer';
export declare class SliceAssembler {
    private storagePath;
    private prisma;
    private circularBuffer;
    private sampleRate;
    constructor(storagePath: string, prisma: PrismaClient, circularBuffer: CircularBuffer, sampleRate?: number);
    assembleSlice(eventId: string, startTime: Date, endTime: Date, preBuffer: number, postBuffer: number): Promise<string>;
    private assembleWithFfmpeg;
    writeWavFile(filePath: string, pcmData: Buffer, sampleRate: number): void;
    private buildSliceDir;
}
//# sourceMappingURL=SliceAssembler.d.ts.map