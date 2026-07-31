export function WavePlane() {
  return (
    <div className="wave-plane" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="w1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1f6f78" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2f8f9a" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="w2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f4c52" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#d9ebe8" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <path
          fill="url(#w1)"
          d="M0,220 C180,140 320,320 520,250 C760,160 880,60 1100,140 C1260,200 1360,280 1440,240 L1440,900 L0,900 Z"
        />
        <path
          fill="url(#w2)"
          d="M0,360 C220,300 360,460 560,400 C820,320 960,220 1180,310 C1300,360 1380,420 1440,390 L1440,900 L0,900 Z"
        />
        <path
          fill="rgba(16,40,44,0.06)"
          d="M0,520 C260,470 420,620 680,560 C980,480 1120,430 1440,520 L1440,900 L0,900 Z"
        />
      </svg>
    </div>
  )
}
