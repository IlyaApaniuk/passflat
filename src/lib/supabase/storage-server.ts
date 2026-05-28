import { createClient } from '@supabase/supabase-js';

const BUCKET = 'listing-photos';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function extractPath(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

export async function deletePhotosFromStorage(photoUrls: string[]): Promise<void> {
  const paths = photoUrls.map(extractPath).filter((p): p is string => p !== null);
  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    console.error('Failed to delete photos from storage:', error.message);
  }
}
