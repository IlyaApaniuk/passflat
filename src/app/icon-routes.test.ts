import { describe, expect, it } from 'vitest';
import * as appleTouchIcon from './apple-touch-icon.png/route';
import * as favicon from './favicon.ico/route';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from the PNG's IHDR chunk (bytes 16 – 23, big-endian). */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe.each([
  { path: '/favicon.ico', route: favicon, size: 48 },
  { path: '/apple-touch-icon.png', route: appleTouchIcon, size: 180 },
])('$path', ({ route, size }) => {
  it('exports only GET', () => {
    expect(Object.keys(route)).toEqual(['GET']);
  });

  it('answers 200 with a PNG and the icon cache header', () => {
    const response = route.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400, s-maxage=604800');
    expect(response.headers.get('location')).toBeNull();
  });

  it(`renders a ${size} × ${size} PNG`, async () => {
    const bytes = new Uint8Array(await route.GET().arrayBuffer());
    expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(pngSize(bytes)).toEqual({ width: size, height: size });
  });
});
