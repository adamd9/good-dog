"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SliceAssembler = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const config_1 = require("../config");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'SliceAssembler', level: config_1.config.logLevel });
class SliceAssembler {
    constructor(storagePath, prisma, circularBuffer, sampleRate = config_1.config.sampleRate) {
        this.storagePath = storagePath;
        this.prisma = prisma;
        this.circularBuffer = circularBuffer;
        this.sampleRate = sampleRate;
    }
    async assembleSlice(eventId, startTime, endTime, preBuffer, postBuffer) {
        const sliceStart = new Date(startTime.getTime() - preBuffer * 1000);
        const sliceEnd = new Date(endTime.getTime() + postBuffer * 1000);
        const outDir = this.buildSliceDir(sliceStart);
        fs_1.default.mkdirSync(outDir, { recursive: true });
        const outPath = path_1.default.join(outDir, `${eventId}.wav`);
        // Try to find relevant recording files from DB
        let recordings = [];
        try {
            recordings = await this.prisma.recording.findMany({
                where: {
                    startTime: { lte: sliceEnd },
                    OR: [{ endTime: null }, { endTime: { gte: sliceStart } }],
                },
                orderBy: { startTime: 'asc' },
                select: { filePath: true },
            });
        }
        catch (err) {
            logger.warn({ err }, 'DB unavailable for slice assembly, falling back to buffer');
        }
        if (recordings.length > 0) {
            const existingFiles = recordings
                .map((r) => r.filePath)
                .filter((f) => fs_1.default.existsSync(f));
            if (existingFiles.length > 0) {
                const assembled = await this.assembleWithFfmpeg(existingFiles, outPath);
                if (assembled)
                    return outPath;
            }
        }
        // Fallback: pull from circular buffer
        logger.info({ eventId }, 'Falling back to circular buffer for slice');
        const totalSeconds = preBuffer + postBuffer + (sliceEnd.getTime() - sliceStart.getTime()) / 1000;
        const pcmData = this.circularBuffer.getLastNSeconds(totalSeconds, this.sampleRate);
        this.writeWavFile(outPath, pcmData, this.sampleRate);
        return outPath;
    }
    assembleWithFfmpeg(inputFiles, outPath) {
        return new Promise((resolve) => {
            let cmd = (0, fluent_ffmpeg_1.default)();
            for (const f of inputFiles) {
                cmd = cmd.input(f);
            }
            cmd
                .audioCodec('pcm_s16le')
                .on('error', (err) => {
                logger.warn({ err }, 'ffmpeg assembly failed, will fall back to buffer');
                resolve(false);
            })
                .on('end', () => resolve(true))
                .mergeToFile(outPath, os_1.default.tmpdir());
        });
    }
    writeWavFile(filePath, pcmData, sampleRate) {
        const dataSize = pcmData.length;
        const fileSize = 36 + dataSize;
        const header = Buffer.alloc(44);
        header.write('RIFF', 0, 'ascii');
        header.writeUInt32LE(fileSize, 4);
        header.write('WAVE', 8, 'ascii');
        header.write('fmt ', 12, 'ascii');
        header.writeUInt32LE(16, 16); // PCM chunk size
        header.writeUInt16LE(1, 20); // PCM format
        header.writeUInt16LE(1, 22); // mono
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(sampleRate * 2, 28); // byte rate
        header.writeUInt16LE(2, 32); // block align
        header.writeUInt16LE(16, 34); // bits per sample
        header.write('data', 36, 'ascii');
        header.writeUInt32LE(dataSize, 40);
        fs_1.default.writeFileSync(filePath, Buffer.concat([header, pcmData]));
    }
    buildSliceDir(date) {
        const year = date.getFullYear().toString();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return path_1.default.join(this.storagePath, 'slices', year, month, day);
    }
}
exports.SliceAssembler = SliceAssembler;
//# sourceMappingURL=SliceAssembler.js.map