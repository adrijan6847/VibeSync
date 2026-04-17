'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QR({ value, size = 156 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    let alive = true;
    QRCode.toString(value, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      color: { dark: '#ffffff', light: '#00000000' },
    })
      .then((s) => {
        if (alive) setSvg(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value]);

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3"
      style={{ width: size, height: size }}
      aria-label="Join by QR code"
    >
      <div
        className="h-full w-full [&_path]:fill-white"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
