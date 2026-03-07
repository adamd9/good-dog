"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../prisma");
const config_1 = require("../../config");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'ConfigRoute', level: config_1.config.logLevel });
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    try {
        const dbEntries = await prisma_1.prisma.appConfig.findMany();
        const dbMap = Object.fromEntries(dbEntries.map((e) => [e.key, e.value]));
        res.json({ env: config_1.config, db: dbMap });
    }
    catch (err) {
        logger.warn({ err }, 'DB unavailable, returning env config only');
        res.json({ env: config_1.config, db: {} });
    }
});
router.post('/', async (req, res) => {
    const { key, value } = req.body;
    if (!key) {
        res.status(400).json({ error: 'key is required' });
        return;
    }
    try {
        const entry = await prisma_1.prisma.appConfig.upsert({
            where: { key },
            update: { value: value },
            create: { key, value: value },
        });
        res.json(entry);
    }
    catch (err) {
        logger.error({ err }, 'Failed to upsert config');
        res.status(503).json({ error: 'Database unavailable' });
    }
});
exports.default = router;
//# sourceMappingURL=config.js.map