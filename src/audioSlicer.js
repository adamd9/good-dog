/**
 * AudioSlicer — cuts a section from a WAV file (or an in-memory PCM buffer)
 * and writes it to a new WAV file.
 *
 * Used to save a short clip around each detected bark event.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const WaveFile = require('wavefile').WaveFile;

class AudioSlicer {
  /**
   * @param {object} options
   * @param {number} [options.sampleRate=16000]
   * @param {number} [options.channels=1]
   * @param {number} [options.bitDepth=16]
   */
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 16000;
    this.channels = options.channels || 1;
    this.bitDepth = options.bitDepth || 16;
  }

  /**
   * Slice a portion of a WAV file and write the clip to outputPath.
   *
   * @param {string} sourceFile   Absolute path to the source WAV file.
   * @param {number} startSeconds Offset (seconds) at which to start cutting.
   * @param {number} duration     Length of the clip in seconds.
   * @param {string} outputPath   Absolute path for the output WAV file.
   * @returns {string}  outputPath (resolved)
   */
  sliceFile(sourceFile, startSeconds, duration, outputPath) {
    if (!fs.existsSync(sourceFile)) {
      throw new Error(`Source file not found: ${sourceFile}`);
    }

    const srcWav = new WaveFile(fs.readFileSync(sourceFile));
    const samples = srcWav.getSamples(false, Int16Array);
    const sr = srcWav.fmt.sampleRate;
    const ch = srcWav.fmt.numChannels;

    const startSample = Math.floor(startSeconds * sr) * ch;
    const endSample = Math.min(startSample + Math.floor(duration * sr) * ch, samples.length);

    const slicedSamples = samples.slice(startSample, endSample);

    const outWav = new WaveFile();
    outWav.fromScratch(ch, sr, '16', Array.from(slicedSamples));

    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, outWav.toBuffer());

    return resolved;
  }

  /**
   * Slice a raw PCM16 Buffer (not a WAV file) and write the clip to outputPath.
   *
   * Useful when the continuous recorder holds audio in-memory and we want to
   * save a clip before it has been flushed to disk.
   *
   * @param {Buffer}  audioBuffer   Raw PCM16 samples.
   * @param {number}  startSeconds  Offset within the buffer in seconds.
   * @param {number}  duration      Clip duration in seconds.
   * @param {string}  outputPath    Destination WAV file path.
   * @returns {string} outputPath (resolved)
   */
  sliceBuffer(audioBuffer, startSeconds, duration, outputPath) {
    const bytesPerSample = this.bitDepth / 8;
    const bytesPerSecond = this.sampleRate * this.channels * bytesPerSample;

    const startByte = Math.floor(startSeconds * bytesPerSecond);
    const endByte = Math.min(startByte + Math.floor(duration * bytesPerSecond), audioBuffer.length);

    // Align to sample boundary
    const alignedStart = startByte - (startByte % bytesPerSample);
    const alignedEnd = endByte - (endByte % bytesPerSample);

    const slice = audioBuffer.slice(alignedStart, alignedEnd);

    const int16 = new Int16Array(slice.buffer, slice.byteOffset, slice.byteLength / 2);

    const wav = new WaveFile();
    wav.fromScratch(this.channels, this.sampleRate, '16', Array.from(int16));

    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, wav.toBuffer());

    return resolved;
  }

  /**
   * Create a WAV file from a raw PCM16 Buffer (wrap the whole buffer, no slicing).
   *
   * @param {Buffer}  audioBuffer   Raw PCM16 samples.
   * @param {string}  outputPath    Destination WAV file path.
   * @returns {string} outputPath (resolved)
   */
  bufferToWav(audioBuffer, outputPath) {
    return this.sliceBuffer(audioBuffer, 0, audioBuffer.length / (this.sampleRate * this.channels * (this.bitDepth / 8)), outputPath);
  }
}

module.exports = AudioSlicer;
