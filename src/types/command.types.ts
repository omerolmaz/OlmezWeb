export type CommandStatus =
  | 'Pending'
  | 'Sent'
  | 'Running'
  | 'Success'
  | 'Completed'
  | 'Failed'
  | 'Error'
  | 'Cancelled';

export interface CommandExecution {
  id: string;
  deviceId: string;
  userId: string;
  commandType: string;
  category?: string;
  parameters?: string;
  status: CommandStatus;
  result?: string;
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
  executionDurationMs?: number;
}

export interface ExecuteCommandRequest {
  deviceId: string;
  commandType: string;
  parameters?: Record<string, unknown> | string | null;
}

export interface ExecuteCommandResponse {
  id: string;
  deviceId: string;
  userId: string;
  commandType: string;
  status: CommandStatus;
  parameters?: string;
  createdAt: string;
}

export interface CommandResultPayload<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  command?: CommandExecution;
}

export interface ActiveConnectionsSnapshot {
  connectedCount: number;
  deviceIds: string[];
  timestamp: string;
}
