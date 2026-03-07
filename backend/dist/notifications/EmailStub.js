"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailStub = void 0;
const fs_1 = __importDefault(require("fs"));
const pino_1 = __importDefault(require("pino"));
const config_1 = require("../config");
const logger = (0, pino_1.default)({ name: 'EmailStub', level: config_1.config.logLevel });
const STUB_LOG = '/tmp/email-stubs.log';
class EmailStub {
    async notify(event, _method) {
        const body = [
            `To: admin@example.com`,
            `Subject: Bark detected (confidence=${event.confidence.toFixed(2)})`,
            `Event ID: ${event.id}`,
            `Detector: ${event.detectorId}`,
            `Start: ${event.startTime.toISOString()}`,
            `End: ${event.endTime.toISOString()}`,
            `Audio: ${event.audioFilePath ?? 'N/A'}`,
            `Label: ${event.label ?? 'N/A'}`,
            `---`,
        ].join('\n');
        logger.info({ eventId: event.id }, '[EMAIL STUB] Would send email - see /tmp/email-stubs.log');
        try {
            fs_1.default.appendFileSync(STUB_LOG, body + '\n');
        }
        catch (err) {
            logger.warn({ err }, 'Could not write to email stub log');
        }
    }
}
exports.EmailStub = EmailStub;
//# sourceMappingURL=EmailStub.js.map