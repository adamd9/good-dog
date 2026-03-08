import fs from 'fs';
import pino from 'pino';
import { NotificationService, BarkEventPayload } from './NotificationService';
import { config } from '../config';

const logger = pino({ name: 'EmailStub', level: config.logLevel });
const STUB_LOG = '/tmp/email-stubs.log';

export class EmailStub implements NotificationService {
  async notify(event: BarkEventPayload, _method: 'webhook' | 'email' | 'mqtt'): Promise<void> {
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
      fs.appendFileSync(STUB_LOG, body + '\n');
    } catch (err) {
      logger.warn({ err }, 'Could not write to email stub log');
    }
  }
}
