export type HealthWorkout = {
  type: string;
  minutes?: number;
  energyKcal?: number;
};

export type HealthEntry = {
  date: string;
  steps?: number;
  distanceKm?: number;
  activeEnergyKcal?: number;
  exerciseMinutes?: number;
  standHours?: number;
  sleepHours?: number;
  sleepQuality?: string;
  restingHeartRate?: number;
  workouts?: HealthWorkout[];
  notes?: string;
  receivedAt: string;
  postedAt?: string;
  /** Legacy single-group message id, kept for backward-compatible reads. */
  messageId?: string;
  /** Message id per group JID it was posted to. */
  messageIds?: Record<string, string>;
};

export type HealthState = {
  entries: Record<string, HealthEntry>;
};
