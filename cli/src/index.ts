#!/usr/bin/env node

import { runAgent } from './agent.js';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  options: {
    model: { type: 'string', default: 'anthropic/claude-3.5-sonnet' },
    'max-tokens': { type: 'string', default: '4096' },
    'output-format': { type: 'string', default: 'stream-json' },
    print: { type: 'boolean', default: false },
    'api-key': { type: 'string' },
  },
  allowPositionals: true,
});

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

const prompt = values.print ? await readStdin() : positionals.join(' ');

if (!prompt) {
  console.error('Error: No prompt provided');
  process.exit(1);
}

const apiKey = values['api-key'] || process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('Error: OPENROUTER_API_KEY is required');
  process.exit(1);
}

await runAgent({
  prompt,
  model: values.model!,
  maxTokens: parseInt(values['max-tokens']!, 10),
  apiKey,
  outputFormat: values['output-format'] as 'stream-json' | 'text',
});
