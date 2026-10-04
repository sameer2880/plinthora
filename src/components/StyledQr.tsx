import { useId, useMemo } from "react";
import QRCode from "qrcode";

/**
 * Branded QR code: rounded modules, rounded finder "eyes", dark-green gradient,
 * circular logo in the middle and a green double-line rounded frame.
 * Pure SVG (scales crisply), generated client-side from `value`.
 */

const PAD = 3.6; // white quiet zone + frame, in module units

function rr(x: number, y: number, w: number, h: number, r: number) {
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

export function StyledQr({
  value,
  size = 176,
  logoSrc = "/qr-logo.png",
  className,
  label,
}: {
  value: string;
  size?: number;
  logoSrc?: string;
  className?: string;
  label?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const { n, modules } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "H" });
    const n = qr.modules.size;
    const data = qr.modules.data as unknown as ArrayLike<number>;
    const c = n / 2;
    const clearR = n * 0.115; // area kept free for the logo
    const out: Array<[number, number]> = [];

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!data[y * n + x]) continue;
        const inFinder =
          (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
        if (inFinder) continue;
        if (Math.hypot(x + 0.5 - c, y + 0.5 - c) < clearR + 0.6) continue;
        out.push([x, y]);
      }
    }
    return { n, modules: out };
  }, [value]);

  const W = n + PAD * 2;
  const eyes: Array<[number, number]> = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ];
  const logoR = n * 0.115;

  const modulePath = modules
    .map(([x, y]) => rr(PAD + x + 0.03, PAD + y + 0.03, 0.94, 0.94, 0.3))
    .join("");

  const eyePath = eyes
    .map(([x, y]) => {
      const ox = PAD + x;
      const oy = PAD + y;
      return rr(ox, oy, 7, 7, 2.1) + rr(ox + 1, oy + 1, 5, 5, 1.3);
    })
    .join("");

  const eyeCore = eyes
    .map(([x, y]) => rr(PAD + x + 2, PAD + y + 2, 3, 3, 0.95))
    .join("");

  return (
    <svg
      viewBox={`0 0 ${W} ${W}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={label ?? "QR code"}
    >
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#052a10" />
          <stop offset="1" stopColor="#0b5a24" />
        </linearGradient>
        <clipPath id={`c${uid}`}>
          <circle cx={W / 2} cy={W / 2} r={logoR - 0.35} />
        </clipPath>
      </defs>

      {/* frame: dark edge → green band → dark line → white */}
      <rect width={W} height={W} rx={4.6} fill="#06200d" />
      <rect x={0.14} y={0.14} width={W - 0.28} height={W - 0.28} rx={4.45} fill="#22e65a" />
      <rect x={0.72} y={0.72} width={W - 1.44} height={W - 1.44} rx={3.9} fill="#06200d" />
      <rect x={0.88} y={0.88} width={W - 1.76} height={W - 1.76} rx={3.75} fill="#ffffff" />

      {/* data modules + eyes */}
      <path d={modulePath} fill={`url(#g${uid})`} />
      <path d={eyePath} fill={`url(#g${uid})`} fillRule="evenodd" />
      <path d={eyeCore} fill={`url(#g${uid})`} />

      {/* logo */}
      <circle cx={W / 2} cy={W / 2} r={logoR} fill="#22e65a" />
      <circle cx={W / 2} cy={W / 2} r={logoR - 0.25} fill="#041a0a" />
      <image
        href={logoSrc}
        x={W / 2 - logoR}
        y={W / 2 - logoR}
        width={logoR * 2}
        height={logoR * 2}
        clipPath={`url(#c${uid})`}
        preserveAspectRatio="xMidYMid slice"
      />
    </svg>
  );
}