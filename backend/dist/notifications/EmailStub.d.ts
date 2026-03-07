import { NotificationService, BarkEventPayload } from './NotificationService';
export declare class EmailStub implements NotificationService {
    notify(event: BarkEventPayload, _method: 'webhook' | 'email' | 'mqtt'): Promise<void>;
}
//# sourceMappingURL=EmailStub.d.ts.map