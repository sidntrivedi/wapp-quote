#!/usr/bin/env node
import process from 'node:process';
import { ZodError } from 'zod';
import { runCommand, type Command } from './commands.js';
import { loadConfig, validateHealthEnvironment } from './config.js';
import { createLogger } from './logger.js';
import { StateStore } from './state-store.js';
import { BaileysWhatsAppSender } from './whatsapp.js';
import { validateAiEnvironment } from './ai-reflection.js';

const knownCommands = new Set<Command>(['serve', 'pair', 'pair-qr', 'reset-auth', 'list-groups', 'send-now', 'preview', 'help']);

async function main(): Promise<Command> {
  const config = loadConfig();
  const command = parseCommand(process.argv[2]);
  const effectiveConfig = command === 'pair-qr' ? { ...config, authMethod: 'qr' as const } : config;
  validateAiEnvironment(effectiveConfig);
  validateHealthEnvironment(effectiveConfig);
  const logger = createLogger(effectiveConfig);
  const sender = new BaileysWhatsAppSender(effectiveConfig, logger);
  const stateStore = new StateStore(effectiveConfig.stateFile);

  await runCommand({ command, config: effectiveConfig, logger, sender, stateStore });
  return command;
}

function parseCommand(value: string | undefined): Command {
  if (!value) {
    return 'help';
  }

  if (knownCommands.has(value as Command)) {
    return value as Command;
  }

  throw new Error(`Unknown command: ${value}`);
}

main()
  .then((command) => {
    if (command !== 'serve') {
      process.exit(0);
    }
  })
  .catch((error: unknown) => {
    if (error instanceof ZodError) {
      console.error('Invalid environment configuration:');
      for (const issue of error.issues) {
        console.error(`- ${issue.path.join('.')}: ${issue.message}`);
      }
    } else {
      console.error(error instanceof Error ? error.message : error);
    }

    process.exit(1);
  });
