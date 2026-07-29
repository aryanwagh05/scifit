import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import {
  createEmbedding,
  generateWithGemini,
  InlineMedia,
  parseJsonModelOutput,
  RagCitation,
  toVectorLiteral
} from '../_shared/ai.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

type ProfileInput = {
  name?: string;
  goal?: string;
  goalDetail?: string;
  experience?: string;
  dietStyle?: string;
  equipment?: string;
  focusAreas?: string;
  limitations?: string;
  age?: number;
  sex?: string;
  trainingDays?: number;
  heightCm?: number;
  weightKg?: number;
  sleepHours?: number;
  soreness?: number;
};

type MediaInput = {
  kind?: 'image' | 'video';
  name?: string;
  mimeType?: string;
  dataUrl?: string;
  remotePath?: string;
};

type MatchRow = {
  title: string;
  source: string;
  url: string | null;
  journal: string | null;
  published_year: string | null;
  tags: string[] | null;
  content: string;
  similarity: number;
};

type ModelOutput = {
  answer?: string;
  citations?: RagCitation[];
  plan?: {
    summary?: string;
    training_days?: Array<{ day: string; focus: string; work: string[]; notes?: string }>;
    nutrition?: { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number };
    adjustments?: string[];
  };
};

function getAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service credentials are not configured');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function getUserId(req: Request, admin: ReturnType<typeof getAdminClient>) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return null;
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }
  return data.user.id;
}

function parseDataUrl(value?: string): InlineMedia | null {
  if (!value?.startsWith('data:')) {
    return null;
  }

  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return { mimeType: match[1], data: match[2] };
}

function bufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function resolveMedia(media: MediaInput | null, admin: ReturnType<typeof getAdminClient>): Promise<InlineMedia | null> {
  if (!media) {
    return null;
  }

  const inline = parseDataUrl(media.dataUrl);
  if (inline) {
    return inline;
  }

  if (!media.remotePath) {
    return null;
  }

  const { data, error } = await admin.storage.from('media').download(media.remotePath);
  if (error || !data) {
    return null;
  }

  return {
    mimeType: media.mimeType || data.type || 'application/octet-stream',
    data: bufferToBase64(await data.arrayBuffer())
  };
}

function citationFromMatch(row: MatchRow): RagCitation {
  return {
    title: row.title,
    source: `${row.journal || row.source}${row.published_year ? `, ${row.published_year}` : ''}`,
    url: row.url || undefined,
    year: row.published_year || undefined
  };
}

function fallbackAnswer(message: string, profile: ProfileInput, matches: MatchRow[], media: InlineMedia | null) {
  const citations = matches.slice(0, 5).map(citationFromMatch);
  const contextLine = citations
    .slice(0, 3)
    .map((citation, index) => `[${index + 1}] ${citation.title}${citation.year ? ` (${citation.year})` : ''}`)
    .join(' ');
  const target = profile.goalDetail || profile.goal || 'the stated goal';
  const mediaLine = media
    ? ' Media was included for multimodal review; configure GEMINI_API_KEY for full image/video reasoning.'
    : '';

  return {
    answer: matches.length
      ? `For ${target}, start with a ${profile.trainingDays || 4}-day plan using ${profile.equipment || 'available'} equipment, adjust volume to recovery, and anchor nutrition to bodyweight trend. Retrieved evidence: ${contextLine}.${mediaLine}`
      : `I need embedded research sources before giving a source-grounded answer. Use the Research Library to sync starter evidence, then ask again.${mediaLine}`,
    citations,
    plan: null
  };
}

function profileText(profile: ProfileInput) {
  return [
    `Goal: ${profile.goal ?? 'unspecified'}`,
    `Goal details: ${profile.goalDetail || 'not provided'}`,
    `Experience: ${profile.experience ?? 'unspecified'}`,
    `Diet: ${profile.dietStyle ?? 'unspecified'}`,
    `Equipment: ${profile.equipment ?? 'unspecified'}`,
    `Focus areas: ${profile.focusAreas || 'not provided'}`,
    `Limitations: ${profile.limitations || 'none provided'}`,
    `Age/Sex: ${profile.age ?? 'unknown'} / ${profile.sex ?? 'unknown'}`,
    `Stats: ${profile.heightCm ?? 'unknown'} cm, ${profile.weightKg ?? 'unknown'} kg`,
    `Training days: ${profile.trainingDays ?? 'unknown'}`,
    `Sleep/Soreness: ${profile.sleepHours ?? 'unknown'} hours / ${profile.soreness ?? 'unknown'}`
  ].join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const admin = getAdminClient();
    const userId = await getUserId(req, admin);
    if (!userId) {
      return jsonResponse({ error: 'Sign in before using the AI coach' }, 401);
    }

    const body = await req.json();
    const message = String(body.message || body.user_message || '').trim();
    const profile = (body.profile || body.user_profile || {}) as ProfileInput;
    const media = await resolveMedia((body.media || null) as MediaInput | null, admin);

    if (!message) {
      return jsonResponse({ error: 'Message is required' }, 400);
    }

    const embedding = await createEmbedding(`${message}\n${profileText(profile)}`);
    const { data, error } = await admin.rpc('match_rag_chunks', {
      query_user_id: userId,
      query_embedding: toVectorLiteral(embedding),
      match_count: 8
    });

    if (error) {
      throw error;
    }

    const matches = ((data ?? []) as MatchRow[]).filter((row) => Number(row.similarity) > 0.08);
    const context = matches
      .slice(0, 8)
      .map(
        (row, index) =>
          `[${index + 1}] ${row.title}\nSource: ${row.journal || row.source}${row.published_year ? `, ${row.published_year}` : ''}\nTags: ${(row.tags ?? []).join(', ')}\nSimilarity: ${Number(row.similarity).toFixed(3)}\n${row.content.slice(0, 1400)}`
      )
      .join('\n\n');

    const system = [
      'You are SciFit, an evidence-first hypertrophy, strength, nutrition, and body-composition coach.',
      'Use the supplied research context for scientific claims. Do not invent citations.',
      'Personalize recommendations to the athlete profile, equipment, goals, limitations, logs, and uploaded media.',
      'For images or videos, describe only visible/available evidence and state uncertainty when needed.',
      'Return compact JSON with keys: answer, citations, plan. citations must reuse titles from the research context.'
    ].join(' ');

    const prompt = [
      `Athlete profile:\n${profileText(profile)}`,
      `User request:\n${message}`,
      `Retrieved research context:\n${context || 'No vector matches found.'}`,
      'If the user asks for a plan, include a practical plan object with training_days, nutrition, and adjustments. Keep the prose concise and mobile-friendly.'
    ].join('\n\n');

    const modelText = await generateWithGemini({ system, prompt, media, json: true });
    if (!modelText) {
      return jsonResponse(fallbackAnswer(message, profile, matches, media));
    }

    const parsed = parseJsonModelOutput<ModelOutput>(modelText, {
      answer: modelText,
      citations: matches.slice(0, 5).map(citationFromMatch),
      plan: undefined
    });

    const knownTitles = new Set(matches.map((row) => row.title));
    const citations = (parsed.citations?.length ? parsed.citations : matches.slice(0, 5).map(citationFromMatch)).filter(
      (citation) => !citation.title || knownTitles.has(citation.title)
    );

    return jsonResponse({
      answer: parsed.answer || modelText,
      citations: citations.length ? citations : matches.slice(0, 5).map(citationFromMatch),
      plan: parsed.plan ?? null,
      match_count: matches.length,
      model: Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'RAG chat failed' }, 500);
  }
});
