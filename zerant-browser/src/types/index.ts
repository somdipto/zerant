export interface BrowserAction {
  type: 'click' | 'fill' | 'navigate' | 'extract' | 'scroll' | 'wait';
  selector?: string;
  value?: string;
  url?: string;
  amount?: number;
  reason?: string;
}

export interface ActionLog {
  id: string;
  action: string;
  status: 'pending' | 'success' | 'error';
  timestamp: number;
}

export type AppMode = 'browser' | 'agent';