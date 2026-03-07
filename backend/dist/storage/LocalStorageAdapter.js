"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorageAdapter = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
class LocalStorageAdapter {
    constructor(basePath = config_1.config.storagePath) {
        this.basePath = basePath;
    }
    resolve(relativePath) {
        return path_1.default.join(this.basePath, relativePath);
    }
    async saveFile(relativePath, data) {
        const fullPath = this.resolve(relativePath);
        await promises_1.default.mkdir(path_1.default.dirname(fullPath), { recursive: true });
        await promises_1.default.writeFile(fullPath, data);
        return fullPath;
    }
    async getFile(relativePath) {
        const fullPath = this.resolve(relativePath);
        return promises_1.default.readFile(fullPath);
    }
    async deleteFile(relativePath) {
        const fullPath = this.resolve(relativePath);
        await promises_1.default.unlink(fullPath);
    }
    async listFiles(directory) {
        const fullDir = this.resolve(directory);
        try {
            const entries = await promises_1.default.readdir(fullDir, { withFileTypes: true });
            return entries
                .filter((e) => e.isFile())
                .map((e) => path_1.default.join(directory, e.name));
        }
        catch {
            return [];
        }
    }
    async fileExists(relativePath) {
        try {
            await promises_1.default.access(this.resolve(relativePath));
            return true;
        }
        catch {
            return false;
        }
    }
    getFileUrl(relativePath) {
        return `/files/${relativePath}`;
    }
}
exports.LocalStorageAdapter = LocalStorageAdapter;
//# sourceMappingURL=LocalStorageAdapter.js.map