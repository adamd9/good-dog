export interface BarkEventPayload {
  id: string;
  detectorId: string;
  startTime: Date;
  endTime: Date;
  confidence: number;
  audioFilePath?: string | null;
  label?: string | null;
}

export interface NotificationService {
  notify(event: BarkEventPayload, method: 'webhook' | 'email' | 'mqtt'): Promise<void>;
}
