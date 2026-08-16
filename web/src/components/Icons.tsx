interface IconProps {
  size?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const MicIcon = ({ size = 19 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

export const MicOffIcon = ({ size = 19 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M15 9V6a3 3 0 0 0-5.9-.7M9 10v2a3 3 0 0 0 4.7 2.5" />
    <path d="M5 11a7 7 0 0 0 10.6 6M19 11v1M12 18v3" />
    <path d="M4 3l16 18" />
  </svg>
);

export const CameraIcon = ({ size = 19 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2L9 4h6l1.5 2h2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8Z" />
    <circle cx="12" cy="12.5" r="3.2" />
  </svg>
);

export const CameraOffIcon = ({ size = 19 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H7M21 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-13" />
    <path d="M9.2 9.4a3.2 3.2 0 0 0 4.4 4.4" />
    <path d="M4 3l16 18" />
  </svg>
);

export const SettingsIcon = ({ size = 19 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z" />
  </svg>
);

export const FullscreenIcon = ({ size = 19 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  </svg>
);

export const ExitFullscreenIcon = ({ size = 19 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" />
  </svg>
);

export const HistoryIcon = ({ size = 19 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 5v4h4" />
    <path d="M12 8v4.5l3 1.7" />
  </svg>
);

export const CloseIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const ScreenIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M9 21h6M12 17v4" />
  </svg>
);

export const EyeIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);

export const SendIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 12h14M13 6l6 6-6 6" />
  </svg>
);
