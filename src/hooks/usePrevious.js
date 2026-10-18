import { useEffect, useRef } from 'react'

export default function usePrevious(value) {
  const ref = useRef(value)

  useEffect(() => {
    ref.current = value
  }, [value])

  // eslint-disable-next-line react-hooks/refs
  return ref.current
}
