import { NotificationService, BarkEventPayload } from './NotificationService';
export declare class WebhookStub implements NotificationService {
    notify(event: BarkEventPayload, _method: 'webhook' | 'email' | 'mqtt'): Promise<void>;
}
//# sourceMappingURL=WebhookStub.d.ts.map