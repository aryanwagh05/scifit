import type { Session } from '@supabase/supabase-js';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  Camera,
  Check,
  ClipboardList,
  Database,
  Dumbbell,
  Home,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
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
  starterMeals,
  starterWorkouts
} from './lib/science';
import type { Citation, DietStyle, Experience, Goal, MealLog, Profile, UploadAsset, WorkoutSet } from './lib/science';
import {
  answerWithRag,
  createManualSource,
  fetchEuropePmcSources,
  mergeSources,
  starterEvidenceQueries
} from './lib/research';
import type { ResearchSource } from './lib/research';
import { isSupabaseConfigured, supabase, uploadMediaFile } from './lib/supabase';

type Tab = 'today' | 'plan' | 'log' | 'coach' | 'profile';

type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
};

type SourceRow = {
  external_id: string;
  title: string;
  abstract_text: string;
  source_name: string | null;
  journal: string | null;
  year: string | null;
  published_at: string | null;
  authors: string | null;
  url: string | null;
  doi: string | null;
  pmid: string | null;
  tags: string[] | null;
  imported_at: string | null;
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

const defaultSourceQuery = starterEvidenceQueries[0].query;

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

function sourceToRow(source: ResearchSource, userId: string) {
  return {
    user_id: userId,
    external_id: source.externalId,
    title: source.title,
    abstract_text: source.abstract,
    source_name: source.source,
    journal: source.journal,
    year: source.year,
    published_at: source.date || null,
    authors: source.authors,
    url: source.url,
    doi: source.doi ?? null,
    pmid: source.pmid ?? null,
    tags: source.tags,
    imported_at: source.importedAt
  };
}

function rowToSource(row: SourceRow): ResearchSource {
  return {
    id: row.external_id,
    externalId: row.external_id,
    title: row.title,
    abstract: row.abstract_text,
    source: row.source_name ?? 'Supabase source',
    journal: row.journal ?? 'Unknown journal',
    year: row.year ?? '',
    date: row.published_at ?? row.year ?? '',
    authors: row.authors ?? '',
    url: row.url ?? '',
    doi: row.doi ?? undefined,
    pmid: row.pmid ?? undefined,
    tags: row.tags ?? [],
    importedAt: row.imported_at ?? new Date().toISOString()
  };
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
  const [profile, setProfile] = useStoredState<Profile>('scifit-profile-v2', defaultProfile);
  const [workouts, setWorkouts] = useStoredState<WorkoutSet[]>('scifit-workouts-v2', starterWorkouts);
  const [meals, setMeals] = useStoredState<MealLog[]>('scifit-meals-v2', starterMeals);
  const [uploads, setUploads] = useStoredState<UploadAsset[]>('scifit-uploads-v2', []);
  const [sources, setSources] = useStoredState<ResearchSource[]>('scifit-sources-v2', []);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [toast, setToast] = useState('');
  const [coachPrompt, setCoachPrompt] = useState(quickPrompts[0]);
  const [coachLoading, setCoachLoading] = useState(false);
  const [sourceQuery, setSourceQuery] = useState(defaultSourceQuery);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [manualSource, setManualSource] = useState({
    title: '',
    abstract: '',
    source: '',
    url: '',
    tags: 'hypertrophy'
  });
  const [messages, setMessages] = useStoredState<AssistantMessage[]>('scifit-messages-v2', [
    {
      id: 'assistant-seed',
      role: 'assistant',
      content:
        'Import PubMed/Europe PMC sources or add your own paper, then ask SciFit. Answers will cite the active source library.',
      citations: []
    }
  ]);
  const [workoutDraft, setWorkoutDraft] = useState({
    exercise: '',
    muscle: '',
    sets: '',
    reps: '',
    load: '',
    rpe: ''
  });
  const [mealDraft, setMealDraft] = useState({
    meal: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: ''
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

  useEffect(() => {
    if (!supabase || !session) {
      return;
    }

    void supabase
      .from('user_research_sources')
      .select('*')
      .order('imported_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setToast(error.message);
          return;
        }

        setSources((current) => mergeSources(current, (data ?? []).map((row) => rowToSource(row as SourceRow))));
      });
  }, [session, setSources]);

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

  async function persistResearchSources(items: ResearchSource[]) {
    if (!supabase || !session || !items.length) {
      return;
    }

    const { error } = await supabase
      .from('user_research_sources')
      .upsert(items.map((source) => sourceToRow(source, session.user.id)), { onConflict: 'user_id,external_id' });

    if (error) {
      setToast(error.message);
    }
  }

  async function handleImportSources() {
    const query = sourceQuery.trim();
    if (!query || sourceLoading) {
      return;
    }

    setSourceLoading(true);
    try {
      const imported = await fetchEuropePmcSources(query, 'Imported', 10);
      setSources((current) => mergeSources(current, imported));
      await persistResearchSources(imported);
      setToast(imported.length ? `Imported ${imported.length} sources` : 'No sources with abstracts found');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Source import failed');
    } finally {
      setSourceLoading(false);
    }
  }

  async function handleLoadStarterEvidence() {
    if (sourceLoading) {
      return;
    }

    setSourceLoading(true);
    try {
      const batches = await Promise.all(
        starterEvidenceQueries.map((item) => fetchEuropePmcSources(item.query, item.label, 5, 'relevance'))
      );
      const imported = batches.flat();
      setSources((current) => mergeSources(current, imported));
      await persistResearchSources(imported);
      setToast(`Loaded ${imported.length} research sources`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Starter evidence failed');
    } finally {
      setSourceLoading(false);
    }
  }

  async function handleManualSourceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualSource.abstract.trim()) {
      setToast('Add an abstract or notes before saving a source');
      return;
    }

    const next = createManualSource(manualSource);
    setSources((current) => mergeSources(current, [next]));
    await persistResearchSources([next]);
    setManualSource({ title: '', abstract: '', source: '', url: '', tags: 'hypertrophy' });
    setToast('Source added');
  }

  async function handleRemoveSource(source: ResearchSource) {
    setSources((current) => current.filter((item) => item.id !== source.id && item.externalId !== source.externalId));

    if (supabase && session) {
      const { error } = await supabase
        .from('user_research_sources')
        .delete()
        .eq('user_id', session.user.id)
        .eq('external_id', source.externalId);

      if (error) {
        setToast(error.message);
        return;
      }
    }

    setToast('Source removed');
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
        const result = answerWithRag(prompt, profile, uploads, sources);
        setMessages((current) => [
          ...current,
          {
            id: uid('msg-assistant'),
            role: 'assistant',
            content: `${result.answer} Confidence: ${Math.round(result.confidence * 100)}%.`,
            citations: result.citations
          }
        ]);
      }
    } catch (error) {
      const result = answerWithRag(prompt, profile, uploads, sources);
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
                sourceCount={sources.length}
                setActiveTab={setActiveTab}
              />
            ) : null}

            {activeTab === 'plan' ? <PlanView profile={profile} split={split} nutrition={nutrition} sources={sources} /> : null}

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
                sources={sources}
                sourceQuery={sourceQuery}
                sourceLoading={sourceLoading}
                manualSource={manualSource}
                setCoachPrompt={setCoachPrompt}
                setSourceQuery={setSourceQuery}
                setManualSource={setManualSource}
                onMediaChange={handleMediaChange}
                onCoachSubmit={handleCoachSubmit}
                onImportSources={handleImportSources}
                onLoadStarterEvidence={handleLoadStarterEvidence}
                onManualSourceSubmit={handleManualSourceSubmit}
                onRemoveSource={handleRemoveSource}
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
  sourceCount,
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
  sourceCount: number;
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
        <MetricCard label="Evidence" value={`${sourceCount}`} detail="active sources" />
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
  nutrition,
  sources
}: {
  profile: Profile;
  split: ReturnType<typeof generateSplit>;
  nutrition: ReturnType<typeof getNutritionTargets>;
  sources: ResearchSource[];
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

      <Section title="Active Evidence" icon={ShieldCheck} action={<span className="source-count">{sources.length} loaded</span>}>
        {sources.length ? (
          <div className="research-list">
            {sources.slice(0, 4).map((source) => (
              <article className="research-card" key={source.externalId}>
                <div>
                  <span>{source.tags[0] ?? 'Evidence'}</span>
                  <strong>{source.year || 'Source'}</strong>
                </div>
                <p>{source.title}</p>
                <small>
                  {source.journal}
                  {source.year ? `, ${source.year}` : ''}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">Import PubMed/Europe PMC sources in the AI tab.</div>
        )}
      </Section>
    </>
  );
}

function SourceCard({ source, onRemoveSource }: { source: ResearchSource; onRemoveSource: (source: ResearchSource) => void }) {
  const abstract = source.abstract.length > 128 ? `${source.abstract.slice(0, 128).trim()}...` : source.abstract;

  return (
    <article className="source-card">
      <header>
        <div>
          <span>{source.tags[0] ?? 'Evidence'}</span>
          <strong>{source.title}</strong>
        </div>
        <button className="icon-button danger-button" type="button" onClick={() => onRemoveSource(source)} aria-label={`Remove ${source.title}`}>
          <Trash2 size={15} />
        </button>
      </header>
      <p>{abstract}</p>
      <div className="source-meta">
        <small>
          {source.journal}
          {source.year ? `, ${source.year}` : ''}
        </small>
        {source.url ? (
          <a href={source.url} target="_blank" rel="noreferrer">
            Open source
          </a>
        ) : null}
      </div>
    </article>
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
          <Field label="Exercise" value={workoutDraft.exercise} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, exercise: value }))} placeholder="Incline press" />
          <Field label="Muscle" value={workoutDraft.muscle} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, muscle: value }))} placeholder="Chest" />
          <Field label="Sets" value={workoutDraft.sets} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, sets: value }))} inputMode="numeric" placeholder="3" />
          <Field label="Reps" value={workoutDraft.reps} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, reps: value }))} inputMode="numeric" placeholder="10" />
          <Field label="Load" value={workoutDraft.load} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, load: value }))} inputMode="decimal" placeholder="60" />
          <Field label="RPE" value={workoutDraft.rpe} onChange={(value) => setWorkoutDraft((draft) => ({ ...draft, rpe: value }))} inputMode="decimal" placeholder="8" />
          <button className="primary-action full-width" type="submit">
            <Plus size={17} />
            Add set
          </button>
        </form>
      </Section>

      <Section title="Nutrition" icon={Utensils}>
        <form className="form-grid" onSubmit={onMealSubmit}>
          <Field label="Meal" value={mealDraft.meal} onChange={(value) => setMealDraft((draft) => ({ ...draft, meal: value }))} placeholder="Greek yogurt bowl" />
          <Field label="Calories" value={mealDraft.calories} onChange={(value) => setMealDraft((draft) => ({ ...draft, calories: value }))} inputMode="numeric" placeholder="430" />
          <Field label="Protein" value={mealDraft.protein} onChange={(value) => setMealDraft((draft) => ({ ...draft, protein: value }))} inputMode="numeric" placeholder="42" />
          <Field label="Carbs" value={mealDraft.carbs} onChange={(value) => setMealDraft((draft) => ({ ...draft, carbs: value }))} inputMode="numeric" placeholder="48" />
          <Field label="Fat" value={mealDraft.fat} onChange={(value) => setMealDraft((draft) => ({ ...draft, fat: value }))} inputMode="numeric" placeholder="9" />
          <button className="primary-action full-width" type="submit">
            <Plus size={17} />
            Add meal
          </button>
        </form>
      </Section>

      <Section title="Recent Entries" icon={BarChart3}>
        {workouts.length || meals.length ? (
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
        ) : (
          <div className="empty-state">No workout or meal logs yet.</div>
        )}
      </Section>
    </>
  );
}

