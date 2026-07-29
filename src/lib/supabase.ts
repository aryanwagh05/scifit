import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ??
  '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;

function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function uploadMediaFile(userId: string, file: File) {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const safeName = cleanFileName(file.name) || 'upload';
  const path = `${userId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('media').upload(path, file, {
    contentType: file.type || undefined,
    upsert: false
  });

  if (error) {
    throw error;
  }

  const { data } = await supabase.storage.from('media').createSignedUrl(path, 60 * 60);
  return { path, signedUrl: data?.signedUrl ?? null };
}
