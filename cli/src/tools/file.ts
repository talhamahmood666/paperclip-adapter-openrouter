import fs from 'node:fs/promises';
import path from 'node:path';
import type { ToolResult } from './index.js';
import { z } from 'zod';

export const readFileSchema = z.object({
  path: z.string().describe('Absolute or relative path to the file'),
  offset: z.number().optional().describe('Line number to start reading from'),
  limit: z.number().optional().describe('Number of lines to read'),
});

export async function readFile(args: z.infer<typeof readFileSchema>): Promise<ToolResult> {
  try {
    const resolved = path.resolve(args.path);
    let content = await fs.readFile(resolved, 'utf-8');
    const lines = content.split('\n');
    const start = args.offset || 0;
    const end = args.limit ? start + args.limit : lines.length;
    content = lines.slice(start, end).join('\n');
    return { content, isError: false };
  } catch (error) {
    return { content: `Error reading file: ${error}`, isError: true };
  }
}

export const writeFileSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export async function writeFile(args: z.infer<typeof writeFileSchema>): Promise<ToolResult> {
  try {
    const resolved = path.resolve(args.path);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, args.content, 'utf-8');
    return { content: `Successfully wrote to ${args.path}`, isError: false };
  } catch (error) {
    return { content: `Error writing file: ${error}`, isError: true };
  }
}

export const editFileSchema = z.object({
  path: z.string(),
  edits: z.array(z.object({
    old_string: z.string(),
    new_string: z.string(),
  })),
});

export async function editFile(args: z.infer<typeof editFileSchema>): Promise<ToolResult> {
  try {
    const resolved = path.resolve(args.path);
    let content = await fs.readFile(resolved, 'utf-8');
    for (const edit of args.edits) {
      if (!content.includes(edit.old_string)) {
        return { content: `Could not find string to replace: ${edit.old_string}`, isError: true };
      }
      content = content.replace(edit.old_string, edit.new_string);
    }
    await fs.writeFile(resolved, content, 'utf-8');
    return { content: `Successfully edited ${args.path}`, isError: false };
  } catch (error) {
    return { content: `Error editing file: ${error}`, isError: true };
  }
}

export const listFilesSchema = z.object({
  path: z.string().optional(),
  recursive: z.boolean().optional(),
});

export async function listFiles(args: z.infer<typeof listFilesSchema>): Promise<ToolResult> {
  try {
    const target = args.path ? path.resolve(args.path) : process.cwd();
    const entries = await fs.readdir(target, { withFileTypes: true });
    const lines = entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`);
    return { content: lines.join('\n'), isError: false };
  } catch (error) {
    return { content: `Error listing files: ${error}`, isError: true };
  }
}
