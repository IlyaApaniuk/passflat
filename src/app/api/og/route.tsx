import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const title = searchParams.get('title') ?? 'Passflat';
  const subtitle =
    searchParams.get('subtitle') ?? 'European rental marketplace with transparent costs';
  // Optional rich cost card (building / district / city share). Callers pass
  // already-localized, already-formatted strings so this route stays
  // language-agnostic and does no number/locale formatting itself.
  const stat = searchParams.get('stat');
  const statLabel = searchParams.get('statLabel');
  const split = searchParams.get('split');

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
          display: 'flex',
          fontSize: stat ? '52px' : '64px',
          fontWeight: 800,
          color: 'white',
          lineHeight: 1.15,
          letterSpacing: '-0.03em',
          maxWidth: '1000px',
          marginBottom: '16px',
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: 'flex',
          fontSize: '26px',
          fontWeight: 400,
          color: '#94a3b8',
          lineHeight: 1.4,
          maxWidth: '900px',
        }}
      >
        {subtitle}
      </div>

      {stat ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: '36px',
            padding: '28px 36px',
            borderRadius: '20px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {statLabel ? (
            <div
              style={{
                display: 'flex',
                fontSize: '24px',
                color: '#94a3b8',
                marginBottom: '8px',
              }}
            >
              {statLabel}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              fontSize: '76px',
              fontWeight: 800,
              color: '#8bde54',
              letterSpacing: '-0.03em',
            }}
          >
            {stat}
          </div>
          {split ? (
            <div style={{ display: 'flex', fontSize: '26px', color: '#e2e8f0', marginTop: '10px' }}>
              {split}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
