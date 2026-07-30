import { generateSplit, getNutritionTargets } from './science';
import type { Citation, Profile, UploadAsset } from './science';

export type ResearchSource = {
  id: string;
  externalId: string;
  title: string;
  abstract: string;
  source: string;
  journal: string;
  year: string;
  date: string;
  authors: string;
  url: string;
  doi?: string;
  pmid?: string;
  tags: string[];
  importedAt: string;
};

export type RetrievalHit = {
  source: ResearchSource;
  score: number;
  snippet: string;
};

type EuropePmcResult = {
  id?: string;
  source?: string;
  pmid?: string;
  doi?: string;
  title?: string;
  abstractText?: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  firstPublicationDate?: string;
  firstIndexDate?: string;
  pubType?: string;
};

type EuropePmcResponse = {
  resultList?: {
    result?: EuropePmcResult[];
  };
};

export const starterEvidenceQueries = [
  {
    label: 'Hypertrophy',
    query: 'TITLE:"hypertrophy" AND "resistance training" AND "meta-analysis"'
  },
  {
    label: 'Protein',
    query: 'TITLE:"protein" AND "resistance training" AND "meta-analysis"'
  },
  {
    label: 'Weight loss',
    query: '(TITLE:"fat loss" OR TITLE:"body composition") AND "resistance training" AND ("systematic review" OR "meta-analysis")'
  },
  {
    label: 'Failure',
    query: 'TITLE:"repetition failure" AND "resistance training" AND "meta-analysis"'
  }
];

export function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSourceId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function tokenize(value: string) {
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'from',
    'what',
    'should',
    'about',
    'using',
    'into',
    'does',
    'your',
    'have',
    'when',
    'than',
    'then',
    'will',
    'they',
    'their'
  ]);

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stop.has(token));
}

function sourceFromEuropePmc(item: EuropePmcResult, label: string): ResearchSource | null {
  const title = stripHtml(item.title ?? '');
  const abstract = stripHtml(item.abstractText ?? '');
  if (!title || abstract.length < 80) {
    return null;
  }

  const externalId = item.pmid ? `pmid-${item.pmid}` : item.doi ? `doi-${item.doi}` : `epmc-${item.id ?? title}`;
  const year = item.pubYear ?? item.firstPublicationDate?.slice(0, 4) ?? '';
  const url = item.pmid
    ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`
    : item.doi
      ? `https://doi.org/${item.doi}`
      : `https://europepmc.org/article/${item.source ?? 'MED'}/${item.id ?? ''}`;

  return {
    id: normalizeSourceId(externalId),
    externalId,
    title,
    abstract,
    source: 'Europe PMC / PubMed',
    journal: item.journalTitle ?? 'Unknown journal',
    year,
    date: item.firstPublicationDate ?? item.firstIndexDate ?? year,
    authors: item.authorString ?? 'Unknown authors',
    url,
    doi: item.doi,
    pmid: item.pmid,
    tags: [label],
    importedAt: new Date().toISOString()
  };
}