function CoachView({
  uploads,
  messages,
  coachPrompt,
  coachLoading,
  sources,
  sourceQuery,
  sourceLoading,
  manualSource,
  setCoachPrompt,
  setSourceQuery,
  setManualSource,
  onMediaChange,
  onCoachSubmit,
  onImportSources,
  onLoadStarterEvidence,
  onManualSourceSubmit,
  onRemoveSource
}: {
  uploads: UploadAsset[];
  messages: AssistantMessage[];
  coachPrompt: string;
  coachLoading: boolean;
  sources: ResearchSource[];
  sourceQuery: string;
  sourceLoading: boolean;
  manualSource: { title: string; abstract: string; source: string; url: string; tags: string };
  setCoachPrompt: (value: string) => void;
  setSourceQuery: (value: string) => void;
  setManualSource: React.Dispatch<React.SetStateAction<{ title: string; abstract: string; source: string; url: string; tags: string }>>;
  onMediaChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCoachSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onImportSources: () => void;
  onLoadStarterEvidence: () => void;
  onManualSourceSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveSource: (source: ResearchSource) => void;
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

      <Section title="Source Library" icon={BookOpen} action={<span className="source-count">{sources.length} sources</span>}>
        <div className="source-tools">
          <button className="text-button source-wide-button" type="button" onClick={onLoadStarterEvidence} disabled={sourceLoading}>
            <RefreshCw size={15} />
            {sourceLoading ? 'Loading' : 'Load starter evidence'}
          </button>

          <div className="source-query-row">
            <label className="field">
              <span>Europe PMC query</span>
              <input value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} />
            </label>
            <button className="icon-button source-search-button" type="button" onClick={onImportSources} disabled={sourceLoading} aria-label="Search Europe PMC">
              <Search size={16} />
            </button>
          </div>

          <form className="manual-source-form" onSubmit={onManualSourceSubmit}>
            <Field label="Title" value={manualSource.title} onChange={(value) => setManualSource((draft) => ({ ...draft, title: value }))} placeholder="Paper title" />
            <Field label="Source" value={manualSource.source} onChange={(value) => setManualSource((draft) => ({ ...draft, source: value }))} placeholder="Journal or source" />
            <Field label="URL" value={manualSource.url} onChange={(value) => setManualSource((draft) => ({ ...draft, url: value }))} placeholder="https://..." />
            <Field label="Tags" value={manualSource.tags} onChange={(value) => setManualSource((draft) => ({ ...draft, tags: value }))} placeholder="hypertrophy, protein" />
            <label className="field full-width">
              <span>Abstract or notes</span>
              <textarea
                className="textarea-field"
                value={manualSource.abstract}
                onChange={(event) => setManualSource((draft) => ({ ...draft, abstract: event.target.value }))}
                rows={4}
                placeholder="Paste an abstract, PubMed summary, or your notes."
              />
            </label>
            <button className="primary-action full-width" type="submit">
              <Plus size={17} />
              Add source
            </button>
          </form>
        </div>

        {sources.length ? (
          <div className="source-list">
            {sources.slice(0, 4).map((source) => (
              <SourceCard key={source.externalId} source={source} onRemoveSource={onRemoveSource} />
            ))}
          </div>
        ) : (
          <div className="empty-state">No sources loaded yet.</div>
        )}
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
                    citation.url ? (
                      <a key={`${message.id}-${citation.title}`} href={citation.url} target="_blank" rel="noreferrer">
                        {citation.title}
                      </a>
                    ) : (
                      <span key={`${message.id}-${citation.title}`}>{citation.title}</span>
                    )
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
  type = 'text',
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
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
