import http from 'http';
export declare class WebSocketManager {
    private wss;
    private clients;
    init(server: http.Server): void;
    broadcast(event: object): void;
}
export declare const wsManager: WebSocketManager;
//# sourceMappingURL=websocket.d.ts.map