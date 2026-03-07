"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordingManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'RecordingManager', level: config_1.config.logLevel });
class RecordingManager {
    constructor(storagePath, prisma, circularBuffer, rollingMinutes = config_1.config.rollingFileMinutes, sampleRate = config_1.config.sampleRate) {
        this.currentFile = null;
        this.currentStream = null;
        this.currentRecordingId = null;
        this.rollTimer = null;
        this.running = false;
        this.currentStartTime = null;
        this.storagePath = storagePath;
        this.prisma = prisma;
        this.circularBuffer = circularBuffer;
        this.rollingMinutes = rollingMinutes;
        this.sampleRate = sampleRate;
    }
    async start() {
        this.running = true;
        await this.openNewFile();
        logger.info('RecordingManager started');
    }
    async stop() {
        this.running = false;
        if (this.rollTimer) {
            clearTimeout(this.rollTimer);
            this.rollTimer = null;
        }
        await this.closeCurrentFile();
        logger.info('RecordingManager stopped');
    }
    getCurrentFile() {
        return this.currentFile;
    }
    async addAudioChunk(chunk) {
        this.circularBuffer.push(chunk);
        if (this.currentStream && this.running) {
            await new Promise((resolve, reject) => {
                this.currentStream.write(chunk.data, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
        }
    }
    buildFilePath(now) {
        const year = now.getFullYear().toString();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const dir = path_1.default.join(this.storagePath, 'recordings', year, month, day);
        fs_1.default.mkdirSync(dir, { recursive: true });
        return path_1.default.join(dir, `${hh}-${mm}-${ss}.wav`);
    }
    writeWavHeader(stream, sampleRate) {
        // Placeholder WAV header - size fields will be invalid until file is finalized,
        // but enough to mark the file as a WAV container.
        const header = Buffer.alloc(44);
        header.write('RIFF', 0, 'ascii');
        header.writeUInt32LE(0xffffffff, 4); // file size - filled in on close
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
        header.writeUInt32LE(0xffffffff, 40); // data size - filled in on close
        stream.write(header);
    }
    async openNewFile() {
        if (this.currentStream) {
            await this.closeCurrentFile();
        }
        const now = new Date();
        this.currentStartTime = now;
        const filePath = this.buildFilePath(now);
        this.currentFile = filePath;
        const stream = fs_1.default.createWriteStream(filePath);
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
        }
        catch (err) {
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
    async closeCurrentFile() {
        if (!this.currentStream)
            return;
        const stream = this.currentStream;
        const filePath = this.currentFile;
        const recordingId = this.currentRecordingId;
        this.currentStream = null;
        this.currentFile = null;
        this.currentRecordingId = null;
        await new Promise((resolve) => stream.end(resolve));
        if (filePath && recordingId) {
            try {
                const stat = fs_1.default.statSync(filePath);
                await this.prisma.recording.update({
                    where: { id: recordingId },
                    data: { endTime: new Date(), sizeBytes: BigInt(stat.size) },
                });
            }
            catch (err) {
                logger.warn({ err }, 'Could not update recording record on close');
            }
        }
    }
}
exports.RecordingManager = RecordingManager;
//# sourceMappingURL=RecordingManager.js.map