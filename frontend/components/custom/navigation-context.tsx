"use client"

import { createContext, useContext } from "react"

interface NavigationContextValue {
  setIsNavigating: (v: boolean) => void
}

export const NavigationContext = createContext<NavigationContextValue>({
  setIsNavigating: () => {},
})

export function useNavigation() {
  return useContext(NavigationContext)
}
