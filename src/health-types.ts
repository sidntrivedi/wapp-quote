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
  messageId?: string;
};

export type HealthState = {
  entries: Record<string, HealthEntry>;
};
