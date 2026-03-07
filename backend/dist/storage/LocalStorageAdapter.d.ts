import { StorageAdapter } from './StorageAdapter';
export declare class LocalStorageAdapter implements StorageAdapter {
    private basePath;
    constructor(basePath?: string);
    private resolve;
    saveFile(relativePath: string, data: Buffer): Promise<string>;
    getFile(relativePath: string): Promise<Buffer>;
    deleteFile(relativePath: string): Promise<void>;
    listFiles(directory: string): Promise<string[]>;
    fileExists(relativePath: string): Promise<boolean>;
    getFileUrl(relativePath: string): string;
}
//# sourceMappingURL=LocalStorageAdapter.d.ts.map