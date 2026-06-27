import { describe, expect, it } from 'vitest';
import { renderHealthMessage, type HealthInsights } from '../src/health-message.js';
import type { HealthEntry } from '../src/health-types.js';

const baseInsights: HealthInsights = {
  stepGoal: 8000,
  metStepGoal: true,
  streakDays: 1
};

describe('renderHealthMessage', () => {
  it('renders core stats with a goal check mark when met', () => {
    const entry: HealthEntry = {
      date: '2026-06-21',
      steps: 9123,
      distanceKm: 6.4,
      exerciseMinutes: 35,
      sleepHours: 7.5,
      sleepQuality: 'अच्छी',
      restingHeartRate: 58,
      receivedAt: '2026-06-21T16:00:00.000Z'
    };

    const message = renderHealthMessage({ entry, insights: baseInsights });

    expect(message).toContain('🩺 आज की सेहत रिपोर्ट');
    expect(message).toContain('👟 कदम: 9,123 ✅');
    expect(message).toContain('📏 दूरी: 6.4 किमी');
    expect(message).toContain('🏃 व्यायाम: 35 मिनट');
    expect(message).toContain('😴 नींद: 7.5 घंटे (अच्छी)');
    expect(message).toContain('❤️ विश्राम हृदय गति: 58 बीपीएम');
  });

  it('shows the streak insight when 2 or more days', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 9000, receivedAt: 'x' };
    const message = renderHealthMessage({
      entry,
      insights: { ...baseInsights, streakDays: 4 }
    });
    expect(message).toContain('🔥 4 दिन से कदमों का लक्ष्य पूरा');
  });

  it('includes the 7-day average when available', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 9000, receivedAt: 'x' };
    const message = renderHealthMessage({
      entry,
      insights: { ...baseInsights, trailingAverageSteps: 7500 }
    });
    expect(message).toContain('📊 7-दिन औसत कदम: 7,500');
  });

  it('uses the AI summary line when provided', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 9000, receivedAt: 'x' };
    const message = renderHealthMessage({ entry, insights: baseInsights, summary: 'शानदार दिन रहा!' });
    expect(message).toContain('🌱 शानदार दिन रहा!');
  });

  it('falls back to default encouragement without a summary', () => {
    const entry: HealthEntry = { date: '2026-06-21', steps: 5000, receivedAt: 'x' };
    const message = renderHealthMessage({
      entry,
      insights: { ...baseInsights, metStepGoal: false }
    });
    expect(message).toContain('🌱');
    expect(message).not.toContain('✅');
  });

  it('renders workout details', () => {
    const entry: HealthEntry = {
      date: '2026-06-21',
      workouts: [{ type: 'Running', minutes: 30 }],
      receivedAt: 'x'
    };
    const message = renderHealthMessage({ entry, insights: { ...baseInsights, metStepGoal: false, streakDays: 0 } });
    expect(message).toContain('💪 वर्कआउट: Running · 30 मिनट');
  });
});
