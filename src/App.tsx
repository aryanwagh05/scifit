import type { Session } from '@supabase/supabase-js';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Brain,
  Camera,
  Check,
  ClipboardList,
  Database,
  Dumbbell,
  Home,
  Image as ImageIcon,
  Plus,
  Send,
  ShieldCheck,
  Upload,
  User,
  Utensils,
  Video
} from 'lucide-react';
import {
  defaultProfile,
  generateSplit,
  getNutritionTargets,
  getReadiness,
  getTopLift,
  getWeeklyVolume,
  researchCards,
  starterMeals,
  starterWorkouts,
  synthesizeCoachAnswer
} from './lib/science';
import type { Citation, DietStyle, Experience, Goal, MealLog, Profile, UploadAsset, WorkoutSet } from './lib/science';
import { isSupabaseConfigured, supabase, uploadMediaFile } from './lib/supabase';

type Tab = 'today' | 'plan' | 'log' | 'coach' | 'profile';

type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
};

const tabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'plan', label: 'Plan', icon: Dumbbell },
  { id: 'log', label: 'Log', icon: ClipboardList },
  { id: 'coach', label: 'AI', icon: Brain },
  { id: 'profile', label: 'Profile', icon: User }
];

const quickPrompts = [
  'Build my split around hypertrophy and recovery.',
  'What should my calories and protein be today?',
  'Review my latest upload for form or meal feedback.'
];

function isTab(value: string): value is Tab {
  return tabs.some((tab) => tab.id === value);
}

function getInitialTab() {
  const hash = window.location.hash.replace('#', '');
  return isTab(hash) ? hash : 'today';
}

