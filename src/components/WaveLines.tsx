/** Flowing wave-line background used on the sign-in and loading screens. */
export function WaveLines({
  className,
}: {
  className?: string;
}) {
  const lineCount = 90;

  return (
    <svg
      viewBox="0 0 1200 900"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      {Array.from({ length: lineCount }, (_, i) => {
        const y = -120 + i * 11;
        const bow = i * 2.4;
        const fade = i / lineCount;

        const opacity =
          0.025 + Math.sin(fade * Math.PI) * 0.16;

        return (
          <path
            key={i}
            d={`
              M -120 ${y + 170}
              C 220 ${y + 170},
                380 ${y - 30 + bow},
                640 ${y + 145 + bow}
              S 1120 ${y - 55 + bow},
                1320 ${y - 100 + bow}
            `}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeOpacity={opacity}
          />
        );
      })}
    </svg>
  );
}