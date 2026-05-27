import './InfoOverlay.css'

export default function InfoOverlay({ visible, title = 'Notice', message, buttonLabel = 'OK', onClose }) {
  if (!visible) return null

  return (
    <div className="info-overlay" onClick={onClose}>
      <div className="info-overlay__popup ui-panel" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="info-overlay__actions">
          <button type="button" className="ui-button ui-button--primary" onClick={onClose}>{buttonLabel}</button>
        </div>
      </div>
    </div>
  )
}
