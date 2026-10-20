import { useEffect } from 'react'
import './Sheet.css'
import { SvgIcon } from '../ui/GameIcon'

// Sheet used for browsing piles, picking a recycled card and help.
// Every popup drops from the top edge (centred horizontally) and may use the
// full height; placement="bottom" keeps the old bottom-sheet behaviour.
export default function Sheet({ open, onClose, title = null, accent = null, children, className = '', placement = 'top' }) {
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
    <div className={['sheet', placement === 'top' ? 'sheet--top' : ''].filter(Boolean).join(' ')} onClick={onClose ?? undefined}>
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
