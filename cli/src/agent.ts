import { streamResponse } from './openrouter.js';
import { tools, executeTool } from './tools/index.js';
import { emitEvent } from './stream.js';
import type { CoreMessage, ToolCallPart, ToolResultPart } from 'ai';

export interface AgentOptions {
  prompt: string;
  model: string;
  maxTokens: number;
  apiKey: string;
  outputFormat: 'stream-json' | 'text';
}

export async function runAgent(options: AgentOptions) {
  const messages: CoreMessage[] = [
    { role: 'user', content: options.prompt }
  ];

  const toolDefinitions = Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [name, {
      description: tool.description,
      parameters: tool.parameters,
    }])
  );

  let iteration = 0;
  const MAX_ITERATIONS = 25;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    let fullText = '';
    let toolCalls: ToolCallPart[] = [];

    for await (const chunk of streamResponse(
      { apiKey: options.apiKey, model: options.model, maxTokens: options.maxTokens },
      messages,
      toolDefinitions
    )) {
      if (chunk.type === 'text' && chunk.content) {
        fullText += chunk.content;
        if (options.outputFormat === 'stream-json') {
          emitEvent({ type: 'assistant', content: chunk.content });
        } else {
          process.stdout.write(chunk.content);
        }
      } else if (chunk.type === 'response' && chunk.response) {
        const assistantMessage = chunk.response.messages[0];
        messages.push(assistantMessage);
        
        // Filter tool-call parts from content array
        const content = assistantMessage.content;
        if (Array.isArray(content)) {
          toolCalls = content.filter(
            (part): part is ToolCallPart => part.type === 'tool-call'
          );
        }
      }
    }

    if (toolCalls.length === 0) {
      if (options.outputFormat === 'stream-json') {
        emitEvent({ type: 'done' });
      }
      break;
    }

    const toolResults: ToolResultPart[] = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const start = Date.now();
        try {
          if (options.outputFormat === 'stream-json') {
            emitEvent({
              type: 'tool_use',
              id: toolCall.toolCallId,
              name: toolCall.toolName,
              input: toolCall.args,
            });
          }

          const result = await executeTool(toolCall.toolName, toolCall.args);

          if (options.outputFormat === 'stream-json') {
            emitEvent({
              type: 'tool_result',
              id: toolCall.toolCallId,
              content: result.content,
              is_error: result.isError,
              duration_ms: Date.now() - start,
            });
          }

          return {
            type: 'tool-result' as const,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            result: result.content,
            isError: result.isError,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (options.outputFormat === 'stream-json') {
            emitEvent({
              type: 'tool_result',
              id: toolCall.toolCallId,
              content: errorMessage,
              is_error: true,
              duration_ms: Date.now() - start,
            });
          }
          return {
            type: 'tool-result' as const,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            result: errorMessage,
            isError: true,
          };
        }
      })
    );

    messages.push({
      role: 'tool',
      content: toolResults,
    });
  }

  if (iteration >= MAX_ITERATIONS) {
    if (options.outputFormat === 'stream-json') {
      emitEvent({ type: 'error', message: 'Max iterations reached' });
    }
  }
}
