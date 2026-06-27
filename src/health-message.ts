import type { HealthEntry } from './health-types.js';

export type HealthInsights = {
  stepGoal: number;
  streakDays: number;
  metStepGoal: boolean;
  trailingAverageSteps?: number;
};

/**
 * Render the daily health report in Hindi. `summary`, when provided, is an
 * AI-generated friendly line that replaces the default encouragement line.
 */
export function renderHealthMessage(options: {
  entry: HealthEntry;
  insights: HealthInsights;
  summary?: string;
}): string {
  const { entry, insights } = options;
  const lines: string[] = ['🩺 आज की सेहत रिपोर्ट', ''];

  if (entry.steps !== undefined) {
    const goalMark = insights.metStepGoal ? ' ✅' : '';
    lines.push(`👟 कदम: ${formatNumber(entry.steps)}${goalMark}`);
  }

  if (entry.distanceKm !== undefined) {
    lines.push(`📏 दूरी: ${entry.distanceKm} किमी`);
  }

  if (entry.exerciseMinutes !== undefined) {
    lines.push(`🏃 व्यायाम: ${entry.exerciseMinutes} मिनट`);
  } else if (hasWorkout(entry)) {
    lines.push('🏃 व्यायाम: हाँ');
  }

  if (entry.activeEnergyKcal !== undefined) {
    lines.push(`🔥 सक्रिय ऊर्जा: ${formatNumber(entry.activeEnergyKcal)} कैलोरी`);
  }

  if (entry.sleepHours !== undefined) {
    const quality = entry.sleepQuality ? ` (${entry.sleepQuality})` : '';
    lines.push(`😴 नींद: ${entry.sleepHours} घंटे${quality}`);
  } else if (entry.sleepQuality !== undefined) {
    lines.push(`😴 नींद: ${entry.sleepQuality}`);
  }

  if (entry.restingHeartRate !== undefined) {
    lines.push(`❤️ विश्राम हृदय गति: ${entry.restingHeartRate} बीपीएम`);
  }

  if (entry.workouts && entry.workouts.length > 0) {
    const workoutText = entry.workouts
      .map((workout) => {
        const parts = [workout.type];
        if (workout.minutes !== undefined) {
          parts.push(`${workout.minutes} मिनट`);
        }
        return parts.join(' · ');
      })
      .join(', ');
    lines.push(`💪 वर्कआउट: ${workoutText}`);
  }

  if (entry.notes !== undefined) {
    lines.push(`📝 ${entry.notes}`);
  }

  // Insights block.
  const insightLines: string[] = [];
  if (insights.streakDays >= 2) {
    insightLines.push(`🔥 ${insights.streakDays} दिन से कदमों का लक्ष्य पूरा — शानदार!`);
  }
  if (insights.trailingAverageSteps !== undefined) {
    insightLines.push(`📊 7-दिन औसत कदम: ${formatNumber(insights.trailingAverageSteps)}`);
  }

  if (insightLines.length > 0) {
    lines.push('', ...insightLines);
  }

  const closing = options.summary?.trim() || defaultEncouragement(entry, insights);
  lines.push('', `🌱 ${closing}`);

  return lines.join('\n');
}

function hasWorkout(entry: HealthEntry): boolean {
  return Boolean(entry.workouts && entry.workouts.length > 0);
}

function defaultEncouragement(entry: HealthEntry, insights: HealthInsights): string {
  if (insights.metStepGoal) {
    return 'बढ़िया! आज का लक्ष्य पूरा हुआ। कल भी ऐसे ही चलते रहिए।';
  }
  if (entry.steps !== undefined) {
    return 'अच्छा प्रयास! थोड़ी और सैर के साथ कल लक्ष्य पूरा कर सकते हैं।';
  }
  return 'सेहत का ध्यान रखिए। छोटे कदम बड़ा फर्क लाते हैं।';
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-IN');
}
