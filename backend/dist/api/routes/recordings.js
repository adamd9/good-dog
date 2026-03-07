"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../prisma");
const pino_1 = __importDefault(require("pino"));
const config_1 = require("../../config");
const logger = (0, pino_1.default)({ name: 'RecordingsRoute', level: config_1.config.logLevel });
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    const { from, to } = req.query;
    try {
        const where = {};
        if (from || to) {
            const filter = {};
            if (from)
                filter['gte'] = new Date(from);
            if (to)
                filter['lte'] = new Date(to);
            where['startTime'] = filter;
        }
        const recordings = await prisma_1.prisma.recording.findMany({
            where,
            orderBy: { startTime: 'desc' },
        });
        res.json(recordings);
    }
    catch (err) {
        logger.warn({ err }, 'DB unavailable');
        res.json([]);
    }
});
exports.default = router;
//# sourceMappingURL=recordings.js.map