import { create } from 'zustand';
import imageCompression from 'browser-image-compression';

export type PublishStatus = 'idle' | 'compressing' | 'uploading' | 'creating' | 'done' | 'error';

interface LocalPhoto {
  file: File;
  preview: string;
}

interface FormPayload {
  [key: string]: unknown;
}

interface PublishState {
  status: PublishStatus;
  progress: { current: number; total: number };
  error: string | null;
  listingId: string | null;
  listingType: string | null;
  citySlug: string | null;

  _files: LocalPhoto[];
  _payload: FormPayload | null;
  _uploadedUrls: string[];

  startPublish: (files: LocalPhoto[], payload: FormPayload) => Promise<void>;
  retry: () => Promise<void>;
  dismiss: () => void;
}

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 2048,
  useWebWorker: true,
  fileType: 'image/jpeg' as const,
};

async function compressPhoto(file: File): Promise<File> {
  if (file.size <= 1.5 * 1024 * 1024) return file;
  return imageCompression(file, COMPRESSION_OPTIONS);
}

async function uploadPhoto(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Upload failed');
  }
  const data = await res.json();
  return data.url;
}

async function createListing(payload: FormPayload): Promise<{ id: string; type: string }> {
  const res = await fetch('/api/listings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to create listing');
  }
  const data = await res.json();
  return { id: data.listing.id, type: data.listing.type };
}

export const usePublishStore = create<PublishState>((set, get) => ({
  status: 'idle',
  progress: { current: 0, total: 0 },
  error: null,
  listingId: null,
  listingType: null,
  citySlug: null,

  _files: [],
  _payload: null,
  _uploadedUrls: [],

  startPublish: async (files, payload) => {
    const total = files.length;
    set({
      status: 'compressing',
      progress: { current: 0, total },
      error: null,
      listingId: null,
      listingType: (payload.type as string) || null,
      citySlug: (payload.citySlug as string) || null,
      _files: files,
      _payload: payload,
      _uploadedUrls: [],
    });

    try {
      const compressed: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const result = await compressPhoto(files[i].file);
        compressed.push(result);
        set({ progress: { current: i + 1, total } });
      }

      set({ status: 'uploading', progress: { current: 0, total } });

      const urls: string[] = [];
      for (let i = 0; i < compressed.length; i++) {
        const url = await uploadPhoto(compressed[i]);
        urls.push(url);
        set({ _uploadedUrls: [...urls], progress: { current: i + 1, total } });
      }

      set({ status: 'creating' });

      const result = await createListing({ ...payload, photos: urls });
      set({
        status: 'done',
        listingId: result.id,
        listingType: result.type,
        _files: [],
        _payload: null,
        _uploadedUrls: [],
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Something went wrong', status: 'error' });
    }
  },

  retry: async () => {
    const { _files, _payload, _uploadedUrls } = get();
    if (!_payload || _files.length === 0) return;

    const alreadyUploaded = _uploadedUrls.length;
    const remaining = _files.slice(alreadyUploaded);
    const total = _files.length;

    set({ status: 'uploading', error: null, progress: { current: alreadyUploaded, total } });

    try {
      const urls = [..._uploadedUrls];

      for (let i = 0; i < remaining.length; i++) {
        const compressed = await compressPhoto(remaining[i].file);
        const url = await uploadPhoto(compressed);
        urls.push(url);
        set({ _uploadedUrls: [...urls], progress: { current: alreadyUploaded + i + 1, total } });
      }

      set({ status: 'creating' });

      const result = await createListing({ ..._payload, photos: urls });
      set({
        status: 'done',
        listingId: result.id,
        listingType: result.type,
        _files: [],
        _payload: null,
        _uploadedUrls: [],
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Something went wrong', status: 'error' });
    }
  },

  dismiss: () => {
    const { _files } = get();
    _files.forEach((f) => URL.revokeObjectURL(f.preview));
    set({
      status: 'idle',
      progress: { current: 0, total: 0 },
      error: null,
      listingId: null,
      listingType: null,
      citySlug: null,
      _files: [],
      _payload: null,
      _uploadedUrls: [],
    });
  },
}));
