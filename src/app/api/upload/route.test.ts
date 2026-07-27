import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Shared mock state, hoisted so the vi.mock factories can read it.
const h = vi.hoisted(() => ({
  user: { id: '11111111-1111-4111-8111-111111111111' } as null | { id: string },
  upload: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: h.user } })) },
    storage: {
      from: vi.fn(() => ({
        upload: h.upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      })),
    },
  })),
}));

vi.mock('@/lib/supabase/storage-server', () => ({ deletePhotosFromStorage: vi.fn() }));

// Imported after the mocks are registered.
import { POST } from './route';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function uploadReq(file: File): NextRequest {
  const form = new FormData();
  form.set('file', file);
  return { formData: async () => form } as unknown as NextRequest;
}

function pngFile(name: string): File {
  return new File([new Uint8Array([...PNG_HEADER, 0, 0, 0, 0])], name, { type: 'image/png' });
}

beforeEach(() => {
  h.user = { id: '11111111-1111-4111-8111-111111111111' };
  h.upload.mockReset().mockResolvedValue({ error: null });
});

describe('POST /api/upload', () => {
  it('stores the extension implied by the MIME type, not the one in the filename', async () => {
    const res = await POST(uploadReq(pngFile('payload.html')));
    expect(res.status).toBe(200);
    const [path] = h.upload.mock.calls[0];
    expect(path).toMatch(/^11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\.png$/);
  });

  it('rejects a file whose bytes do not match its declared type', async () => {
    const disguised = new File(['<script>alert(1)</script>'], 'photo.png', { type: 'image/png' });
    const res = await POST(uploadReq(disguised));
    expect(res.status).toBe(400);
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('rejects a disallowed MIME type', async () => {
    const svg = new File(['<svg />'], 'photo.svg', { type: 'image/svg+xml' });
    const res = await POST(uploadReq(svg));
    expect(res.status).toBe(400);
    expect(h.upload).not.toHaveBeenCalled();
  });
});
