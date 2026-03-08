import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import pino from 'pino';
import { config } from '../config';

const logger = pino({ name: 'WebSocketManager', level: config.logLevel });

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  init(server: http.Server): void {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      logger.info({ clientCount: this.clients.size }, 'WS client connected');

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          if (msg['type'] === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('pong', () => {
        (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info({ clientCount: this.clients.size }, 'WS client disconnected');
      });

      ws.on('error', (err) => {
        logger.warn({ err }, 'WS client error');
        this.clients.delete(ws);
      });

      ws.send(JSON.stringify({ type: 'connected', message: 'GoodDog WebSocket ready' }));
    });

    // Keepalive: ping all clients every 30 seconds
    const interval = setInterval(() => {
      if (!this.wss) {
        clearInterval(interval);
        return;
      }
      this.clients.forEach((ws) => {
        const extWs = ws as WebSocket & { isAlive?: boolean };
        if (extWs.isAlive === false) {
          this.clients.delete(ws);
          ws.terminate();
          return;
        }
        extWs.isAlive = false;
        ws.ping();
      });
    }, 30_000);

    this.wss.on('close', () => clearInterval(interval));
    logger.info('WebSocket server initialised');
  }

  broadcast(event: object): void {
    const payload = JSON.stringify(event);
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }
}

export const wsManager = new WebSocketManager();