export async function fetchEuropePmcSources(query: string, label = 'Imported', pageSize = 8, sortMode: 'latest' | 'relevance' = 'latest') {
  const params = new URLSearchParams({
    query,
    format: 'json',
    resultType: 'core',
    pageSize: String(pageSize)
  });
  if (sortMode === 'latest') {
    params.set('sort', 'FIRST_PDATE_D desc');
  }
  const response = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Europe PMC request failed with ${response.status}`);
  }

  const data = (await response.json()) as EuropePmcResponse;
  return (data.resultList?.result ?? [])
    .map((item) => sourceFromEuropePmc(item, label))
    .filter((item): item is ResearchSource => Boolean(item));
}

export function createManualSource(input: {
  title: string;
  abstract: string;
  source?: string;
  url?: string;
  tags?: string;
}): ResearchSource {
  const title = input.title.trim() || 'Untitled source';
  const source = input.source?.trim() || 'Manual source';
  const url = input.url?.trim() || '';
  const externalId = url ? `url-${url}` : `manual-${title}-${Date.now()}`;

  return {
    id: normalizeSourceId(externalId),
    externalId,
    title,
    abstract: stripHtml(input.abstract),
    source,
    journal: source,
    year: '',
    date: '',
    authors: '',
    url,
    tags: input.tags?.split(',').map((tag) => tag.trim()).filter(Boolean) ?? ['Manual'],
    importedAt: new Date().toISOString()
  };
}

export function mergeSources(current: ResearchSource[], incoming: ResearchSource[]) {
  const map = new Map<string, ResearchSource>();
  [...incoming, ...current].forEach((source) => {
    const key = source.externalId || source.id;
    if (!map.has(key)) {
      map.set(key, {
        ...source,
        tags: Array.from(new Set(source.tags.filter(Boolean)))
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const dateA = Date.parse(a.date || a.importedAt || '1970-01-01');
    const dateB = Date.parse(b.date || b.importedAt || '1970-01-01');
    return dateB - dateA;
  });
}

function getSnippet(text: string, terms: string[]) {
  const clean = stripHtml(text);
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  const ranked = sentences
    .map((sentence) => ({
      sentence: sentence.trim(),
      score: terms.reduce((sum, term) => sum + (sentence.toLowerCase().includes(term) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.sentence.slice(0, 260) ?? clean.slice(0, 260);
}

function topicalBoost(question: string, source: ResearchSource) {
  const lowerQuestion = question.toLowerCase();
  const haystack = `${source.title} ${source.abstract} ${source.tags.join(' ')}`.toLowerCase();
  const tagText = source.tags.join(' ').toLowerCase();

  if (/protein|nutrition|meal|calorie|diet|macro/.test(lowerQuestion)) {
    return (/protein|nutrition/.test(tagText) ? 5 : 0) + (/protein|amino acid|nutrition|diet|supplement|macro/.test(haystack) ? 4.2 : -0.4);
  }

  if (/cut|fat|weight loss|deficit|body composition/.test(lowerQuestion)) {
    return (/weight loss|fat loss|body composition/.test(tagText) ? 4.5 : 0) + (/weight loss|fat mass|body composition|energy restriction|obesity|deficit/.test(haystack) ? 4 : -0.4);
  }

  if (/failure|rpe|rir|recovery|soreness/.test(lowerQuestion)) {
    return (/failure|recovery/.test(tagText) ? 4 : 0) + (/failure|rir|repetitions in reserve|recovery|fatigue|autoregulation|soreness/.test(haystack) ? 3.4 : 0);
  }

  if (/split|program|plan|sets|volume|hypertrophy|muscle/.test(lowerQuestion)) {
    return (/hypertrophy|training/.test(tagText) ? 3 : 0) + (/hypertrophy|muscle mass|resistance training|strength training|volume|sets/.test(haystack) ? 2.4 : 0);
  }

  return 0;
}

export function retrieveSources(question: string, sources: ResearchSource[], limit = 5): RetrievalHit[] {
  const terms = tokenize(question);
  if (!terms.length) {
    return sources.slice(0, limit).map((source) => ({ source, score: 0.1, snippet: getSnippet(source.abstract, []) }));
  }

  return sources
    .map((source) => {
      const haystack = `${source.title} ${source.abstract} ${source.tags.join(' ')}`.toLowerCase();
      const termScore = terms.reduce((sum, term) => {
        const titleBoost = source.title.toLowerCase().includes(term) ? 2.4 : 0;
        const abstractBoost = haystack.includes(term) ? 1 : 0;
        return sum + titleBoost + abstractBoost;
      }, 0);
      const reviewBoost = /meta-analysis|systematic review|review/i.test(`${source.title} ${source.abstract}`) ? 1.2 : 0;
      const recencyBoost = source.year ? Math.max(0, (Number(source.year) - 2020) * 0.12) : 0;
      return {
        source,
        score: termScore + reviewBoost + recencyBoost + topicalBoost(question, source),
        snippet: getSnippet(source.abstract, terms)
      };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function topicLabel(question: string) {
  const lower = question.toLowerCase();
  if (/protein|nutrition|meal|calorie|diet|macro/.test(lower)) return 'nutrition';
  if (/cut|fat|weight loss|deficit/.test(lower)) return 'weight loss';
  if (/split|program|plan|sets|volume|hypertrophy|muscle/.test(lower)) return 'training';
  if (/failure|rpe|rir|recovery|soreness/.test(lower)) return 'recovery';
  if (/form|video|squat|bench|deadlift/.test(lower)) return 'form';
  return 'fitness';
}

export function answerWithRag(question: string, profile: Profile, uploads: UploadAsset[], sources: ResearchSource[]) {
  const hits = retrieveSources(question, sources, 5);
  const topic = topicLabel(question);
  const nutrition = getNutritionTargets(profile);
  const split = generateSplit(profile);
  const hasMedia = uploads.length > 0;

  if (!sources.length) {
    return {
      answer:
        'I need the research corpus to finish syncing before I can give a source-grounded answer. Your profile and uploads are saved for the next run.',
      citations: [],
      confidence: 0
    };
  }

  if (!hits.length) {
    return {
      answer:
        'I could not find a strong evidence match for that exact question yet. Ask with more detail about the goal, exercise, meal, or phase so I can retrieve the closest source-backed guidance.',
      citations: [],
      confidence: 0.12
    };
  }

  const citations: Citation[] = hits.map((hit) => ({
    title: hit.source.title,
    source: `${hit.source.journal}${hit.source.year ? `, ${hit.source.year}` : ''}`,
    url: hit.source.url,
    year: hit.source.year
  }));

  const sourceLine = hits
    .slice(0, 3)
    .map((hit, index) => `[${index + 1}] ${hit.source.title}${hit.source.year ? ` (${hit.source.year})` : ''}`)
    .join(' ');

  const topicAdvice: Record<string, string> = {
    nutrition: `For your ${profile.goal.toLowerCase()} goal, use ${nutrition.calories} kcal as a starting target with about ${nutrition.protein} g protein, then adjust from bodyweight trend and training performance.`,
    'weight loss': `For weight loss, keep the deficit conservative enough to preserve training output. Start near ${nutrition.calories} kcal, keep protein around ${nutrition.protein} g, and track weekly bodyweight trend instead of reacting to one day.`,
    training: `For training, the generated ${profile.trainingDays}-day split should begin with ${split[0]?.day ?? 'the first training day'} and bias hard sets toward recoverable volume before adding intensity.`,
    recovery: `For recovery, keep most hard sets below failure when soreness and sleep are poor. Your current sleep/soreness profile should decide whether to add volume or hold steady.`,
    form: hasMedia
      ? 'Your media is attached for review. The free local RAG layer can ground coaching cues in sources, but rep counting and joint-angle analysis still need a vision model or backend worker.'
      : 'Attach a lifting video before asking for form analysis; source-grounded cues can still be generated from the library.',
    fitness: `For your ${profile.goal.toLowerCase()} goal, combine the plan, nutrition targets, and recovery state instead of changing one variable in isolation.`
  };

  const confidence = Math.min(0.92, Math.max(0.25, hits[0].score / 8));
  return {
    answer: `${topicAdvice[topic]} Retrieved evidence used for this answer: ${sourceLine}`,
    citations,
    confidence
  };
}
