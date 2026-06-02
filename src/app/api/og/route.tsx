import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const title = searchParams.get('title') ?? 'Passflat';
  const subtitle =
    searchParams.get('subtitle') ?? 'European rental marketplace with transparent costs';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '80px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '40px',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            fontWeight: 700,
            color: 'white',
          }}
        >
          P
        </div>
        <span
          style={{
            fontSize: '32px',
            fontWeight: 700,
            color: '#94a3b8',
            letterSpacing: '-0.02em',
          }}
        >
          passflat.com
        </span>
      </div>

      <div
        style={{
          fontSize: '64px',
          fontWeight: 800,
          color: 'white',
          lineHeight: 1.15,
          letterSpacing: '-0.03em',
          maxWidth: '900px',
          marginBottom: '24px',
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: '28px',
          fontWeight: 400,
          color: '#94a3b8',
          lineHeight: 1.4,
          maxWidth: '800px',
        }}
      >
        {subtitle}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '80px',
          right: '80px',
          display: 'flex',
          gap: '12px',
        }}
      >
        {['PL', 'EN', 'RU', 'UA'].map((lang) => (
          <div
            key={lang}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: 'rgba(148, 163, 184, 0.15)',
              color: '#94a3b8',
              fontSize: '18px',
              fontWeight: 600,
            }}
          >
            {lang}
          </div>
        ))}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
