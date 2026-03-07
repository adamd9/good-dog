"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsManager = exports.WebSocketManager = void 0;
const ws_1 = require("ws");
const pino_1 = __importDefault(require("pino"));
const config_1 = require("../config");
const logger = (0, pino_1.default)({ name: 'WebSocketManager', level: config_1.config.logLevel });
class WebSocketManager {
    constructor() {
        this.wss = null;
        this.clients = new Set();
    }
    init(server) {
        this.wss = new ws_1.WebSocketServer({ server });
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            logger.info({ clientCount: this.clients.size }, 'WS client connected');
            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg['type'] === 'ping') {
                        ws.send(JSON.stringify({ type: 'pong' }));
                    }
                }
                catch {
                    // ignore malformed messages
                }
            });
            ws.on('pong', () => {
                ws.isAlive = true;
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
                const extWs = ws;
                if (extWs.isAlive === false) {
                    this.clients.delete(ws);
                    ws.terminate();
                    return;
                }
                extWs.isAlive = false;
                ws.ping();
            });
        }, 30000);
        this.wss.on('close', () => clearInterval(interval));
        logger.info('WebSocket server initialised');
    }
    broadcast(event) {
        const payload = JSON.stringify(event);
        this.clients.forEach((ws) => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(payload);
            }
        });
    }
}
exports.WebSocketManager = WebSocketManager;
exports.wsManager = new WebSocketManager();
//# sourceMappingURL=websocket.js.map