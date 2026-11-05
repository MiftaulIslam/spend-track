import type { SVGProps } from "react";

/**
 * Icons.
 *
 * A hand-built set rather than a library, for two reasons: the stroke weight is
 * tuned to this product's hairline aesthetic (1.7 rather than the usual 2), and
 * a tree-shaken set of thirty paths is smaller than any icon package.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Icon {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></Icon>
);
export const IconList = (p: IconProps) => (
  <Icon {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Icon>
);
export const IconWallet = (p: IconProps) => (
  <Icon {...p}><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" /><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5" /><path d="M16 13h.01" /></Icon>
);
export const IconCalendar = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>
);
export const IconTarget = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></Icon>
);
export const IconFlag = (p: IconProps) => (
  <Icon {...p}><path d="M4 21V4h9l1 2h6v9h-7l-1-2H4" /></Icon>
);
export const IconReceipt = (p: IconProps) => (
  <Icon {...p}><path d="M5 3v18l2.5-1.6L10 21l2-1.6L14 21l2.5-1.6L19 21V3z" /><path d="M9 8h6M9 12h6" /></Icon>
);
export const IconRepeat = (p: IconProps) => (
  <Icon {...p}><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></Icon>
);
export const IconRotate = (p: IconProps) => (
  <Icon {...p}><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></Icon>
);
export const IconTrendDown = (p: IconProps) => (
  <Icon {...p}><path d="M3 7l7 7 4-4 7 7" /><path d="M21 17v-5h-5" /></Icon>
);
export const IconHandshake = (p: IconProps) => (
  <Icon {...p}><path d="m11 17 2 2a1 1 0 1 0 3-3" /><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a2 2 0 0 1 0-2.8l.6-.6" /><path d="M8 7 5.4 9.6a2 2 0 0 0 0 2.8l3.4 3.4" /><path d="M3 12 9 6l3 3" /></Icon>
);
export const IconChart = (p: IconProps) => (
  <Icon {...p}><path d="M3 3v18h18" /><path d="M7 15v3M12 9v9M17 5v13" /></Icon>
);
export const IconFile = (p: IconProps) => (
  <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></Icon>
);
export const IconSparkle = (p: IconProps) => (
  <Icon {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></Icon>
);
export const IconTag = (p: IconProps) => (
  <Icon {...p}><path d="M3 11V5a2 2 0 0 1 2-2h6l10 10-8 8z" /><circle cx="8" cy="8" r="1.4" /></Icon>
);
export const IconStore = (p: IconProps) => (
  <Icon {...p}><path d="M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M3 9l1.5-5h15L21 9" /><path d="M9 21v-6h6v6" /></Icon>
);
export const IconCamera = (p: IconProps) => (
  <Icon {...p}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></Icon>
);
export const IconUpload = (p: IconProps) => (
  <Icon {...p}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></Icon>
);
export const IconScale = (p: IconProps) => (
  <Icon {...p}><path d="M12 3v18M6 21h12" /><path d="m3 9 3-5 3 5a3 3 0 0 1-6 0Z" /><path d="m15 9 3-5 3 5a3 3 0 0 1-6 0Z" /></Icon>
);
export const IconZap = (p: IconProps) => (
  <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></Icon>
);
export const IconUsers = (p: IconProps) => (
  <Icon {...p}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" /><path d="M18 20a6.4 6.4 0 0 0-2-4.6" /></Icon>
);
export const IconBell = (p: IconProps) => (
  <Icon {...p}><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></Icon>
);
export const IconHistory = (p: IconProps) => (
  <Icon {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4.5l3 1.8" /></Icon>
);
export const IconSettings = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.6 4.4a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7 2 2 0 1 1 0 4 1.6 1.6 0 0 0-1.1 1.1" /></Icon>
);
export const IconPlus = (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const IconMenu = (p: IconProps) => <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>;
export const IconSearch = (p: IconProps) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>
);
export const IconBack = (p: IconProps) => <Icon {...p}><path d="M15 5l-7 7 7 7" /></Icon>;
export const IconClose = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const IconFilter = (p: IconProps) => <Icon {...p}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></Icon>;
export const IconMore = (p: IconProps) => (
  <Icon {...p}><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></Icon>
);
export const IconCheck = (p: IconProps) => <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7" /></Icon>;
export const IconAlert = (p: IconProps) => (
  <Icon {...p}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></Icon>
);
export const IconInfo = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>
);
export const IconArrowRight = (p: IconProps) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const IconArrowUp = (p: IconProps) => <Icon {...p}><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></Icon>;
export const IconArrowDown = (p: IconProps) => <Icon {...p}><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></Icon>;
export const IconShield = (p: IconProps) => (
  <Icon {...p}><path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></Icon>
);
export const IconDatabase = (p: IconProps) => (
  <Icon {...p}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></Icon>
);
export const IconActivity = (p: IconProps) => <Icon {...p}><path d="M3 12h4l3-8 4 16 3-8h4" /></Icon>;
export const IconBackspace = (p: IconProps) => (
  <Icon {...p}><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" /><path d="m18 9-6 6M12 9l6 6" /></Icon>
);
export const IconSun = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
);
export const IconMoon = (p: IconProps) => (
  <Icon {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></Icon>
);
export const IconLogout = (p: IconProps) => (
  <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icon>
);
export const IconGoogle = ({ size = 17, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z" />
    <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.4 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 21.4 7.6 24 12 24z" />
    <path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3z" />
    <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.6 0 3.7 2.6 1.8 6.1l3.8 3C6.5 6.7 9 4.8 12 4.8z" />
  </svg>
);

/** Maps a stored icon name to a component, for user-chosen category icons. */
export const ICON_MAP = {
  home: IconHome, list: IconList, wallet: IconWallet, calendar: IconCalendar,
  target: IconTarget, flag: IconFlag, receipt: IconReceipt, repeat: IconRepeat,
  rotate: IconRotate, "trending-down": IconTrendDown, handshake: IconHandshake,
  chart: IconChart, file: IconFile, sparkle: IconSparkle, tag: IconTag,
  store: IconStore, camera: IconCamera, upload: IconUpload, scale: IconScale,
  zap: IconZap, users: IconUsers, bell: IconBell, history: IconHistory,
  settings: IconSettings, shield: IconShield, activity: IconActivity,
  car: IconRotate, plane: IconArrowUp,
} as const;

export type IconName = keyof typeof ICON_MAP;

export function CategoryIcon({ name, size = 16 }: { name?: string | null; size?: number }) {
  const Component = ICON_MAP[(name ?? "tag") as IconName] ?? IconTag;
  return <Component size={size} />;
}
