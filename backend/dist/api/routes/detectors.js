"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../prisma");
const pino_1 = __importDefault(require("pino"));
const config_1 = require("../../config");
const logger = (0, pino_1.default)({ name: 'DetectorsRoute', level: config_1.config.logLevel });
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    try {
        const detectors = await prisma_1.prisma.detector.findMany();
        res.json(detectors);
    }
    catch (err) {
        logger.warn({ err }, 'DB unavailable, returning empty list');
        res.json([]);
    }
});
router.post('/', async (req, res) => {
    const { id, name, type, configData, enabled } = req.body;
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jsonConfig = (configData ?? {});
        if (id) {
            const detector = await prisma_1.prisma.detector.upsert({
                where: { id },
                update: { name, type, config: jsonConfig, enabled: enabled ?? true },
                create: { id, name, type, config: jsonConfig, enabled: enabled ?? true },
            });
            res.json(detector);
        }
        else {
            const detector = await prisma_1.prisma.detector.create({
                data: { name, type, config: jsonConfig, enabled: enabled ?? true },
            });
            res.status(201).json(detector);
        }
    }
    catch (err) {
        logger.error({ err }, 'Failed to create/update detector');
        res.status(500).json({ error: 'Database error' });
    }
});
router.post('/:id/reprocess', async (req, res) => {
    const { id } = req.params;
    logger.info({ detectorId: id }, 'Reprocess stub called');
    res.status(202).json({ message: 'Reprocessing queued', detectorId: id });
});
exports.default = router;
//# sourceMappingURL=detectors.js.map