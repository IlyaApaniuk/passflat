'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    if (posthog.__loaded) {
      posthog.captureException(error, { digest: error.digest });
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fbfbfb',
          color: '#1a1a22',
          fontFamily: 'Manrope, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: '1rem',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '1.25rem',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                height: '2rem',
                width: '2rem',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '0.5rem',
                backgroundColor: '#4f2fdd',
                color: '#ffffff',
              }}
            >
              P
            </span>
            Passflat
          </div>

          <h1 style={{ marginTop: '2rem', fontSize: '1.75rem', fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: '0.75rem', color: '#6b6b78', lineHeight: 1.5 }}>
            An unexpected error occurred. You can try again, or head back to the homepage.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: '0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#9a9aa5',
              }}
            >
              {error.digest}
            </p>
          )}

          <div
            style={{
              marginTop: '2rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={reset}
              style={{
                height: '3rem',
                padding: '0 2rem',
                borderRadius: '9999px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 500,
                backgroundColor: '#4f2fdd',
                color: '#ffffff',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                height: '3rem',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0 2rem',
                borderRadius: '9999px',
                border: '1px solid #e4e4ea',
                textDecoration: 'none',
                fontSize: '1rem',
                fontWeight: 500,
                color: '#1a1a22',
              }}
            >
              Back to home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
