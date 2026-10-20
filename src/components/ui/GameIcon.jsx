import { getIconUrl } from './iconSources'

// Tintable silhouette icon: colour follows `color` / currentColor.
export function GameIcon({ name, className = '', style, title }) {
  const url = getIconUrl(name)
  if (!url) return null

  return (
    <span
      className={['g-icon', className].filter(Boolean).join(' ')}
      style={{ '--icon': `url("${url}")`, ...style }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    />
  )
}

const SVG_PATHS = {
  online: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M5 6.5h14M5 17.5h14" />
    </g>
  ),
  invite: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9.5" cy="8" r="3.6" />
      <path d="M3 19.5c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2M18.5 8v6M15.5 11h6" />
    </g>
  ),
  link: (
    <g fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </g>
  ),
  edit: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </g>
  ),
  share: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5" />
      <path d="M5 12v7.5h14V12" />
    </g>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="2.4" strokeLinecap="round" fill="none" stroke="currentColor" />,
  close: <path d="M6 6l12 12M18 6L6 18" strokeWidth="2.6" strokeLinecap="round" fill="none" stroke="currentColor" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor" />,
  skip: (
    <g fill="currentColor">
      <path d="M4 5.5v13l8.5-6.5z" />
      <path d="M12 5.5v13l8.5-6.5z" />
      <rect x="19.6" y="5.5" width="2.4" height="13" rx="1" />
    </g>
  ),
  play: <path d="M7 5v14l12-7z" fill="currentColor" />,
  replay: (
    <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4" />
      <path d="M4 4.5v4.5h4.5" />
    </g>
  ),
  eye: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </g>
  ),
  help: (
    <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M9 9.2a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.8v.7" />
      <circle cx="12" cy="18" r="0.6" fill="currentColor" />
    </g>
  ),
  swords: (
    <g fill="currentColor">
      <path d="M3.2 2.5l7.6 7.6-1.5 1.5L1.7 4 1.5 2.3z" />
      <path d="M20.8 2.5l-7.6 7.6 1.5 1.5L22.3 4l.2-1.7z" />
      <path d="M9 12.6l2.4 2.4-4.7 4.7 1 1-1.5 1.5-1.3-1.8-1.9-.6L4.5 18.4l1 1z" />
      <path d="M15 12.6L12.6 15l4.7 4.7-1 1 1.5 1.5 1.3-1.8 1.9-.6 1.5-1.4-1 1z" />
      <path d="M3.5 17.2l3.3 3.3-1 1-3.3-3.3zM20.5 17.2l-3.3 3.3 1 1 3.3-3.3z" />
    </g>
  ),
  trash: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l1 12.5h9l1-12.5" />
    </g>
  ),
  collection: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
    </g>
  ),
  flask: (
    <g fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 3.5h5M10.5 3.5v5.2L4.8 18.2a1.6 1.6 0 0 0 1.4 2.3h11.6a1.6 1.6 0 0 0 1.4-2.3L13.5 8.7V3.5" />
      <path d="M7.6 14.5h8.8" />
    </g>
  ),
  top: (
    <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4.5h14M12 20V9M7 13.5l5-5 5 5" />
    </g>
  ),
  fullscreen: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </g>
  ),
}

export function SvgIcon({ name, className = '', title }) {
  const content = SVG_PATHS[name]
  if (!content) return null

  return (
    <svg
      viewBox="0 0 24 24"
      className={['svg-icon', className].filter(Boolean).join(' ')}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {content}
    </svg>
  )
}
