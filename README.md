# 🐕 GoodDog — Dog Bark Detection & Monitoring System

A Node.js-based MVP for detecting dog barks, capturing audio slices, and reviewing events via a web UI.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Audio Input   │────▶│     Backend      │────▶│    Frontend      │
│  (mic / file)   │     │  Node.js + TS    │     │  React + Vite    │
└─────────────────┘     │  Express + WS    │     │  Port 3000       │
                         │  Port 4000       │     └──────────────────┘
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
             ┌──────────┐  ┌──────────┐  ┌──────────┐
             │PostgreSQL│  │  Slices  │  │Recordings│
             │ Metadata │  │  /data   │  │  /data   │
             └──────────┘  └──────────┘  └──────────┘
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js >= 18 (for local dev)
- ffmpeg (for audio slicing)

### Development (Docker Compose)

```bash
# Clone the repo
git clone https://github.com/adamd9/good-dog.git
cd good-dog

# Copy env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Start all services
docker-compose -f docker-compose.dev.yml up

# Frontend: http://localhost:3000
# Backend: http://localhost:4000
# MinIO: http://localhost:9001 (minioadmin/minioadmin)
```

### Local Development (without Docker)

**Backend:**
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push   # Requires PostgreSQL running
npm run dev
```

**Frontend:**
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Generate Test Audio

```bash
node scripts/generate-test-audio.js
# Creates data/test-audio/bark_001.wav ... bark_010.wav
# Creates data/test-audio/background_001.wav ... background_005.wav
```

## Environment Variables

### Backend (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | HTTP port |
| `DATABASE_URL` | postgresql://gooddog:gooddog@localhost:5432/gooddog | PostgreSQL connection |
| `STORAGE_PATH` | /data | Base path for recordings and slices |
| `PRE_BUFFER_SECONDS` | 3 | Seconds to capture before detection |
| `POST_BUFFER_SECONDS` | 5 | Seconds to capture after detection |
| `DETECTOR_DEFAULT_THRESHOLD` | 0.6 | Default energy threshold (0–1) |
| `API_KEY` | changeme | API key for authentication |
| `LOG_LEVEL` | info | Pino log level |
| `RETENTION_DAYS` | 7 | Days to retain recordings |
| `SAMPLE_RATE` | 16000 | Audio sample rate (Hz) |
| `ROLLING_FILE_MINUTES` | 10 | Duration of rolling recording files |

### Frontend (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | http://localhost:4000 | Backend URL |
| `VITE_API_KEY` | changeme | API key |

## API Reference

All API endpoints require authentication via `X-API-Key` header (or `Authorization: Bearer <key>`).

### Health

```bash
curl http://localhost:4000/health
```

```json
{
  "status": "ok",
  "db": "connected",
  "detectors": [{ "healthy": true, "message": "ok", "detectorId": "..." }],
  "diskUsage": { "total": 100, "used": 20, "free": 80 }
}
```

### Detectors

```bash
# List detectors
curl -H "X-API-Key: changeme" http://localhost:4000/api/detectors

# Update detector config
curl -X POST -H "X-API-Key: changeme" -H "Content-Type: application/json" \
  -d '{"name":"Heuristic","type":"heuristic","config":{"threshold":0.5,"sensitivity":0.8}}' \
  http://localhost:4000/api/detectors

# Reprocess events with detector
curl -X POST -H "X-API-Key: changeme" \
  http://localhost:4000/api/detectors/DETECTOR_ID/reprocess
```

### Events

```bash
# List events (with filters)
curl -H "X-API-Key: changeme" \
  "http://localhost:4000/api/events?from=2024-01-01&to=2024-12-31&reviewed=false&page=1&limit=20"

# Get single event
curl -H "X-API-Key: changeme" http://localhost:4000/api/events/EVENT_ID

# Label event
curl -X POST -H "X-API-Key: changeme" -H "Content-Type: application/json" \
  -d '{"label":"false_positive"}' \
  http://localhost:4000/api/events/EVENT_ID/label
```

### Recordings

```bash
# List continuous recordings
curl -H "X-API-Key: changeme" \
  "http://localhost:4000/api/recordings?from=2024-01-01&to=2024-01-02"
```

### Config

```bash
# Get config
curl -H "X-API-Key: changeme" http://localhost:4000/api/config

# Update config
curl -X POST -H "X-API-Key: changeme" -H "Content-Type: application/json" \
  -d '{"preBufferSeconds":5,"postBufferSeconds":8,"retentionDays":14}' \
  http://localhost:4000/api/config
```

### WebSocket

Connect to `ws://localhost:4000/events` to receive real-time bark detection events:

```javascript
const ws = new WebSocket('ws://localhost:4000/events');
ws.onmessage = (msg) => {
  const event = JSON.parse(msg.data);
  console.log('New bark event:', event);
};
```

### Metrics

```bash
curl http://localhost:4000/metrics
```

## Detection Options

See [DETECTION_OPTIONS.md](./DETECTION_OPTIONS.md) for a detailed comparison of:
- Option 1: Heuristic energy + spectral detector (implemented)
- Option 2: YAMNet / ONNX pre-trained model
- Option 3: Cloud API (Google, Picovoice, AssemblyAI)

## Deployment

### Add S3-Compatible Storage

1. Set up MinIO or AWS S3
2. Implement `S3StorageAdapter` extending `StorageAdapter` interface
3. Set `STORAGE_ADAPTER=s3` env var
4. Configure S3 credentials in `.env`

### Add MQTT Notifications

```typescript
// TODO: backend/src/notifications/MQTTNotification.ts
// Implement NotificationService interface with mqtt.js client
// Subscribe/publish to topics: gooddog/events/bark
```

### Add User Authentication

Replace API key with JWT tokens + bcrypt password hashing. See `backend/src/auth.ts` for extension point.

## Next Steps

- [ ] Integrate YAMNet detector (see DETECTION_OPTIONS.md)
- [ ] Add MQTT publisher/subscriber
- [ ] Add S3 storage adapter
- [ ] Add multi-microphone support
- [ ] Add user accounts + RBAC
- [ ] Add waveform visualization in event detail
- [ ] Add batch reprocessing with different detector models
- [ ] Add encrypted at-rest storage
- [ ] Add Prometheus/Grafana dashboard

## Privacy & Security

- Audio recordings may contain private content. Default retention: 7 days (configurable).
- All API endpoints require authentication (API key).
- Change `API_KEY` from default `changeme` before production use.
- For at-rest encryption, enable filesystem encryption (LUKS, macOS FileVault) at the OS level.
- Bulk delete: `DELETE /api/recordings` (to be implemented) or directly from storage.

## Testing

```bash
cd backend && npm test
```

Tests cover:
- HeuristicDetector: silent buffer, high-energy buffer, threshold changes
- CircularBuffer: push/retrieve, overflow handling
- SliceAssembler: PCM fallback assembly
- API endpoints: auth, health, events, detectors

## License

MIT
