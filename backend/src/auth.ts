import { Request, Response, NextFunction } from 'express';
import { config } from './config';

const PUBLIC_PATHS = ['/health', '/metrics'];

export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (PUBLIC_PATHS.some(p => req.path.startsWith(p))) {
    next();
    return;
  }
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'];
  
  let key: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    key = authHeader.slice(7);
  } else if (typeof apiKeyHeader === 'string') {
    key = apiKeyHeader;
  }

  if (key === config.apiKey) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
