import { z } from 'zod';
import {
  readFile, readFileSchema,
  writeFile, writeFileSchema,
  editFile, editFileSchema,
  listFiles, listFilesSchema
} from './file.js';
import {
  runCommand, runCommandSchema
} from './command.js';

export interface Tool {
  description: string;
  parameters: z.ZodSchema;
  execute: (args: any) => Promise<ToolResult>;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

export const tools: Record<string, Tool> = {
  read_file: {
    description: 'Read the contents of a file',
    parameters: readFileSchema,
    execute: readFile,
  },
  write_file: {
    description: 'Write or overwrite a file',
    parameters: writeFileSchema,
    execute: writeFile,
  },
  edit_file: {
    description: 'Make targeted edits to a file using search/replace',
    parameters: editFileSchema,
    execute: editFile,
  },
  list_files: {
    description: 'List files in a directory',
    parameters: listFilesSchema,
    execute: listFiles,
  },
  run_command: {
    description: 'Execute a shell command',
    parameters: runCommandSchema,
    execute: runCommand,
  },
};

export async function executeTool(name: string, args: any): Promise<ToolResult> {
  const tool = tools[name];
  if (!tool) {
    return { content: `Unknown tool: ${name}`, isError: true };
  }
  return tool.execute(args);
}
