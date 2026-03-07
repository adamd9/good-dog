import fs from 'fs/promises';
import path from 'path';
import { StorageAdapter } from './StorageAdapter';
import { config } from '../config';

export class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor(basePath = config.storagePath) {
    this.basePath = basePath;
  }

  private resolve(relativePath: string): string {
    return path.join(this.basePath, relativePath);
  }

  async saveFile(relativePath: string, data: Buffer): Promise<string> {
    const fullPath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
    return fullPath;
  }

  async getFile(relativePath: string): Promise<Buffer> {
    const fullPath = this.resolve(relativePath);
    return fs.readFile(fullPath);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await fs.unlink(fullPath);
  }

  async listFiles(directory: string): Promise<string[]> {
    const fullDir = this.resolve(directory);
    try {
      const entries = await fs.readdir(fullDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile())
        .map((e) => path.join(directory, e.name));
    } catch {
      return [];
    }
  }

  async fileExists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  getFileUrl(relativePath: string): string {
    return `/files/${relativePath}`;
  }
}
