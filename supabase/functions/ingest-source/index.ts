import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { createEmbedding, toVectorLiteral } from '../_shared/ai.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

type SourceInput = {
  externalId?: string;
  id?: string;
  title: string;
  abstract: string;
  source?: string;
  journal?: string;
  year?: string;
  date?: string;
  authors?: string;
  url?: string;
  doi?: string;
  pmid?: string;
  tags?: string[];
  importedAt?: string;
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

function cleanSource(source: SourceInput) {
  const title = (source.title ?? '').trim();
  const abstract = (source.abstract ?? '').trim();
  if (!title || abstract.length < 40) {
    return null;
  }

  const externalId = source.externalId || source.id || source.url || `${title}-${source.year ?? ''}`;
  const tags = Array.from(new Set((source.tags ?? []).map((tag) => tag.trim()).filter(Boolean)));

  return {
    externalId,
    title,
    abstract,
    source: source.source || 'Research source',
    journal: source.journal || source.source || 'Unknown journal',
    year: source.year || '',
    date: source.date || source.year || '',
    authors: source.authors || '',
    url: source.url || '',
    doi: source.doi || null,
    pmid: source.pmid || null,
    tags,
    importedAt: source.importedAt || new Date().toISOString()
  };
}

type CleanSource = NonNullable<ReturnType<typeof cleanSource>>;

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
      return jsonResponse({ error: 'Sign in before ingesting sources' }, 401);
    }

    const body = await req.json();
    const sources: SourceInput[] = Array.isArray(body.sources) ? body.sources : [body.source].filter(Boolean);
    const cleaned: CleanSource[] = sources
      .map((source) => cleanSource(source))
      .filter((source): source is CleanSource => Boolean(source));

    if (!cleaned.length) {
      return jsonResponse({ ingested: 0, skipped: sources.length });
    }

    const sourceRows = cleaned.map((source) => ({
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
      doi: source.doi,
      pmid: source.pmid,
      tags: source.tags,
      imported_at: source.importedAt
    }));

    const { error: sourceError } = await admin
      .from('user_research_sources')
      .upsert(sourceRows, { onConflict: 'user_id,external_id' });

    if (sourceError) {
      throw sourceError;
    }

    let ingested = 0;
    for (const source of cleaned) {
      const { data: documents, error: documentError } = await admin
        .from('rag_documents')
        .upsert(
          {
            user_id: userId,
            external_id: source.externalId,
            title: source.title,
            source: source.source,
            url: source.url,
            journal: source.journal,
            published_year: source.year,
            tags: source.tags,
            metadata: {
              authors: source.authors,
              doi: source.doi,
              pmid: source.pmid,
              imported_at: source.importedAt
            }
          },
          { onConflict: 'user_id,external_id' }
        )
        .select('id')
        .limit(1);

      if (documentError) {
        throw documentError;
      }

      const documentId = documents?.[0]?.id;
      if (!documentId) {
        continue;
      }

      await admin.from('rag_chunks').delete().eq('document_id', documentId);
      const content = `${source.title}\n\n${source.abstract}`.slice(0, 9000);
      const embedding = await createEmbedding(content);
      const { error: chunkError } = await admin.from('rag_chunks').insert({
        user_id: userId,
        document_id: documentId,
        content,
        embedding: toVectorLiteral(embedding),
        token_count: Math.ceil(content.length / 4),
        metadata: {
          external_id: source.externalId,
          tags: source.tags
        }
      });

      if (chunkError) {
        throw chunkError;
      }
      ingested += 1;
    }

    return jsonResponse({ ingested, embedding_provider: Deno.env.get('GEMINI_API_KEY') ? 'gemini' : 'local-hash' });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Source ingestion failed' }, 500);
  }
});
