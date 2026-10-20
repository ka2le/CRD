import { useEffect, useRef } from 'react'

export default function TurnstileGate({ siteKey, onToken, onError }) {
  const ref = useRef(null)
  useEffect(() => {
    let cancelled = false
    let widget
    let script = document.querySelector('script[data-crd-turnstile]')
    const failed = () => { script?.remove(); onError('Could not load the bot check. Check your connection and retry.') }
    const mount = () => {
      if (cancelled || !window.turnstile || !ref.current) return
      widget = window.turnstile.render(ref.current, { sitekey: siteKey, action: 'room-entry', theme: 'dark',
        callback: onToken, 'expired-callback': () => onError('The bot check expired. Please retry.'),
        'timeout-callback': () => onError('The bot check timed out. Please retry.'),
        'error-callback': (code) => { onError(code === '110200' ? 'The room service does not allow this website. Open the invitation on the published game site.' : 'Could not verify the bot check. Please retry.'); return true } })
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
      script.addEventListener('error', failed)
    }
    return () => { cancelled = true; script?.removeEventListener('load', mount); script?.removeEventListener('error', failed); if (widget !== undefined) window.turnstile?.remove(widget) }
  }, [siteKey, onToken, onError])
  return <div ref={ref} />
}
