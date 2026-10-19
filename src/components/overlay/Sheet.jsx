import { useEffect } from 'react'
import './Sheet.css'
import { SvgIcon } from '../ui/GameIcon'

// Bottom sheet used for browsing piles, picking a recycled card and help.
export default function Sheet({ open, onClose, title = null, accent = null, children, className = '' }) {
  useEffect(() => {
    if (!open || !onClose) return undefined
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sheet" onClick={onClose ?? undefined}>
      <div
        className={['sheet__panel', className].filter(Boolean).join(' ')}
        style={accent ? { '--sheet-accent': accent } : undefined}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="sheet__header">
          <span className="sheet__grip" aria-hidden="true" />
          {title ? <div className="sheet__title">{title}</div> : <span />}
          {onClose ? (
            <button type="button" className="ui-button ui-button--icon sheet__close" onClick={onClose} aria-label="Close">
              <SvgIcon name="close" />
            </button>
          ) : null}
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  )
}