function uid(prefix: string) {
  if ('randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useStoredState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    if (!saved) {
      return initialValue;
    }

    try {
      return JSON.parse(saved) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

function App() {
  const [activeTab, setActiveTabState] = useState<Tab>(() => getInitialTab());
  const [profile, setProfile] = useStoredState<Profile>('scifit-profile', defaultProfile);
  const [workouts, setWorkouts] = useStoredState<WorkoutSet[]>('scifit-workouts', starterWorkouts);
  const [meals, setMeals] = useStoredState<MealLog[]>('scifit-meals', starterMeals);
  const [uploads, setUploads] = useStoredState<UploadAsset[]>('scifit-uploads', []);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [toast, setToast] = useState('');
  const [coachPrompt, setCoachPrompt] = useState(quickPrompts[0]);
  const [coachLoading, setCoachLoading] = useState(false);
  const [messages, setMessages] = useStoredState<AssistantMessage[]>('scifit-messages', [
    {
      id: 'assistant-seed',
      role: 'assistant',
      content:
        'SciFit is running in evidence mode. Ask about a split, meal target, or attach media for the future multimodal pass.',
      citations: [researchCards[0]]
    }
  ]);
  const [workoutDraft, setWorkoutDraft] = useState({
    exercise: 'Incline DB press',
    muscle: 'Chest',
    sets: '3',
    reps: '10',
    load: '60',
    rpe: '8'
  });
  const [mealDraft, setMealDraft] = useState({
    meal: 'Chicken rice bowl',
    calories: '650',
    protein: '48',
    carbs: '72',
    fat: '16'
  });

  const split = useMemo(() => generateSplit(profile), [profile]);
  const nutrition = useMemo(() => getNutritionTargets(profile), [profile]);
  const readiness = useMemo(() => getReadiness(profile, workouts), [profile, workouts]);
  const weeklyVolume = useMemo(() => getWeeklyVolume(workouts), [workouts]);
  const topLift = useMemo(() => getTopLift(workouts), [workouts]);
  const proteinLogged = meals.reduce((sum, meal) => sum + meal.protein, 0);
  const caloriesLogged = meals.reduce((sum, meal) => sum + meal.calories, 0);

  function setActiveTab(tab: Tab) {
    setActiveTabState(tab);
    if (window.location.hash !== `#${tab}`) {
      window.history.replaceState(null, '', `#${tab}`);
    }
  }

  useEffect(() => {
    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  function updateProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function persistProfile() {
    if (!supabase || !session) {
      return;
    }

    const { error } = await supabase.from('profiles').upsert({
      id: session.user.id,
      name: profile.name,
      goal: profile.goal,
      experience: profile.experience,
      diet_style: profile.dietStyle,
      training_days: profile.trainingDays,
      height_cm: profile.heightCm,
      weight_kg: profile.weightKg,
      sleep_hours: profile.sleepHours,
      soreness: profile.soreness,
      updated_at: new Date().toISOString()
    });

    if (error) {
      throw error;
    }
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await persistProfile();
      setToast(session ? 'Profile synced to Supabase' : 'Profile saved on this device');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Profile sync failed');
    }
  }

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !authEmail.trim()) {
      setToast('Add Supabase env values before sign in');
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: window.location.href }
    });

    setToast(error ? error.message : 'Magic link sent');
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setToast('Signed out');
  }

  async function handleWorkoutSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: WorkoutSet = {
      id: uid('set'),
      exercise: workoutDraft.exercise.trim() || 'Untitled lift',
      muscle: workoutDraft.muscle.trim() || 'General',
      sets: Number(workoutDraft.sets) || 1,
      reps: Number(workoutDraft.reps) || 1,
      load: Number(workoutDraft.load) || 0,
      rpe: Number(workoutDraft.rpe) || 7,
      createdAt: new Date().toISOString()
    };

    setWorkouts((current) => [next, ...current]);
    setToast('Workout logged');

    if (supabase && session) {
      const { error } = await supabase.from('workout_sets').insert({
        id: next.id.replace('set-', ''),
        user_id: session.user.id,
        exercise: next.exercise,
        muscle: next.muscle,
        sets: next.sets,
        reps: next.reps,
        load: next.load,
        rpe: next.rpe,
        created_at: next.createdAt
      });
      if (error) {
        setToast(error.message);
      }
    }
  }

  async function handleMealSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: MealLog = {
      id: uid('meal'),
      meal: mealDraft.meal.trim() || 'Meal',
      calories: Number(mealDraft.calories) || 0,
      protein: Number(mealDraft.protein) || 0,
      carbs: Number(mealDraft.carbs) || 0,
      fat: Number(mealDraft.fat) || 0,
      createdAt: new Date().toISOString()
    };

    setMeals((current) => [next, ...current]);
    setToast('Meal logged');

    if (supabase && session) {
      const { error } = await supabase.from('nutrition_logs').insert({
        id: next.id.replace('meal-', ''),
        user_id: session.user.id,
        meal: next.meal,
        calories: next.calories,
        protein: next.protein,
        carbs: next.carbs,
        fat: next.fat,
        created_at: next.createdAt
      });
      if (error) {
        setToast(error.message);
      }
    }
  }

  async function handleMediaChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!files.length) {
      return;
    }

    for (const file of files) {
      const kind = file.type.startsWith('video') ? 'video' : 'image';
      const localUrl = URL.createObjectURL(file);
      let status = 'Stored on this device';
      let remotePath: string | undefined;
      let previewUrl = localUrl;

      if (supabase && session) {
        try {
          const uploaded = await uploadMediaFile(session.user.id, file);
          remotePath = uploaded.path;
          previewUrl = uploaded.signedUrl ?? localUrl;
          status = 'Uploaded to Supabase Storage';
        } catch (error) {
          status = error instanceof Error ? `Local only: ${error.message}` : 'Local only';
        }
      }

      const next: UploadAsset = {
        id: uid('media'),
        name: file.name,
        kind,
        size: file.size,
        url: previewUrl,
        remotePath,
        status,
        note: kind === 'video' ? 'Form analysis queue' : 'Meal or physique analysis queue',
        createdAt: new Date().toISOString()
      };

      setUploads((current) => [next, ...current]);
      setToast(status);

      if (supabase && session && remotePath) {
        const { error } = await supabase.from('ai_uploads').insert({
          id: next.id.replace('media-', ''),
          user_id: session.user.id,
          file_name: next.name,
          file_kind: next.kind,
          storage_path: remotePath,
          note: next.note,
          created_at: next.createdAt
        });
        if (error) {
          setToast(error.message);
        }
      }
    }
  }

  async function handleCoachSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = coachPrompt.trim();
    if (!prompt || coachLoading) {
      return;
    }

    const userMessage: AssistantMessage = {
      id: uid('msg-user'),
      role: 'user',
      content: prompt,
      citations: []
    };
    setMessages((current) => [...current, userMessage]);
    setCoachPrompt('');
    setCoachLoading(true);

    try {
      const ragEndpoint = import.meta.env.VITE_RAG_ENDPOINT?.trim() ?? '';
      const ragKey = import.meta.env.VITE_RAG_API_KEY?.trim() ?? '';
      if (ragEndpoint) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (ragKey) {
          headers.apikey = ragKey;
          headers.Authorization = `Bearer ${ragKey}`;
        }

        const response = await fetch(ragEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ user_message: prompt, user_profile: profile, top_k: 5 })
        });

        if (!response.ok) {
          throw new Error(`RAG request failed: ${response.status}`);
        }

        const data = (await response.json()) as { answer?: string; citations?: Citation[] };
        setMessages((current) => [
          ...current,
          {
            id: uid('msg-assistant'),
            role: 'assistant',
            content: data.answer ?? 'No answer returned.',
            citations: Array.isArray(data.citations) ? data.citations : []
          }
        ]);
      } else {
        const result = synthesizeCoachAnswer(prompt, profile, uploads);
        setMessages((current) => [
          ...current,
          {
            id: uid('msg-assistant'),
            role: 'assistant',
            content: result.answer,
            citations: result.citations
          }
        ]);
      }
    } catch (error) {
      const result = synthesizeCoachAnswer(prompt, profile, uploads);
      setMessages((current) => [
        ...current,
        {
          id: uid('msg-assistant'),
          role: 'assistant',
          content: `${result.answer} ${error instanceof Error ? `(${error.message})` : ''}`.trim(),
          citations: result.citations
        }
      ]);
    } finally {
      setCoachLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <button className="brand-button" type="button" onClick={() => setActiveTab('today')} aria-label="Open SciFit today view">
          <LogoMark />
          <span>
            <strong>SciFit</strong>
            <small>Science based lifting</small>
          </span>
        </button>
        <span className={`sync-pill ${isSupabaseConfigured ? 'is-live' : ''}`}>
          <Database size={14} />
          {isSupabaseConfigured ? (session ? 'Live' : 'Ready') : 'Local'}
        </span>
      </header>

      <main className="phone-surface">
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="screen-panel"
          >
            {activeTab === 'today' ? (
              <TodayView
                profile={profile}
                readiness={readiness}
                weeklyVolume={weeklyVolume}
                topLift={topLift}
                nutrition={nutrition}
                proteinLogged={proteinLogged}
                caloriesLogged={caloriesLogged}
                uploads={uploads}
                workouts={workouts}
                setActiveTab={setActiveTab}
              />
            ) : null}

            {activeTab === 'plan' ? <PlanView profile={profile} split={split} nutrition={nutrition} /> : null}

            {activeTab === 'log' ? (
              <LogView
                workoutDraft={workoutDraft}
                setWorkoutDraft={setWorkoutDraft}
                mealDraft={mealDraft}
                setMealDraft={setMealDraft}
                workouts={workouts}
                meals={meals}
                onWorkoutSubmit={handleWorkoutSubmit}
                onMealSubmit={handleMealSubmit}
              />
            ) : null}

            {activeTab === 'coach' ? (
              <CoachView
                uploads={uploads}
                messages={messages}
                coachPrompt={coachPrompt}
                coachLoading={coachLoading}
                setCoachPrompt={setCoachPrompt}
                onMediaChange={handleMediaChange}
                onCoachSubmit={handleCoachSubmit}
              />
            ) : null}

            {activeTab === 'profile' ? (
              <ProfileView
                profile={profile}
                updateProfile={updateProfile}
                authEmail={authEmail}
                setAuthEmail={setAuthEmail}
                session={session}
                onSaveProfile={handleSaveProfile}
                onMagicLink={handleMagicLink}
                onSignOut={handleSignOut}
              />
            ) : null}
          </motion.section>
        </AnimatePresence>
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map((tab) => (
          <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
        ))}
      </nav>

      {toast ? (
        <div className="toast" role="status">
          <Check size={14} />
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <span />
    </span>
  );
}

