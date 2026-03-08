# Detection Options for GoodDog

This document outlines three concrete approaches for dog bark detection, their trade-offs, and integration notes.

---

## Option 1: Heuristic Audio Detector (Implemented for MVP)

### Algorithm

The heuristic detector uses two complementary signals:

1. **RMS Energy**: Computes root-mean-square energy of 16-bit PCM samples. Dogs barks typically have significantly higher energy than ambient noise. RMS is computed as:

   ```
   rms = sqrt(sum(sample^2) / n)
   normalized_rms = rms / 32768   # Normalize from int16 range
   ```

2. **Spectral Centroid**: Approximates the "brightness" of the sound. Barks have a distinct spectral shape concentrated in mid-range frequencies (300 Hz – 4 kHz). Computed using FFT magnitude-weighted frequency sum:

   ```
   centroid = sum(freq[i] * magnitude[i]) / sum(magnitude[i])
   ```

   A bark is expected in the 500 Hz – 3500 Hz range.

3. **Decision Rule**: A detection is raised when:
   ```
   normalized_rms > threshold * sensitivity
   ```
   Confidence is scaled proportionally: `min(normalized_rms / threshold, 1.0)`

### Pros
- **Zero latency** after audio ingest (< 1 ms per frame)
- **No external dependencies** (runs entirely in Node.js)
- **Deterministic** and easy to tune
- **Free** — no API costs
- **Offline** — works without internet

### Cons
- **High false positive rate** for other loud sounds (hand claps, doors slamming, TV)
- **Threshold tuning required** per environment
- **No semantic understanding** of bark acoustics
- Sensitive to microphone placement and gain settings

### False Positive Cases
- Loud music or TV
- Slamming doors or objects
- Human shouting
- Other pets (cats, birds)
- HVAC/fan noise spikes

### Calibration
Use the `/api/config` endpoint to set background noise floor. The UI's Settings page provides a threshold slider. Recommended workflow:
1. Record 30s of ambient noise
2. Note the average RMS energy
3. Set threshold to ambient_rms * 3 for initial calibration

### Integration
Already implemented in `backend/src/detectors/HeuristicDetector.ts`.

---

## Option 2: Open-Source Pre-Trained Model

### Recommended Model: YAMNet (TensorFlow.js)

**YAMNet** is a pre-trained audio event classifier from Google trained on AudioSet (~2M samples, 521 classes including "Dog bark"). It uses a MobileNet V1 architecture and produces class scores for 0.96-second windows.

- **GitHub**: https://github.com/tensorflow/tfjs-models/tree/master/speech-commands
- **TF Hub**: https://tfhub.dev/google/yamnet/1
- **Paper**: https://arxiv.org/abs/1910.11006

### Integration Approach

```typescript
// backend/src/detectors/YAMNetDetector.ts
import * as tf from '@tensorflow/tfjs-node';
import * as speechCommands from '@tensorflow-models/speech-commands';

export class YAMNetDetector implements Detector {
  private model: tf.LayersModel | null = null;
  
  async initialize() {
    // Load YAMNet from TF Hub
    this.model = await tf.loadGraphModel(
      'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1',
      { fromTFHub: true }
    );
  }
  
  async detect(audioBuffer: Buffer, sampleRate: number): Promise<DetectionResult[]> {
    // Resample to 16kHz if needed
    const samples = new Float32Array(audioBuffer.buffer);
    const tensor = tf.tensor1d(samples);
    
    // YAMNet expects mono 16kHz float32
    const [scores, embeddings, spectrogram] = this.model!.predict(tensor) as tf.Tensor[];
    const scoreData = await scores.data();
    
    // Class 74 = "Dog bark" in AudioSet ontology
    const barkScore = scoreData[74];
    
    if (barkScore > this.config.threshold) {
      return [{
        confidence: barkScore,
        startTime: new Date(),
        endTime: new Date(Date.now() + 960),  // 0.96s window
        detectorId: this.id,
        label: 'bark',
        metadata: { model: 'yamnet', class_index: 74 }
      }];
    }
    return [];
  }
}
```

### Additional Options
- **ONNX Runtime** (`onnxruntime-node`): Export YAMNet or a custom PyTorch model to ONNX, run inference with `onnxruntime-node`. Lower memory footprint than TF.js.
- **PANNs** (Pretrained Audio Neural Networks): https://github.com/qiuqiangkong/audioset_tagging_cnn — higher accuracy, requires Python service or ONNX export.
- **BirdNET-Analyzer** (repurposed for dogs): https://github.com/kahst/BirdNET-Analyzer — architecture adaptable for other audio events.

### Pros
- **Semantic understanding** of bark acoustics vs other sounds
- **High accuracy** on AudioSet benchmarks (mAP ~0.47 for dog sounds)
- **Free** — model weights are open-source
- **Offline** — runs locally after model download (~25 MB)
- Multiple bark sub-classes available

