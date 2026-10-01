"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QrCode({ value, className = "" }: { value: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b1027", light: "#fff4dc" } })
      .then((s) => !cancelled && setSvg(s))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [value]);
  return (
    <div
      className={`aspect-square overflow-hidden rounded-2xl bg-cream [&>svg]:h-full [&>svg]:w-full ${className}`}
      role="img"
      aria-label={`QR code to join: ${value}`}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
