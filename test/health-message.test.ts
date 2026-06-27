import { describe, expect, it } from 'vitest';
import { renderHealthMessage, type HealthInsights } from '../src/health-message.js';
import type { HealthEntry } from '../src/health-types.js';

const baseInsights: HealthInsights = {
  stepGoal: 8000,
  sleepGoalHours: 6,
  metStepGoal: true,
  metSleepGoal: true,
  streakDays: 1
};

describe('renderHealthMessage', () => {
  it('renders steps, sleep, calories and exercise with goal markers', () => {
    const entry: HealthEntry = {
      date: '2026-06-21',
      steps: 9123,
      sleepHours: 7.5,
      activeEnergyKcal: 520,
      exerciseMinutes: 35,
      receivedAt: '2026-06-21T16:00:00.000Z'
    };

    const message = renderHealthMessage({ entry, insights: baseInsights });

    expect(message).toContain('Health Update');
    expect(message).toContain('Steps: 9,123 / 8,000 ✅');
    expect(message).toContain('Sleep: 7.5h / 6h ✅');
    expect(message).toContain('Active Cal: 520 kcal');
    expect(message).toContain('Exercise: 35 min');
  });

  it('omits calories and exercise when not in payload', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 9000, receivedAt: 'x' };
    const message = renderHealthMessage({ entry, insights: baseInsights });
    expect(message).not.toContain('Active Cal');
    expect(message).not.toContain('Exercise');
  });

  it('marks steps as failed when goal not met', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 5000, receivedAt: 'x' };
    const message = renderHealthMessage({ entry, insights: { ...baseInsights, metStepGoal: false } });
    expect(message).toContain('Steps: 5,000 / 8,000 ❌');
  });

  it('marks sleep as failed when goal not met', () => {
    const entry: HealthEntry = { date: '2026-06-21', sleepHours: 5, receivedAt: 'x' };
    const message = renderHealthMessage({ entry, insights: { ...baseInsights, metSleepGoal: false } });
    expect(message).toContain('Sleep: 5h / 6h ❌');
  });

  it('shows the streak when 2 or more days', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 9000, receivedAt: 'x' };
    const message = renderHealthMessage({ entry, insights: { ...baseInsights, streakDays: 4 } });
    expect(message).toContain('Streak: 4 days');
  });

  it('hides the streak when below 2 days', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 9000, receivedAt: 'x' };
    const message = renderHealthMessage({ entry, insights: { ...baseInsights, streakDays: 1 } });
    expect(message).not.toContain('Streak');
  });

  it('uses the AI summary line when provided', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 9000, receivedAt: 'x' };
    const message = renderHealthMessage({ entry, insights: baseInsights, summary: 'Great work today!' });
    expect(message).toContain('Great work today!');
  });

  it('falls back to default encouragement when both goals met', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 9000, sleepHours: 7, receivedAt: 'x' };
    const message = renderHealthMessage({ entry, insights: baseInsights });
    expect(message).toContain('Crushed it!');
  });

  it('falls back to a bash message when both goals missed', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 5000, sleepHours: 4, receivedAt: 'x' };
    const message = renderHealthMessage({
      entry,
      insights: { ...baseInsights, metStepGoal: false, metSleepGoal: false }
    });
    expect(message).toContain('Do better tomorrow');
  });

  it('bashes only steps when steps missed but sleep met', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 4000, sleepHours: 7, receivedAt: 'x' };
    const message = renderHealthMessage({
      entry,
      insights: { ...baseInsights, metStepGoal: false }
    });
    expect(message).toContain('steps?');
    expect(message).toContain('8,000 is the target');
  });

  it('bashes only sleep when sleep missed but steps met', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 9000, sleepHours: 4.5, receivedAt: 'x' };
    const message = renderHealthMessage({
      entry,
      insights: { ...baseInsights, metSleepGoal: false }
    });
    expect(message).toContain('sleep?');
    expect(message).toContain('aim for 6h');
  });
});
