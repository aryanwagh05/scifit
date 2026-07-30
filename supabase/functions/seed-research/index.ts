import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { createEmbedding, toVectorLiteral } from '../_shared/ai.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { seedResearchCorpus, type SeedResearchSource } from '../_shared/seed_corpus.ts';

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

function assertSeedSecret(req: Request) {
  const expected = Deno.env.get('SCIFIT_ADMIN_SEED_SECRET');
  if (!expected) {
    throw new Error('SCIFIT_ADMIN_SEED_SECRET is required before seeding research');
  }

  const provided = req.headers.get('x-scifit-admin-secret');
  if (provided !== expected) {
    return false;
  }

  return true;
}

async function upsertGlobalDocument(admin: ReturnType<typeof getAdminClient>, source: SeedResearchSource) {
  const { data: existing, error: lookupError } = await admin
    .from('rag_documents')
    .select('id')
    .is('user_id', null)
    .eq('external_id', source.externalId)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  const row = {
    user_id: null,
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
  };

  if (existing?.id) {
    const { error } = await admin.from('rag_documents').update(row).eq('id', existing.id);
    if (error) {
      throw error;
    }
    return existing.id as string;
  }

  const { data, error } = await admin.from('rag_documents').insert(row).select('id').single();
  if (error) {
    throw error;
  }

  return data.id as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    if (!assertSeedSecret(req)) {
      return jsonResponse({ error: 'Invalid seed secret' }, 401);
    }

    const admin = getAdminClient();
    let ingested = 0;

    for (const source of seedResearchCorpus) {
      const documentId = await upsertGlobalDocument(admin, source);
      const content = `${source.title}\n\n${source.abstract}`.slice(0, 9000);
      const embedding = await createEmbedding(content);

      await admin.from('rag_chunks').delete().eq('document_id', documentId);
      const { error: chunkError } = await admin.from('rag_chunks').insert({
        user_id: null,
        document_id: documentId,
        content,
        embedding: toVectorLiteral(embedding),
        token_count: Math.ceil(content.length / 4),
        metadata: {
          external_id: source.externalId,
          tags: source.tags,
          seeded: true
        }
      });

      if (chunkError) {
        throw chunkError;
      }

      ingested += 1;
    }

    return jsonResponse({
      ingested,
      scope: 'global',
      embedding_provider: Deno.env.get('GEMINI_API_KEY') ? 'gemini' : 'local-hash'
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Research seed failed' }, 500);
  }
});
