export interface StorageAdapter {
  saveFile(relativePath: string, data: Buffer): Promise<string>;
  getFile(relativePath: string): Promise<Buffer>;
  deleteFile(relativePath: string): Promise<void>;
  listFiles(directory: string): Promise<string[]>;
  fileExists(relativePath: string): Promise<boolean>;
  getFileUrl(relativePath: string): string;
}
