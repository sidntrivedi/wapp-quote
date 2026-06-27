import process from 'node:process';
import type { Logger } from 'pino';
import type { AppConfig } from './config.js';
import type { HealthInsights } from './health-message.js';
import type { HealthEntry } from './health-types.js';

type SummaryConfig = Pick<
  AppConfig,
  'aiProvider' | 'ollamaBaseUrl' | 'ollamaModel' | 'openaiModel' | 'aiTimeoutMs' | 'aiTemperature'
>;

type OllamaChatResponse = {
  message?: { content?: string };
  error?: string;
};

type OpenAiChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

/**
 * Generate a warm one-line Hindi encouragement based on the day's health
 * stats. Returns undefined when AI is disabled or fails, so the caller can
 * fall back to the built-in default encouragement.
 */
export async function generateHealthSummary(options: {
  entry: HealthEntry;
  insights: HealthInsights;
  config: SummaryConfig;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}): Promise<string | undefined> {
  if (options.config.aiProvider === 'none') {
    return undefined;
  }

  try {
    const summary =
      options.config.aiProvider === 'openai'
        ? await generateOpenAiSummary(options)
        : await generateOllamaCloudSummary(options);
    return validateSummary(summary);
  } catch (error) {
    options.logger?.warn({ err: error, date: options.entry.date }, 'AI health summary failed; using default');
    return undefined;
  }
}

async function generateOllamaCloudSummary(options: {
  entry: HealthEntry;
  insights: HealthInsights;
  config: SummaryConfig;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.config.aiTimeoutMs);

  try {
    const response = await fetchImpl(`${options.config.ollamaBaseUrl}/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${readOllamaApiKey()}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: options.config.ollamaModel,
        stream: false,
        messages: summaryMessages(options.entry, options.insights),
        options: { temperature: options.config.aiTemperature }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama Cloud request failed: ${response.status}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    const content = data.message?.content;
    if (!content) {
      throw new Error(data.error ?? 'Ollama Cloud response did not include message content');
    }
    return parseSummaryJson(content);
  } finally {
    clearTimeout(timeout);
  }
}

async function generateOpenAiSummary(options: {
  entry: HealthEntry;
  insights: HealthInsights;
  config: SummaryConfig;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.config.aiTimeoutMs);

  try {
    const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${readOpenAiApiKey()}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: options.config.openaiModel,
        messages: summaryMessages(options.entry, options.insights),
        temperature: options.config.aiTemperature,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}`);
    }

    const data = (await response.json()) as OpenAiChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(data.error?.message ?? 'OpenAI response did not include message content');
    }
    return parseSummaryJson(content);
  } finally {
    clearTimeout(timeout);
  }
}

function summaryMessages(entry: HealthEntry, insights: HealthInsights): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'Return only valid JSON.',
        "Write one short English sentence (under 20 words) reacting to the day's health stats.",
        'Goals are: steps >= stepGoal, sleep >= sleepGoalHours.',
        'If both goals are met: be genuinely encouraging.',
        'If goals are missed: be blunt and push them to do better tomorrow — no sugarcoating.',
        'No emojis, no fluff, no medical advice.',
        '{"summary":"..."}'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        steps: entry.steps,
        stepGoal: insights.stepGoal,
        metStepGoal: insights.metStepGoal,
        sleepHours: entry.sleepHours,
        sleepGoalHours: insights.sleepGoalHours,
        metSleepGoal: insights.metSleepGoal,
        streakDays: insights.streakDays
      })
    }
  ];
}

function readOllamaApiKey(): string {
  return process.env.OLLAMA_API_KEY?.trim() ?? '';
}

function readOpenAiApiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() ?? '';
}

function parseSummaryJson(content: string): string {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(trimmed) as { summary?: unknown };
  if (typeof parsed.summary !== 'string') {
    throw new Error('AI response JSON did not include a string summary');
  }
  return parsed.summary;
}

function validateSummary(summary: string): string {
  const normalized = summary.replace(/\s+/g, ' ').trim();

  if (normalized.length < 8 || normalized.length > 180) {
    throw new Error('AI health summary length is outside the allowed range');
  }

  if (/[\n\r]/.test(normalized)) {
    throw new Error('AI health summary must be one line');
  }

  if (!/[a-zA-Z]/.test(normalized)) {
    throw new Error('AI health summary must contain English text');
  }

  return normalized;
}
