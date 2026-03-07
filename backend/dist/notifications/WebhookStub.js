"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookStub = void 0;
const pino_1 = __importDefault(require("pino"));
const config_1 = require("../config");
const logger = (0, pino_1.default)({ name: 'WebhookStub', level: config_1.config.logLevel });
class WebhookStub {
    async notify(event, _method) {
        logger.info({ eventId: event.id, confidence: event.confidence }, '[WEBHOOK STUB] Would send to webhook URL: payload logged below');
        logger.info({ payload: event }, '[WEBHOOK STUB] Bark event payload');
    }
}
exports.WebhookStub = WebhookStub;
//# sourceMappingURL=WebhookStub.js.map