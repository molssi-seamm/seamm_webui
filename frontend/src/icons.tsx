// Small, dependency-free inline SVG icons -- hand-rolled rather than
// pulling in an icon library for a dozen glyphs, matching this project's
// existing bundle-size discipline (see ResizableSplit.tsx). All 24x24,
// stroke-based, currentColor -- inherit color/size from CSS.

type IconProps = { className?: string }

export function JobsIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
    </svg>
  )
}

export function ProjectsIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a1 1 0 0 1 1-1h4.5l2 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
    </svg>
  )
}

export function SubmitIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="19" x2="12" y2="6" />
      <polyline points="6,11 12,5 18,11" />
      <line x1="5" y1="20" x2="19" y2="20" />
    </svg>
  )
}

export function AdminIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3.5 5 6.3v5.4c0 4.6 3 8.7 7 9.8 4-1.1 7-5.2 7-9.8V6.3l-7-2.8Z" />
      <path d="M9 12.2l2.1 2.1L15.2 10" />
    </svg>
  )
}

export function FilterIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="4,4 20,4 14,12.5 14,18 10,20 10,12.5" />
    </svg>
  )
}

export function UserIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </svg>
  )
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 19H5.5A1.5 1.5 0 0 1 4 17.5v-11A1.5 1.5 0 0 1 5.5 5H10" />
      <polyline points="15,16 19,12 15,8" />
      <line x1="19" y1="12" x2="9" y2="12" />
    </svg>
  )
}

// `collapsed` flips the chevron direction: pointing right invites
// expanding, pointing left invites collapsing.
export function CollapseIcon({ className, collapsed }: IconProps & { collapsed: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: collapsed ? 'rotate(180deg)' : undefined }}
    >
      <polyline points="15,5 8,12 15,19" />
    </svg>
  )
}

// A classic media-player transport control set, all filled triangles (same
// visual language) so First/Previous/Next/Last read as one matched group:
// Prev/Next are a single triangle (step one page); First/Last add a bar
// (jump to the end), the standard "skip to start/end" glyph.
export function PrevIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="16,5 16,19 6,12" />
    </svg>
  )
}

export function NextIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="8,5 8,19 18,12" />
    </svg>
  )
}

export function SkipToStartIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="4" y="5" width="2.2" height="14" />
      <polygon points="19,5 19,19 8,12" />
    </svg>
  )
}

export function SkipToEndIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="17.8" y="5" width="2.2" height="14" />
      <polygon points="5,5 5,19 16,12" />
    </svg>
  )
}
