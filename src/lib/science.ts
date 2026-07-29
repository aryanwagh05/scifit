export type Goal = 'Lean bulk' | 'Fat loss' | 'Strength' | 'Hypertrophy' | 'Recomposition';
export type Experience = 'Beginner' | 'Intermediate' | 'Advanced';
export type DietStyle = 'Balanced' | 'High protein' | 'Plant forward' | 'Low appetite';

export type Profile = {
  name: string;
  goal: Goal;
  experience: Experience;
  dietStyle: DietStyle;
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
  url: string;
  remotePath?: string;
  status: string;
  note: string;
  createdAt: string;
};

export type Citation = {
  title: string;
  source: string;
};

export const defaultProfile: Profile = {
  name: 'Aryan',
  goal: 'Lean bulk',
  experience: 'Intermediate',
  dietStyle: 'High protein',
  trainingDays: 4,
  heightCm: 175,
  weightKg: 74,
  sleepHours: 7.2,
  soreness: 3
};

export const starterWorkouts: WorkoutSet[] = [
  {
    id: 'seed-1',
    exercise: 'Back squat',
    muscle: 'Quads',
    sets: 4,
    reps: 6,
    load: 185,
    rpe: 8,
    createdAt: new Date().toISOString()
  },
  {
    id: 'seed-2',
    exercise: 'Bench press',
    muscle: 'Chest',
    sets: 3,
    reps: 8,
    load: 145,
    rpe: 7.5,
    createdAt: new Date().toISOString()
  },
  {
    id: 'seed-3',
    exercise: 'Romanian deadlift',
    muscle: 'Hamstrings',
    sets: 3,
    reps: 9,
    load: 165,
    rpe: 7,
    createdAt: new Date().toISOString()
  }
];

export const starterMeals: MealLog[] = [
  {
    id: 'meal-1',
    meal: 'Greek yogurt bowl',
    calories: 430,
    protein: 42,
    carbs: 48,
    fat: 9,
    createdAt: new Date().toISOString()
  }
];

export const researchCards = [
  {
    title: 'Hypertrophy Volume',
    source: 'Schoenfeld et al., resistance training volume meta-analysis',
    takeaway: 'Most lifters progress well with roughly 10 to 20 hard sets per muscle each week.',
    strength: 'Strong',
    tag: 'Training'
  },
  {
    title: 'Protein Target',
    source: 'Morton et al., protein supplementation meta-analysis',
    takeaway: 'A practical daily range is about 1.6 to 2.2 g protein per kg bodyweight.',
    strength: 'Strong',
    tag: 'Nutrition'
  },
  {
    title: 'Autoregulation',
    source: 'RPE and repetitions-in-reserve coaching literature',
    takeaway: 'Keep most working sets near 1 to 3 reps in reserve, then adjust load by recovery.',
    strength: 'Moderate',
    tag: 'Recovery'
  }
];

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getReadiness(profile: Profile, workouts: WorkoutSet[]) {
  const averageRpe =
    workouts.length > 0 ? workouts.reduce((sum, item) => sum + item.rpe, 0) / workouts.length : 7;
  const sleepScore = clampNumber((profile.sleepHours / 8) * 42, 18, 42);
  const sorenessPenalty = profile.soreness * 5;
  const intensityPenalty = Math.max(0, averageRpe - 7) * 7;
  return Math.round(clampNumber(86 + sleepScore - sorenessPenalty - intensityPenalty - 28, 35, 96));
}

export function getNutritionTargets(profile: Profile) {
  const bmr = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * 28 + 5;
  const activity = 1.42 + profile.trainingDays * 0.045;
  const maintenance = Math.round(bmr * activity);
  const goalAdjustment: Record<Goal, number> = {
    'Lean bulk': 240,
    'Fat loss': -420,
    Strength: 130,
    Hypertrophy: 180,
    Recomposition: -80
  };
  const calories = maintenance + goalAdjustment[profile.goal];
  const proteinMultiplier = profile.goal === 'Fat loss' || profile.goal === 'Recomposition' ? 2.1 : 1.8;
  const protein = Math.round(profile.weightKg * proteinMultiplier);
  const fat = Math.round(profile.weightKg * 0.8);
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
  const days = clampNumber(Math.round(profile.trainingDays), 3, 6);
  const volumeBias = profile.experience === 'Advanced' ? 18 : profile.experience === 'Intermediate' ? 14 : 10;
  const strengthBias = profile.goal === 'Strength';
  const templates = [
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

  return templates.slice(0, days).map((item, index) => ({
    ...item,
    volume: Math.max(8, volumeBias + (index % 2 === 0 ? 1 : -1))
  }));
}

export function synthesizeCoachAnswer(prompt: string, profile: Profile, uploads: UploadAsset[]) {
  const lower = prompt.toLowerCase();
  const targets = getNutritionTargets(profile);
  const latestUpload = uploads[0];
  const hasVideo = uploads.some((upload) => upload.kind === 'video');
  const hasMealImage = uploads.some((upload) => upload.kind === 'image');

  if (lower.includes('meal') || lower.includes('protein') || lower.includes('nutrition')) {
    return {
      answer: `For ${profile.goal.toLowerCase()}, start around ${targets.calories} kcal with ${targets.protein} g protein. Keep fats near ${targets.fat} g and use the remaining calories for carbs so training performance stays high. If bodyweight does not trend in the intended direction for 2 weeks, adjust by 150 to 200 kcal.`,
      citations: [researchCards[1]]
    };
  }

  if (lower.includes('form') || lower.includes('video') || lower.includes('squat') || hasVideo) {
    return {
      answer: latestUpload
        ? `I logged ${latestUpload.name} as a ${latestUpload.kind} input. The live multimodal model is not connected yet, so the safe default cue is to review depth, bracing, and bar path consistency. Once a vision model is wired, this panel should return rep counts, joint-angle flags, and confidence with the clip attached.`
        : 'Attach a set video before asking for form feedback. The app is ready for video intake and will route clips to the multimodal analysis step once the AI API is connected.',
      citations: [researchCards[2]]
    };
  }

  if (lower.includes('split') || lower.includes('program') || lower.includes('plan')) {
    const split = generateSplit(profile)
      .map((day) => `${day.day}: ${day.focus}`)
      .join('; ');
    return {
      answer: `Your current ${profile.trainingDays}-day split should bias toward ${split}. Progress compounds when all target reps land below RPE 9, and deload if soreness plus performance both worsen for more than a week.`,
      citations: [researchCards[0], researchCards[2]]
    };
  }

  return {
    answer: `Based on your ${profile.experience.toLowerCase()} profile and ${profile.goal.toLowerCase()} goal, the next useful decision is to keep weekly hard sets in a recoverable range, hit ${targets.protein} g protein, and use uploads as evidence when asking about form or meals.${hasMealImage ? ' Your latest meal image is queued for the future nutrition vision pass.' : ''}`,
    citations: [researchCards[0], researchCards[1]]
  };
}
