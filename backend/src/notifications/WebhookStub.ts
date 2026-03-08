import pino from 'pino';
import { NotificationService, BarkEventPayload } from './NotificationService';
import { config } from '../config';

const logger = pino({ name: 'WebhookStub', level: config.logLevel });

export class WebhookStub implements NotificationService {
  async notify(event: BarkEventPayload, _method: 'webhook' | 'email' | 'mqtt'): Promise<void> {
    logger.info(
      { eventId: event.id, confidence: event.confidence },
      '[WEBHOOK STUB] Would send to webhook URL: payload logged below',
    );
    logger.info({ payload: event }, '[WEBHOOK STUB] Bark event payload');
  }
}