function TabButton({
  tab,
  active,
  onClick
}: {
  tab: { id: Tab; label: string; icon: LucideIcon };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <Icon size={19} />
      <span>{tab.label}</span>
    </button>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  action
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="section-card">
      <div className="section-head">
        <div>
          <Icon size={17} />
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function TodayView({
  profile,
  readiness,
  weeklyVolume,
  topLift,
  nutrition,
  proteinLogged,
  caloriesLogged,
  uploads,
  workouts,
  setActiveTab
}: {
  profile: Profile;
  readiness: number;
  weeklyVolume: number;
  topLift: { exercise: string; estimate: number };
  nutrition: ReturnType<typeof getNutritionTargets>;
  proteinLogged: number;
  caloriesLogged: number;
  uploads: UploadAsset[];
  workouts: WorkoutSet[];
  setActiveTab: (tab: Tab) => void;
}) {
  const latestWorkout = workouts[0];
  const proteinPercent = Math.min(100, Math.round((proteinLogged / nutrition.protein) * 100));
  const caloriePercent = Math.min(100, Math.round((caloriesLogged / nutrition.calories) * 100));

  return (
    <>
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Today</span>
          <h1>{profile.goal}</h1>
          <p>
            {profile.trainingDays} day split, {profile.experience.toLowerCase()} volume, recovery adjusted.
          </p>
        </div>
        <div className="readiness-ring" style={{ '--score': readiness } as React.CSSProperties}>
          <strong>{readiness}</strong>
          <span>Ready</span>
        </div>
      </section>

      <div className="metric-grid">
        <MetricCard label="Weekly sets" value={`${weeklyVolume}`} detail="hard sets logged" />
        <MetricCard label="Est. top lift" value={`${topLift.estimate || '-'} lb`} detail={topLift.exercise} />
        <MetricCard label="Protein" value={`${proteinLogged}/${nutrition.protein} g`} detail={`${proteinPercent}% target`} />
        <MetricCard label="Calories" value={`${caloriesLogged}`} detail={`${caloriePercent}% of day`} />
      </div>

      <Section
        title="Next Action"
        icon={Activity}
        action={
          <button className="icon-button" type="button" onClick={() => setActiveTab('log')} aria-label="Add a log">
            <Plus size={17} />
          </button>
        }
      >
        <div className="action-row">
          <div>
            <strong>{latestWorkout ? `${latestWorkout.exercise} follow-up` : 'Start first session'}</strong>
            <span>
              {readiness > 72
                ? 'Add load or reps if warmups move cleanly.'
                : 'Hold load steady and reduce one accessory set.'}
            </span>
          </div>
          <button className="text-button" type="button" onClick={() => setActiveTab('plan')}>
            Open plan
          </button>
        </div>
      </Section>

      <Section
        title="Media Intake"
        icon={Camera}
        action={
          <button className="text-button" type="button" onClick={() => setActiveTab('coach')}>
            Review
          </button>
        }
      >
        {uploads.length ? (
          <div className="mini-media-strip">
            {uploads.slice(0, 3).map((upload) => (
              <MediaTile key={upload.id} upload={upload} compact />
            ))}
          </div>
        ) : (
          <div className="empty-state">No media attached yet.</div>
        )}
      </Section>
    </>
  );
}

function PlanView({
  profile,
  split,
  nutrition
}: {
  profile: Profile;
  split: ReturnType<typeof generateSplit>;
  nutrition: ReturnType<typeof getNutritionTargets>;
}) {
  return (
    <>
      <section className="page-title">
        <span className="eyebrow">Plan Generator</span>
        <h1>{profile.trainingDays} days for {profile.goal.toLowerCase()}</h1>
      </section>

      <Section title="Training Split" icon={Dumbbell}>
        <div className="split-list">
          {split.map((day, index) => (
            <article className="split-card" key={day.day}>
              <div className="split-index">{index + 1}</div>
              <div>
                <div className="split-topline">
                  <strong>{day.day}</strong>
                  <span>{day.volume} sets</span>
                </div>
                <p>{day.focus}</p>
                <ul>
                  {day.work.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <small>{day.cue}</small>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Nutrition Targets" icon={Utensils}>
        <div className="target-grid">
          <MetricCard label="Calories" value={`${nutrition.calories}`} detail="starting target" />
          <MetricCard label="Protein" value={`${nutrition.protein} g`} detail="daily minimum" />
          <MetricCard label="Carbs" value={`${nutrition.carbs} g`} detail="performance fuel" />
          <MetricCard label="Fats" value={`${nutrition.fat} g`} detail="floor target" />
        </div>
      </Section>

      <Section title="Evidence Cards" icon={ShieldCheck}>
        <div className="research-list">
          {researchCards.map((card) => (
            <article className="research-card" key={card.title}>
              <div>
                <span>{card.tag}</span>
                <strong>{card.title}</strong>
              </div>
              <p>{card.takeaway}</p>
              <small>{card.source}</small>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}

function LogView({
  workoutDraft,
  setWorkoutDraft,
  mealDraft,
  setMealDraft,
  workouts,
  meals,
  onWorkoutSubmit,
  onMealSubmit
}: {
  workoutDraft: { exercise: string; muscle: string; sets: string; reps: string; load: string; rpe: string };
  setWorkoutDraft: React.Dispatch<React.SetStateAction<{ exercise: string; muscle: string; sets: string; reps: string; load: string; rpe: string }>>;
  mealDraft: { meal: string; calories: string; protein: string; carbs: string; fat: string };
  setMealDraft: React.Dispatch<React.SetStateAction<{ meal: string; calories: string; protein: string; carbs: string; fat: string }>>;
  workouts: WorkoutSet[];
  meals: MealLog[];
  onWorkoutSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onMealSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <section className="page-title">
        <span className="eyebrow">Logbook</span>
        <h1>Training and food</h1>
      </section>

      <Section title="Workout" icon={Dumbbell}>
        <form className="form-grid" onSubmit={onWorkoutSubmit}>
          <Field label="Exercise" value={workoutDraft.exercise} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, exercise: value }))} />
          <Field label="Muscle" value={workoutDraft.muscle} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, muscle: value }))} />
          <Field label="Sets" value={workoutDraft.sets} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, sets: value }))} inputMode="numeric" />
          <Field label="Reps" value={workoutDraft.reps} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, reps: value }))} inputMode="numeric" />
          <Field label="Load" value={workoutDraft.load} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, load: value }))} inputMode="decimal" />
          <Field label="RPE" value={workoutDraft.rpe} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, rpe: value }))} inputMode="decimal" />
          <button className="primary-action full-width" type="submit">
            <Plus size={17} />
            Add set
          </button>
        </form>
      </Section>

      <Section title="Nutrition" icon={Utensils}>
        <form className="form-grid" onSubmit={onMealSubmit}>
          <Field label="Meal" value={mealDraft.meal} onChange={(value) => setMealDraft((draft) => ({ ...draft, meal: value }))} />
          <Field label="Calories" value={mealDraft.calories} onChange={(value) => setMealDraft((draft) => ({ ...draft, calories: value }))} inputMode="numeric" />
          <Field label="Protein" value={mealDraft.protein} onChange={(value) => setMealDraft((draft) => ({ ...draft, protein: value }))} inputMode="numeric" />
          <Field label="Carbs" value={mealDraft.carbs} onChange={(value) => setMealDraft((draft) => ({ ...draft, carbs: value }))} inputMode="numeric" />
          <Field label="Fat" value={mealDraft.fat} onChange={(value) => setMealDraft((draft) => ({ ...draft, fat: value }))} inputMode="numeric" />
          <button className="primary-action full-width" type="submit">
            <Plus size={17} />
            Add meal
          </button>
        </form>
      </Section>

      <Section title="Recent Entries" icon={BarChart3}>
        <div className="entry-list">
          {workouts.slice(0, 4).map((item) => (
            <div className="entry-row" key={item.id}>
              <Dumbbell size={16} />
              <div>
                <strong>{item.exercise}</strong>
                <span>{item.sets}x{item.reps} at {item.load} lb, RPE {item.rpe}</span>
              </div>
              <small>{formatDate(item.createdAt)}</small>
            </div>
          ))}
          {meals.slice(0, 3).map((item) => (
            <div className="entry-row" key={item.id}>
              <Utensils size={16} />
              <div>
                <strong>{item.meal}</strong>
                <span>{item.calories} kcal, {item.protein} g protein</span>
              </div>
              <small>{formatDate(item.createdAt)}</small>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function CoachView({
  uploads,
  messages,
  coachPrompt,
  coachLoading,
  setCoachPrompt,
  onMediaChange,
  onCoachSubmit
}: {
  uploads: UploadAsset[];
  messages: AssistantMessage[];
  coachPrompt: string;
  coachLoading: boolean;
  setCoachPrompt: (value: string) => void;
  onMediaChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCoachSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <section className="page-title">
        <span className="eyebrow">AI Coach</span>
        <h1>Evidence and media</h1>
      </section>

      <Section title="Uploads" icon={Upload}>
        <label className="upload-zone">
          <input type="file" accept="image/*,video/*" multiple onChange={onMediaChange} />
          <span className="upload-icon">
            <Camera size={22} />
          </span>
          <strong>Attach image or video</strong>
          <small>Meal photos, physique checks, and lifting clips</small>
        </label>

        {uploads.length ? (
          <div className="media-grid">
            {uploads.slice(0, 6).map((upload) => (
              <MediaTile key={upload.id} upload={upload} />
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Ask SciFit" icon={Brain}>
        <div className="prompt-row">
          {quickPrompts.map((prompt) => (
            <button className="prompt-chip" type="button" key={prompt} onClick={() => setCoachPrompt(prompt)}>
              {prompt}
            </button>
          ))}
        </div>

        <form className="chat-form" onSubmit={onCoachSubmit}>
          <textarea value={coachPrompt} onChange={(event) => setCoachPrompt(event.target.value)} rows={3} />
          <button className="primary-action" type="submit" disabled={coachLoading || !coachPrompt.trim()}>
            <Send size={17} />
            {coachLoading ? 'Thinking' : 'Ask'}
          </button>
        </form>

        <div className="chat-thread">
          {messages.slice(-6).map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <p>{message.content}</p>
              {message.citations.length ? (
                <div className="citation-strip">
                  {message.citations.map((citation) => (
                    <span key={`${message.id}-${citation.title}`}>{citation.title}</span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}

function ProfileView({
  profile,
  updateProfile,
  authEmail,
  setAuthEmail,
  session,
  onSaveProfile,
  onMagicLink,
  onSignOut
}: {
  profile: Profile;
  updateProfile: <K extends keyof Profile>(key: K, value: Profile[K]) => void;
  authEmail: string;
  setAuthEmail: (value: string) => void;
  session: Session | null;
  onSaveProfile: (event: FormEvent<HTMLFormElement>) => void;
  onMagicLink: (event: FormEvent<HTMLFormElement>) => void;
  onSignOut: () => void;
}) {
  return (
    <>
      <section className="page-title">
        <span className="eyebrow">Athlete Profile</span>
        <h1>{profile.name}</h1>
      </section>

      <Section title="Personalization" icon={User}>
        <form className="form-grid" onSubmit={onSaveProfile}>
          <Field label="Name" value={profile.name} onChange={(value) => updateProfile('name', value)} />
          <SelectField
            label="Goal"
            value={profile.goal}
            options={['Lean bulk', 'Fat loss', 'Strength', 'Hypertrophy', 'Recomposition']}
            onChange={(value) => updateProfile('goal', value as Goal)}
          />
          <SelectField
            label="Experience"
            value={profile.experience}
            options={['Beginner', 'Intermediate', 'Advanced']}
            onChange={(value) => updateProfile('experience', value as Experience)}
          />
          <SelectField
            label="Diet"
            value={profile.dietStyle}
            options={['Balanced', 'High protein', 'Plant forward', 'Low appetite']}
            onChange={(value) => updateProfile('dietStyle', value as DietStyle)}
          />
          <RangeField label="Training days" value={profile.trainingDays} min={3} max={6} onChange={(value) => updateProfile('trainingDays', value)} />
          <RangeField label="Sleep" value={profile.sleepHours} min={4} max={10} step={0.1} onChange={(value) => updateProfile('sleepHours', value)} />
          <RangeField label="Soreness" value={profile.soreness} min={1} max={10} onChange={(value) => updateProfile('soreness', value)} />
          <Field label="Height cm" value={String(profile.heightCm)} onChange={(value) => updateProfile('heightCm', Number(value) || profile.heightCm)} inputMode="numeric" />
          <Field label="Weight kg" value={String(profile.weightKg)} onChange={(value) => updateProfile('weightKg', Number(value) || profile.weightKg)} inputMode="decimal" />
          <button className="primary-action full-width" type="submit">
            <Check size={17} />
            Save profile
          </button>
        </form>
      </Section>

      <Section title="Supabase" icon={Database}>
        {isSupabaseConfigured ? (
          session ? (
            <div className="connection-card">
              <ShieldCheck size={18} />
              <div>
                <strong>{session.user.email}</strong>
                <span>Authenticated session active</span>
              </div>
              <button className="text-button" type="button" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={onMagicLink}>
              <Field label="Email" value={authEmail} onChange={setAuthEmail} type="email" />
              <button className="primary-action" type="submit">
                <Send size={17} />
                Send link
              </button>
            </form>
          )
        ) : (
          <div className="connection-card muted">
            <Database size={18} />
            <div>
              <strong>Local mode</strong>
              <span>Add Supabase env values to enable auth, tables, and Storage uploads.</span>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}

function MediaTile({ upload, compact = false }: { upload: UploadAsset; compact?: boolean }) {
  return (
    <article className={`media-tile ${compact ? 'compact' : ''}`}>
      <div className="media-preview">
        {upload.kind === 'image' ? (
          <img src={upload.url} alt={upload.name} />
        ) : (
          <video src={upload.url} muted playsInline controls={!compact} />
        )}
        <span>{upload.kind === 'image' ? <ImageIcon size={14} /> : <Video size={14} />}</span>
      </div>
      <div className="media-meta">
        <strong>{upload.name}</strong>
        {!compact ? (
          <>
            <small>{formatSize(upload.size)} - {upload.status}</small>
            <em>{upload.note}</em>
          </>
        ) : null}
      </div>
    </article>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  type = 'text'
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default App;
