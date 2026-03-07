export interface AudioChunk {
    data: Buffer;
    timestamp: Date;
    sampleRate: number;
}
export declare class CircularBuffer {
    private buffer;
    private head;
    private _size;
    private capacity;
    constructor(capacity: number);
    push(chunk: AudioChunk): void;
    get size(): number;
    getLastNSeconds(seconds: number, sampleRate: number): Buffer;
    clear(): void;
}
//# sourceMappingURL=CircularBuffer.d.ts.map