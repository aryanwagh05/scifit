export const VECTOR_DIMENSION = 384;

export type InlineMedia = {
  mimeType: string;
  data: string;
};

export type RagCitation = {
  title: string;
  source: string;
  url?: string;
  year?: string;
};

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function l2Normalize(values: number[]) {
  const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => Number((value / length).toFixed(6)));
}

export function hashEmbedding(text: string) {
  const vector = new Array<number>(VECTOR_DIMENSION).fill(0);
  const tokens = tokenize(text);

  tokens.forEach((token, index) => {
    const primary = hashString(token);
    const secondary = hashString(`${token}:${index % 17}`);
    vector[primary % VECTOR_DIMENSION] += 1;
    vector[secondary % VECTOR_DIMENSION] += 0.5;
  });

  return l2Normalize(vector);
}

function fitDimension(values: number[]) {
  const next = values.slice(0, VECTOR_DIMENSION);
  while (next.length < VECTOR_DIMENSION) {
    next.push(0);
  }
  return l2Normalize(next);
}

export function toVectorLiteral(values: number[]) {
  return `[${fitDimension(values).join(',')}]`;
}

export async function createEmbedding(text: string) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return hashEmbedding(text);
  }

  const model = Deno.env.get('GEMINI_EMBED_MODEL') || 'gemini-embedding-2';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: {
        parts: [{ text: text.slice(0, 8000) }]
      },
      outputDimensionality: VECTOR_DIMENSION
    })
  });

  if (!response.ok) {
    return hashEmbedding(text);
  }

  const data = await response.json();
  const values = data?.embedding?.values;
  return Array.isArray(values) ? fitDimension(values.map(Number)) : hashEmbedding(text);
}

function stripFence(value: string) {
  return value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function parseJsonModelOutput<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(stripFence(value)) as T;
  } catch {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(value.slice(start, end + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

export async function generateWithGemini({
  system,
  prompt,
  media,
  json = false
}: {
  system: string;
  prompt: string;
  media?: InlineMedia | null;
  json?: boolean;
}) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return null;
  }

  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (media) {
    parts.push({
      inline_data: {
        mime_type: media.mimeType,
        data: media.data
      }
    });
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: system }]
      },
      contents: [
        {
          role: 'user',
          parts
        }
      ],
      generationConfig: {
        temperature: 0.35,
        ...(json ? { responseMimeType: 'application/json' } : {})
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${text.slice(0, 160)}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('\n').trim() ?? null;
}
