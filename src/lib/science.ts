export type Goal = 'Lean bulk' | 'Fat loss' | 'Strength' | 'Hypertrophy' | 'Recomposition';
export type Experience = 'Beginner' | 'Intermediate' | 'Advanced';
export type DietStyle = 'Balanced' | 'High protein' | 'Plant forward' | 'Low appetite';
export type Sex = 'Male' | 'Female' | 'Other';
export type Equipment = 'Full gym' | 'Home gym' | 'Dumbbells' | 'Bodyweight';

export type Profile = {
  name: string;
  goal: Goal;
  goalDetail: string;
  experience: Experience;
  dietStyle: DietStyle;
  equipment: Equipment;
  focusAreas: string;
  limitations: string;
  age: number;
  sex: Sex;
  trainingDays: number;
  heightCm: number;
  weightKg: number;
  sleepHours: number;
  soreness: number;
};

export type WorkoutSet = {
  id: string;
  exercise: string;
  muscle: string;
  sets: number;
  reps: number;
  load: number;
  rpe: number;
  createdAt: string;
};

export type MealLog = {
  id: string;
  meal: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: string;
};

export type UploadAsset = {
  id: string;
  name: string;
  kind: 'image' | 'video';
  size: number;
  mimeType?: string;
  url: string;
  remotePath?: string;
  status: string;
  note: string;
  createdAt: string;
};

export type Citation = {
  title: string;
  source: string;
  url?: string;
  year?: string;
};

export const defaultProfile: Profile = {
  name: 'Athlete',
  goal: 'Lean bulk',
  goalDetail: '',
  experience: 'Intermediate',
  dietStyle: 'High protein',
  equipment: 'Full gym',
  focusAreas: '',
  limitations: '',
  age: 28,
  sex: 'Male',
  trainingDays: 4,
  heightCm: 175,
  weightKg: 74,
  sleepHours: 7.2,
  soreness: 3
};

export const starterWorkouts: WorkoutSet[] = [];
export const starterMeals: MealLog[] = [];

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeProfile(profile: Profile): Profile {
  return {
    ...defaultProfile,
    ...profile,
    age: Number(profile.age) || defaultProfile.age,
    trainingDays: Number(profile.trainingDays) || defaultProfile.trainingDays,
    heightCm: Number(profile.heightCm) || defaultProfile.heightCm,
    weightKg: Number(profile.weightKg) || defaultProfile.weightKg,
    sleepHours: Number(profile.sleepHours) || defaultProfile.sleepHours,
    soreness: Number(profile.soreness) || defaultProfile.soreness,
    goalDetail: profile.goalDetail ?? '',
    focusAreas: profile.focusAreas ?? '',
    limitations: profile.limitations ?? ''
  };
}

export function getReadiness(profile: Profile, workouts: WorkoutSet[]) {
  const athlete = normalizeProfile(profile);
  const averageRpe =
    workouts.length > 0 ? workouts.reduce((sum, item) => sum + item.rpe, 0) / workouts.length : 7;
  const sleepScore = clampNumber((athlete.sleepHours / 8) * 42, 18, 42);
  const sorenessPenalty = athlete.soreness * 5;
  const intensityPenalty = Math.max(0, averageRpe - 7) * 7;
  return Math.round(clampNumber(86 + sleepScore - sorenessPenalty - intensityPenalty - 28, 35, 96));
}

export function getNutritionTargets(profile: Profile) {
  const athlete = normalizeProfile(profile);
  const sexOffset = athlete.sex === 'Female' ? -161 : athlete.sex === 'Male' ? 5 : -78;
  const bmr = 10 * athlete.weightKg + 6.25 * athlete.heightCm - 5 * athlete.age + sexOffset;
  const activity = 1.42 + athlete.trainingDays * 0.045;
  const maintenance = Math.round(bmr * activity);
  const goalAdjustment: Record<Goal, number> = {
    'Lean bulk': 240,
    'Fat loss': -420,
    Strength: 130,
    Hypertrophy: 180,
    Recomposition: -80
  };
  const calories = maintenance + goalAdjustment[athlete.goal];
  const proteinMultiplier = athlete.goal === 'Fat loss' || athlete.goal === 'Recomposition' ? 2.1 : 1.8;
  const protein = Math.round(athlete.weightKg * proteinMultiplier);
  const fat = Math.round(athlete.weightKg * 0.8);
  const carbs = Math.max(100, Math.round((calories - protein * 4 - fat * 9) / 4));

  return { calories, protein, carbs, fat };
}

