/**
 * Central configuration for good-dog.
 * Values can be overridden via environment variables.
 */
'use strict';

const path = require('path');

const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
  },

  audio: {
    /** Sample rate in Hz */
    sampleRate: parseInt(process.env.AUDIO_SAMPLE_RATE || '16000', 10),
    /** Number of channels */
    channels: parseInt(process.env.AUDIO_CHANNELS || '1', 10),
    /** Bit depth */
    bitDepth: parseInt(process.env.AUDIO_BIT_DEPTH || '16', 10),
    /**
     * Audio capture mode.
     * 'stub'      — synthetic audio (sine wave + noise), no hardware needed.
     * 'microphone'— real microphone via node-record-lpcm16 (requires SoX).
     */
    captureMode: process.env.AUDIO_CAPTURE_MODE || 'stub',
    /** Size of each audio chunk processed by the detector (samples) */
    chunkSize: parseInt(process.env.AUDIO_CHUNK_SIZE || '4096', 10),
  },

  detection: {
    /**
     * Detection engine.
     * 'stub'      — random probability generator for development/testing.
     * 'frequency' — RMS + frequency-band energy analysis.
     */
    mode: process.env.DETECTION_MODE || 'stub',
    /** Events with probability >= threshold are stored and reported */
    threshold: parseFloat(process.env.DETECTION_THRESHOLD || '0.7'),
    /** Seconds of audio to capture before the detected event */
    prePadSeconds: parseFloat(process.env.DETECTION_PRE_PAD || '1'),
    /** Seconds of audio to capture after the detected event */
    postPadSeconds: parseFloat(process.env.DETECTION_POST_PAD || '2'),
    /**
     * Stub mode: probability of generating a synthetic bark event per chunk.
     * Kept low so the UI is not flooded during demos.
     */
    stubEventProbability: parseFloat(process.env.STUB_EVENT_PROBABILITY || '0.02'),
  },

  storage: {
    recordingsDir: process.env.RECORDINGS_DIR || path.join(__dirname, '..', 'recordings'),
    eventsDir: process.env.EVENTS_DIR || path.join(__dirname, '..', 'events'),
    eventsMetaFile: process.env.EVENTS_META_FILE || path.join(__dirname, '..', 'events', 'events.json'),
    /** Duration of each continuous recording block in seconds (default 12 hours) */
    recordingBlockSeconds: parseInt(process.env.RECORDING_BLOCK_SECONDS || String(12 * 60 * 60), 10),
  },
};

module.exports = config;
