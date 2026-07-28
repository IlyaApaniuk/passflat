import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

/**
 * Per-field caps for the text params. The endpoint is public and unsigned, so
 * these bound how much text a stranger can put on a Passflat-branded card and
 * how much layout work satori can be made to do. Each cap sits well above the
 * longest real value we render (longest today: a 278-char blog description in
 * `subtitle`, ~110-char building titles), so nothing genuine gets clipped —
 * raise the cap rather than shortening real copy.
 */
const MAX_LENGTHS = {
  title: 200,
  subtitle: 320,
  stat: 48,
  statLabel: 96,
  split: 120,
  scoreLabel: 96,
} as const;

// Control chars (satori renders them as tofu/blank boxes) plus the bidi and
// zero-width formatting chars that could be used to scramble the card's text.
// eslint-disable-next-line no-control-regex -- matching control chars is the point
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

function readParam(searchParams: URLSearchParams, key: keyof typeof MAX_LENGTHS): string | null {
  const raw = searchParams.get(key);
  if (raw == null) return null;
  const cleaned = raw.replace(UNSAFE_CHARS, ' ').trim().slice(0, MAX_LENGTHS[key]);
  return cleaned || null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const title = readParam(searchParams, 'title') ?? 'Passflat';
  const subtitle =
    readParam(searchParams, 'subtitle') ?? 'European rental marketplace with transparent costs';
  // Optional rich cost card (building / district / city share). Callers pass
  // already-localized, already-formatted strings so this route stays
  // language-agnostic and does no number/locale formatting itself.
  const stat = readParam(searchParams, 'stat');
  const statLabel = readParam(searchParams, 'statLabel');
  const split = readParam(searchParams, 'split');
  const rawScoreParam = searchParams.get('score');
  const rawScore = rawScoreParam == null ? Number.NaN : Number(rawScoreParam);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : null;
  const scoreLabel = readParam(searchParams, 'scoreLabel') ?? 'Location score';
  const scoreCircumference = 2 * Math.PI * 60;

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
          fontSize: stat || score != null ? '52px' : '64px',
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

      {score != null ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '32px',
            marginTop: '34px',
            padding: '20px 30px 20px 20px',
            borderRadius: '20px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '160px',
              height: '160px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle
                cx="80"
                cy="80"
                r="60"
                fill="none"
                stroke="rgba(148,163,184,0.22)"
                strokeWidth="14"
              />
              <circle
                cx="80"
                cy="80"
                r="60"
                fill="none"
                stroke="#8bde54"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${scoreCircumference} ${scoreCircumference}`}
                strokeDashoffset={scoreCircumference * (1 - score / 100)}
                transform="rotate(-90 80 80)"
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8bde54',
                fontSize: '54px',
                fontWeight: 800,
              }}
            >
              {score}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', color: '#f8fafc', fontSize: '32px', fontWeight: 700 }}>
              {scoreLabel}
            </div>
            <div style={{ display: 'flex', color: '#94a3b8', fontSize: '23px', marginTop: '8px' }}>
              0–100
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
