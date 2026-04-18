import { ImageResponse } from 'next/og';

export const alt = 'VibeSync — one room, one frequency';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#070809',
          backgroundImage:
            'radial-gradient(closest-side at 50% 42%, rgba(158,201,255,0.18), transparent 72%)',
          color: '#eef2f6',
          letterSpacing: '-0.04em',
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            background:
              'radial-gradient(circle at 50% 50%, #070809 0%, #070809 60%, #6b8ba8 74%, #bcdcff 92%, #9ec9ff 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 48,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: '#ffffff',
            }}
          />
        </div>
        <div style={{ fontSize: 168, fontWeight: 600, lineHeight: 1 }}>VibeSync</div>
        <div
          style={{
            marginTop: 28,
            fontSize: 26,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: 'rgba(222, 230, 240, 0.55)',
          }}
        >
          one room · one frequency
        </div>
      </div>
    ),
    { ...size },
  );
}
