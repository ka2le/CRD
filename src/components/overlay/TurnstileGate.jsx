import { useEffect, useRef } from 'react'

export default function TurnstileGate({ siteKey, onToken }) {
  const ref = useRef(null)
  useEffect(() => {
    let cancelled = false
    let widget
    let script = document.querySelector('script[data-crd-turnstile]')
    const mount = () => {
      if (cancelled || !window.turnstile || !ref.current) return
      widget = window.turnstile.render(ref.current, { sitekey: siteKey, action: 'room-entry', theme: 'dark',
        callback: onToken, 'expired-callback': () => onToken(''), 'error-callback': () => onToken('') })
    }
    if (window.turnstile) mount()
    else {
      if (!script) {
        script = document.createElement('script')
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.dataset.crdTurnstile = 'true'
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', mount)
    }
    return () => { cancelled = true; script?.removeEventListener('load', mount); if (widget !== undefined) window.turnstile?.remove(widget) }
  }, [siteKey, onToken])
  return <div ref={ref} />
}
