import { create } from 'zustand';
import imageCompression from 'browser-image-compression';

export type PhotoUploadStatus = 'idle' | 'compressing' | 'uploading' | 'done' | 'error';

export interface ManagedPhoto {
  id: string;
  file: File;
  preview: string;
  status: PhotoUploadStatus;
  url: string | null;
  error: string | null;
}

interface PhotoUploadState {
  photos: ManagedPhoto[];

  addPhotos: (files: File[]) => void;
  removePhoto: (id: string) => void;
  reorderPhotos: (fromIndex: number, toIndex: number) => void;
  retryPhoto: (id: string) => void;
  clearAll: () => void;

  initFromRemote: (urls: string[]) => void;
  getUploadedUrls: () => string[];
  allUploaded: () => boolean;
  hasErrors: () => boolean;
}

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1.0,
  maxWidthOrHeight: 2048,
  useWebWorker: true,
  fileType: 'image/jpeg' as const,
};

async function compressPhoto(file: File): Promise<File> {
  if (file.size <= 1.0 * 1024 * 1024) return file;
  return imageCompression(file, COMPRESSION_OPTIONS);
}

async function uploadSingle(file: File): Promise<string> {
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

async function deleteSingle(url: string): Promise<void> {
  await fetch('/api/upload', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }).catch(() => {});
}

function processPhoto(
  id: string,
  file: File,
  set: (fn: (state: PhotoUploadState) => Partial<PhotoUploadState>) => void,
) {
  const updatePhoto = (id: string, updates: Partial<ManagedPhoto>) => {
    set((state) => ({
      photos: state.photos.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  };

  (async () => {
    try {
      updatePhoto(id, { status: 'compressing' });
      const compressed = await compressPhoto(file);
      updatePhoto(id, { status: 'uploading' });
      const url = await uploadSingle(compressed);
      updatePhoto(id, { status: 'done', url });
    } catch (err) {
      updatePhoto(id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  })();
}

export const usePhotoUploadStore = create<PhotoUploadState>((set, get) => ({
  photos: [],

  addPhotos: (files) => {
    const newPhotos: ManagedPhoto[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      status: 'idle' as const,
      url: null,
      error: null,
    }));

    set((state) => ({ photos: [...state.photos, ...newPhotos] }));

    for (const photo of newPhotos) {
      processPhoto(photo.id, photo.file, set);
    }
  },

  removePhoto: (id) => {
    const photo = get().photos.find((p) => p.id === id);
    if (!photo) return;

    URL.revokeObjectURL(photo.preview);

    if (photo.url) {
      deleteSingle(photo.url);
    }

    set((state) => ({ photos: state.photos.filter((p) => p.id !== id) }));
  },

  reorderPhotos: (fromIndex, toIndex) => {
    set((state) => {
      const next = [...state.photos];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { photos: next };
    });
  },

  retryPhoto: (id) => {
    const photo = get().photos.find((p) => p.id === id);
    if (!photo || photo.status !== 'error') return;

    set((state) => ({
      photos: state.photos.map((p) =>
        p.id === id ? { ...p, status: 'idle' as const, error: null } : p,
      ),
    }));

    processPhoto(id, photo.file, set);
  },

  clearAll: () => {
    const { photos } = get();
    photos.forEach((p) => {
      URL.revokeObjectURL(p.preview);
    });
    set({ photos: [] });
  },

  initFromRemote: (urls) => {
    const remotePhotos: ManagedPhoto[] = urls.map((url) => ({
      id: crypto.randomUUID(),
      file: new File([], 'remote'),
      preview: url,
      status: 'done' as const,
      url,
      error: null,
    }));
    set({ photos: remotePhotos });
  },

  getUploadedUrls: () => {
    return get()
      .photos.filter((p) => p.status === 'done' && p.url)
      .map((p) => p.url!);
  },

  allUploaded: () => {
    const { photos } = get();
    return photos.length === 0 || photos.every((p) => p.status === 'done');
  },

  hasErrors: () => {
    return get().photos.some((p) => p.status === 'error');
  },
}));

// Re-export for backward compatibility with PublishSnackbar
export type PublishStatus = PhotoUploadStatus;
export const usePublishStore = usePhotoUploadStore;
