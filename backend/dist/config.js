"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    port: process.env.PORT || 4000,
    dbUrl: process.env.DATABASE_URL || 'postgresql://gooddog:gooddog@localhost:5432/gooddog',
    storagePath: process.env.STORAGE_PATH || '/data',
    preBufferSeconds: parseFloat(process.env.PRE_BUFFER_SECONDS || '3'),
    postBufferSeconds: parseFloat(process.env.POST_BUFFER_SECONDS || '5'),
    detectorThreshold: parseFloat(process.env.DETECTOR_DEFAULT_THRESHOLD || '0.6'),
    apiKey: process.env.API_KEY || 'changeme',
    logLevel: process.env.LOG_LEVEL || 'info',
    retentionDays: parseInt(process.env.RETENTION_DAYS || '7'),
    sampleRate: parseInt(process.env.SAMPLE_RATE || '16000'),
    rollingFileMinutes: parseInt(process.env.ROLLING_FILE_MINUTES || '10'),
};
//# sourceMappingURL=config.js.map