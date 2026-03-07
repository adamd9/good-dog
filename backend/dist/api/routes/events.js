"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../prisma");
const pino_1 = __importDefault(require("pino"));
const config_1 = require("../../config");
const logger = (0, pino_1.default)({ name: 'EventsRoute', level: config_1.config.logLevel });
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    const { from, to, reviewed, threshold, page = '1', limit = '20', } = req.query;
    const pageNum = Math.max(1, parseInt(page ?? '1'));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20')));
    const skip = (pageNum - 1) * limitNum;
    try {
        const where = {};
        if (from || to) {
            const startTimeFilter = {};
            if (from)
                startTimeFilter['gte'] = new Date(from);
            if (to)
                startTimeFilter['lte'] = new Date(to);
            where['startTime'] = startTimeFilter;
        }
        if (reviewed !== undefined) {
            where['reviewed'] = reviewed === 'true';
        }
        if (threshold !== undefined) {
            where['confidence'] = { gte: parseFloat(threshold) };
        }
        const [events, total] = await Promise.all([
            prisma_1.prisma.barkEvent.findMany({ where, skip, take: limitNum, orderBy: { startTime: 'desc' } }),
            prisma_1.prisma.barkEvent.count({ where }),
        ]);
        res.json({ events, total, page: pageNum, limit: limitNum });
    }
    catch (err) {
        logger.warn({ err }, 'DB unavailable');
        res.json({ events: [], total: 0, page: pageNum, limit: limitNum });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const event = await prisma_1.prisma.barkEvent.findUnique({ where: { id: req.params['id'] } });
        if (!event) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }
        res.json(event);
    }
    catch (err) {
        logger.warn({ err }, 'DB unavailable');
        res.status(503).json({ error: 'Database unavailable' });
    }
});
router.post('/:id/label', async (req, res) => {
    const { label } = req.body;
    try {
        const event = await prisma_1.prisma.barkEvent.update({
            where: { id: req.params['id'] },
            data: { label, reviewed: true },
        });
        res.json(event);
    }
    catch (err) {
        logger.warn({ err }, 'DB unavailable');
        res.status(503).json({ error: 'Database unavailable' });
    }
});
exports.default = router;
//# sourceMappingURL=events.js.map