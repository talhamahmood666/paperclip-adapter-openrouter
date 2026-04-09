export interface AssistantEvent {
  type: 'assistant';
  content: string;
}

export interface ToolUseEvent {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultEvent {
  type: 'tool_result';
  id: string;
  content: string;
  is_error: boolean;
  duration_ms: number;
}

export interface DoneEvent {
  type: 'done';
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type StreamEvent = 
  | AssistantEvent
  | ToolUseEvent
  | ToolResultEvent
  | DoneEvent
  | ErrorEvent;

export function emitEvent(event: StreamEvent) {
  process.stdout.write(JSON.stringify(event) + '\n');
}