### Cons
- **Higher latency**: 50–200 ms per inference on CPU (GPU recommended)
- **Memory**: ~200 MB for TF.js runtime + model weights
- **Cold start**: 2–5s model initialization
- **Node.js complexity**: TF.js native bindings require native compilation
- Model outputs 0.96s windows — not suitable for sub-second detection

### Expected Latency
- CPU inference: 80–150 ms per window
- GPU inference: 10–30 ms per window
- Total pipeline latency: 150–300 ms

### Cost
- Free (open-source)
- Infrastructure cost only (GPU instance if needed)

---

## Option 3: Cloud-Based Audio Detection API

### Recommended: Google Cloud Speech-to-Sound Events / Audio Intelligence APIs

Multiple vendors offer audio event detection:

#### Option 3a: Google Cloud Video Intelligence API
- **URL**: https://cloud.google.com/video-intelligence/docs/detect-labels-shot
- **Capability**: Label detection includes animal sounds
- **Latency**: 2–10s (async) / N/A for real-time
- **Cost**: $0.10–$1.00 per minute of audio

#### Option 3b: AWS Rekognition Custom Labels + Transcribe
- Custom audio classification via SageMaker
- **Latency**: 300ms–2s
- **Cost**: ~$0.0004 per second of audio

#### Option 3c: Picovoice Falcon / Rhino (Recommended for MVP Cloud)
- **URL**: https://picovoice.ai/
- **Capability**: Edge-optimized audio event detection, deployable on-device
- **Real-time latency**: < 100ms
- **Cost**: Free tier (3 models), paid from $0.001/request

#### Option 3d: AssemblyAI
- **URL**: https://www.assemblyai.com/
- **Capability**: Audio intelligence, entity detection
- **Latency**: ~1–3s
- **Cost**: $0.00025 per second

### Integration Sketch

```typescript
// backend/src/detectors/CloudDetector.ts
import https from 'https';

export class GoogleAudioDetector implements Detector {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async detect(audioBuffer: Buffer, sampleRate: number): Promise<DetectionResult[]> {
    const base64Audio = audioBuffer.toString('base64');
    
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: sampleRate,
            languageCode: 'en-US',
            model: 'default',
          },
          audio: { content: base64Audio },
        }),
      }
    );
    
    // TODO: Process response to extract bark events
    // Google Speech API is primarily for speech — use Video Intelligence for sounds
    const data = await response.json();
    return [];
  }
  
  async healthCheck(): Promise<HealthStatus> {
    // TODO: ping API endpoint
    return { healthy: true, message: 'Cloud API (not verified)' };
  }
}
```

### Pros
- **Highest potential accuracy** with commercial models
- **No local compute** required
- **Managed infrastructure** — no model maintenance
- Some APIs support real-time streaming (WebRTC/websockets)

### Cons
- **Latency**: 500ms–10s depending on provider and async/sync mode
- **Cost**: Can be significant at scale ($10–$100/day for continuous recording)
- **Privacy**: Audio data sent to third party — major concern for home monitoring
- **Internet dependency**: Not suitable for offline/edge deployment
- **API rate limits** and quotas

### Expected Latency
- Synchronous APIs: 500ms–2s
- Streaming APIs (Deepgram, AssemblyAI): 200–500ms

### Cost Estimate
- 1 microphone, 24/7: ~86,400 seconds/day
- At $0.0004/second: ~$34/day, ~$1,000/month
- Picovoice/edge alternatives reduce to < $1/day

---

## Recommendation for MVP

**Use Option 1 (Heuristic Detector) for MVP.** It is already implemented, requires no external dependencies, has deterministic performance, and can be tuned via the Settings UI.

### Migration Path

| Phase | Action |
|-------|--------|
| MVP (now) | Heuristic detector with threshold tuning |
| Phase 2 | Integrate YAMNet (Option 2) for improved accuracy |
| Phase 3 | A/B test cloud API (Option 3c: Picovoice) for highest accuracy |

### Integration Steps for Option 2 (YAMNet)

1. Add `@tensorflow/tfjs-node` and `@tensorflow-models/speech-commands` to `backend/package.json`
2. Create `backend/src/detectors/YAMNetDetector.ts` implementing the `Detector` interface
3. Download YAMNet model weights on server startup
4. Register YAMNet detector via `POST /api/detectors`
5. Enable via Settings UI
6. Compare detection results using the event labeling feature (false positive tracking)

### Integration Steps for Option 3 (Cloud API)

1. Create `backend/src/detectors/CloudDetector.ts` implementing `Detector` interface
2. Add API credentials to `.env` file
3. Implement rate limiting and caching to control costs
4. Add privacy notice to UI (data sent to third party)
5. Implement fallback to heuristic detector when cloud is unavailable
