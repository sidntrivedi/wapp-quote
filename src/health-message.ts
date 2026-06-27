import type { HealthEntry } from './health-types.js';

export type HealthInsights = {
  stepGoal: number;
  sleepGoalHours: number;
  streakDays: number;
  metStepGoal: boolean;
  metSleepGoal: boolean;
  trailingAverageSteps?: number;
};

/**
 * Render the daily health report in English. `summary`, when provided, is an
 * AI-generated closing line that replaces the built-in default.
 */
export function renderHealthMessage(options: {
  entry: HealthEntry;
  insights: HealthInsights;
  summary?: string;
}): string {
  const { entry, insights } = options;
  const lines: string[] = ['💪 Health Update', ''];

  // Steps
  if (entry.steps !== undefined) {
    const mark = insights.metStepGoal ? ' ✅' : ' ❌';
    lines.push(`👟 Steps: ${formatNumber(entry.steps)} / ${formatNumber(insights.stepGoal)}${mark}`);
  }

  // Sleep
  if (entry.sleepHours !== undefined) {
    const mark = insights.metSleepGoal ? ' ✅' : ' ❌';
    lines.push(`😴 Sleep: ${entry.sleepHours}h / ${insights.sleepGoalHours}h${mark}`);
  }

  // Active calories
  if (entry.activeEnergyKcal !== undefined) {
    lines.push(`🔥 Active Cal: ${formatNumber(entry.activeEnergyKcal)} kcal`);
  }

  // Exercise minutes
  if (entry.exerciseMinutes !== undefined) {
    lines.push(`🏃 Exercise: ${entry.exerciseMinutes} min`);
  }

  // Streak
  if (insights.streakDays >= 2) {
    lines.push(`⚡ Streak: ${insights.streakDays} days`);
  }

  // Closing line
  const closing = options.summary?.trim() || defaultEncouragement(entry, insights);
  lines.push('', closing);

  return lines.join('\n');
}

function defaultEncouragement(entry: HealthEntry, insights: HealthInsights): string {
  const bothMet = insights.metStepGoal && (entry.sleepHours === undefined || insights.metSleepGoal);
  const neitherMet = !insights.metStepGoal && entry.sleepHours !== undefined && !insights.metSleepGoal;

  if (bothMet) {
    return "Crushed it! Both goals done. Keep the momentum going.";
  }
  if (neitherMet) {
    return `Come on — ${formatNumber(insights.stepGoal)} steps and ${insights.sleepGoalHours}h sleep aren't optional. Do better tomorrow.`;
  }
  if (!insights.metStepGoal && entry.steps !== undefined) {
    return `Only ${formatNumber(entry.steps)} steps? Move more. ${formatNumber(insights.stepGoal)} is the target.`;
  }
  if (entry.sleepHours !== undefined && !insights.metSleepGoal) {
    return `Only ${entry.sleepHours}h of sleep? Rest up — aim for ${insights.sleepGoalHours}h.`;
  }
  return 'Goals met. Stay consistent.';
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-IN');
}
