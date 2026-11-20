import type { Response } from 'express';

export interface RealtimeEvent {
  type:
    | 'connected'
    | 'import:confirmed'
    | 'import:rolled_back'
    | 'alert:updated'
    | 'record:corrected'
    | 'geo:updated'
    | 'settings:updated'
    | 'branding:updated'
    | 'file:uploaded';
  actor: string;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

const clients = new Set<Response>();

export function registerSseClient(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const hello: RealtimeEvent = {
    type: 'connected',
    actor: 'system',
    message: 'Connected to OHB-OPCMS live update stream',
    timestamp: new Date().toISOString(),
  };
  res.write(`event: ${hello.type}\ndata: ${JSON.stringify(hello)}\n\n`);

  clients.add(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(keepAlive);
      clients.delete(res);
    }
  }, 25000);

  res.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}

export function broadcastEvent(event: Omit<RealtimeEvent, 'timestamp'>): void {
  const payload: RealtimeEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  const serialized = `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try {
      client.write(serialized);
    } catch {
      clients.delete(client);
    }
  }
}
