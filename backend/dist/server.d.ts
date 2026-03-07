import 'express-async-errors';
import http from 'http';
import { CircularBuffer } from './recording/CircularBuffer';
export declare const app: import("express-serve-static-core").Express;
export declare const server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
export declare const circularBuffer: CircularBuffer;
//# sourceMappingURL=server.d.ts.map