export function getWeeklyVolume(workouts: WorkoutSet[]) {
  return workouts.reduce((sum, item) => sum + item.sets, 0);
}

export function getTopLift(workouts: WorkoutSet[]) {
  if (!workouts.length) {
    return { exercise: 'No lift logged', estimate: 0 };
  }

  return workouts
    .map((item) => ({
      exercise: item.exercise,
      estimate: Math.round(item.load * (1 + item.reps / 30))
    }))
    .sort((a, b) => b.estimate - a.estimate)[0];
}

export function generateSplit(profile: Profile) {
  const athlete = normalizeProfile(profile);
  const days = clampNumber(Math.round(athlete.trainingDays), 3, 6);
  const volumeBias = athlete.experience === 'Advanced' ? 18 : athlete.experience === 'Intermediate' ? 14 : 10;
  const strengthBias = athlete.goal === 'Strength';
  const focus = athlete.focusAreas.trim();
  const limited = athlete.limitations.trim();
  const gymTemplates = [
    {
      day: 'Lower A',
      focus: strengthBias ? 'Squat strength' : 'Quad volume',
      work: ['Back squat 4x4-6', 'Leg press 3x8-12', 'Romanian deadlift 3x6-10', 'Calf raise 3x10-15'],
      cue: 'Top set at RPE 8, then back-off work 6 to 10 percent lighter.'
    },
    {
      day: 'Upper A',
      focus: strengthBias ? 'Bench strength' : 'Chest and back',
      work: ['Bench press 4x4-6', 'Chest-supported row 4x8-10', 'Incline DB press 3x8-12', 'Lat pulldown 3x10-12'],
      cue: 'Keep pressing and pulling volume balanced across the week.'
    },
    {
      day: 'Lower B',
      focus: 'Posterior chain',
      work: ['Deadlift 3x3-5', 'Front squat 3x6-8', 'Hamstring curl 3x10-15', 'Split squat 2x10 each'],
      cue: 'Stop deadlift volume early if bar speed drops hard.'
    },
    {
      day: 'Upper B',
      focus: 'Shoulders and arms',
      work: ['Overhead press 3x5-8', 'Pull-up 4x6-10', 'Cable fly 2x12-15', 'Lateral raise 4x12-20'],
      cue: 'Most isolation sets can live at RPE 8 to 9.'
    },
    {
      day: 'Full Body C',
      focus: 'Hypertrophy density',
      work: ['Hack squat 3x8-12', 'DB bench 3x8-12', 'Seated row 3x10-12', 'Curl plus triceps superset 3x12'],
      cue: 'Use shorter rests here, not on heavy compounds.'
    },
    {
      day: 'Recovery Output',
      focus: 'Zone 2 plus mobility',
      work: ['Zone 2 bike 25 min', 'Hip mobility 8 min', 'Thoracic rotations 6 min', 'Optional weak-point pump 2x15'],
      cue: 'Keep this easy enough to improve the next lift.'
    }
  ];
  const dumbbellTemplates = [
    {
      day: 'Lower A',
      focus: 'Single-leg strength',
      work: ['DB split squat 4x8-10', 'DB Romanian deadlift 4x8-12', 'Goblet squat 3x10-15', 'Standing calf raise 3x12-20'],
      cue: 'Use slower eccentrics when load is limited.'
    },
    {
      day: 'Upper A',
      focus: 'Press and row',
      work: ['DB bench press 4x8-12', 'One-arm DB row 4x8-12', 'DB incline press 3x10-12', 'Rear delt raise 3x12-20'],
      cue: 'Add reps first, then load when every set is clean.'
    },
    {
      day: 'Lower B',
      focus: 'Posterior chain',
      work: ['DB hip thrust 4x10-15', 'Reverse lunge 3x8-12 each', 'DB RDL 3x10-12', 'Hamstring slider curl 3x8-12'],
      cue: 'Keep two reps in reserve on unilateral work.'
    },
    {
      day: 'Upper B',
      focus: 'Shoulders and arms',
      work: ['Seated DB press 4x6-10', 'Pull-up or band pulldown 4x6-12', 'Lateral raise 4x12-20', 'Curl plus extension 3x10-15'],
      cue: 'Isolation work can run close to failure.'
    },
    {
      day: 'Full Body C',
      focus: 'Density',
      work: ['Goblet squat 3x12', 'Push-up 3xAMRAP', 'DB row 3x12', 'Loaded carry 4x40 sec'],
      cue: 'Use density work to raise output without joint stress.'
    },
    {
      day: 'Recovery Output',
      focus: 'Conditioning',
      work: ['Incline walk 25 min', 'Hip mobility 8 min', 'Thoracic rotations 6 min', 'Easy pump circuit 2 rounds'],
      cue: 'Leave this session feeling better than you started.'
    }
  ];
  const bodyweightTemplates = [
    {
      day: 'Lower A',
      focus: 'Quads and glutes',
      work: ['Split squat 4x10-15', 'Step-up 3x10 each', 'Single-leg hip bridge 3x12-15', 'Wall sit 3x45 sec'],
      cue: 'Use tempo and range before adding external load.'
    },
    {
      day: 'Upper A',
      focus: 'Push and pull',
      work: ['Push-up variation 4x8-20', 'Inverted row 4x8-15', 'Pike push-up 3x6-12', 'Band pull-apart 3x15-25'],
      cue: 'Choose variations that land near two reps in reserve.'
    },
    {
      day: 'Lower B',
      focus: 'Posterior chain',
      work: ['Single-leg RDL reach 4x10 each', 'Reverse lunge 3x12 each', 'Hamstring slider curl 3x8-12', 'Calf raise 4x15-25'],
      cue: 'Own balance before chasing fatigue.'
    },
    {
      day: 'Upper B',
      focus: 'Shoulders and arms',
      work: ['Feet-elevated push-up 4x8-15', 'Chin-up or band row 4x6-12', 'Chair dip 3x8-15', 'Lateral raise with band 3x15-25'],
      cue: 'Stop dips if shoulder position feels unstable.'
    },
    {
      day: 'Full Body C',
      focus: 'Hypertrophy circuit',
      work: ['Squat jump 3x6', 'Push-up 3xAMRAP', 'Row variation 3xAMRAP', 'Plank 3x45 sec'],
      cue: 'Keep conditioning hard but technically crisp.'
    },
    {
      day: 'Recovery Output',
      focus: 'Zone 2 plus mobility',
      work: ['Brisk walk 30 min', 'Hip mobility 8 min', 'Thoracic rotations 6 min', 'Breathing reset 4 min'],
      cue: 'Recovery sessions should not compete with the next lift.'
    }
  ];
  const templates =
    athlete.equipment === 'Bodyweight'
      ? bodyweightTemplates
      : athlete.equipment === 'Dumbbells' || athlete.equipment === 'Home gym'
        ? dumbbellTemplates
        : gymTemplates;

  return templates.slice(0, days).map((item, index) => ({
    ...item,
    focus: focus ? `${item.focus} with emphasis on ${focus}` : item.focus,
    cue: limited && limited.toLowerCase() !== 'none' ? `${item.cue} Respect limitation: ${limited}.` : item.cue,
    volume: Math.max(8, volumeBias + (index % 2 === 0 ? 1 : -1))
  }));
}
