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
 * Render the daily health report in English.
 */
export function renderHealthMessage(options: {
  entry: HealthEntry;
  insights: HealthInsights;
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

  return lines.join('\n');
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-IN');
}
