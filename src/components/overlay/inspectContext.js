import { createContext, useContext } from 'react'

export const InspectContext = createContext(null)

export function useCardInspect() {
  return useContext(InspectContext)
}
