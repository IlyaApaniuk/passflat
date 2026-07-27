import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { deletePhotosFromStorage } from '@/lib/supabase/storage-server';

const BUCKET = 'listing-photos';

/**
 * Accepted image types → the extension we store under, plus the file-header
 * signature we require. The bucket is public, so neither the client-declared
 * MIME type nor the original filename is trusted: the extension comes from this
 * table and the bytes have to actually look like that format.
 */
const ALLOWED_IMAGES: Record<string, { ext: string; matches: (head: Uint8Array) => boolean }> = {
  'image/jpeg': { ext: 'jpg', matches: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
  'image/png': { ext: 'png', matches: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47]) },
  'image/webp': {
    // "RIFF" .... "WEBP"
    ext: 'webp',
    matches: (h) =>
      startsWith(h, [0x52, 0x49, 0x46, 0x46]) &&
      startsWith(h.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from Server Component
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  const imageType = ALLOWED_IMAGES[file.type];
  if (!imageType) {
    return NextResponse.json(
      { error: 'Invalid file type. Use JPEG, PNG, or WebP' },
      { status: 400 },
    );
  }

  // Verify the declared type against the actual file header (12 bytes covers the
  // longest signature, WebP's RIFF....WEBP).
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!imageType.matches(head)) {
    return NextResponse.json(
      { error: 'Invalid file type. Use JPEG, PNG, or WebP' },
      { status: 400 },
    );
  }

  const path = `${user.id}/${crypto.randomUUID()}.${imageType.ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '31536000', upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ url: data.publicUrl });
}

export async function DELETE(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from Server Component
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const url = body?.url;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Missing "url" in request body' }, { status: 400 });
  }

  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) {
    return NextResponse.json({ error: 'Invalid photo URL' }, { status: 400 });
  }

  const filePath = url.slice(idx + marker.length);
  if (!filePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await deletePhotosFromStorage([url]);

  return NextResponse.json({ success: true });
}
