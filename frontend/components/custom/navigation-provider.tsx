"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"
import { NavigationContext } from "./navigation-context"

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [isNavigating, setIsNavigating] = React.useState(false)
  const [showLoader, setShowLoader] = React.useState(false)
  const pathname = usePathname()
  const timerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useEffect(() => {
    setIsNavigating(false)
    setShowLoader(false)
    clearTimeout(timerRef.current)
  }, [pathname])

  React.useEffect(() => {
    if (isNavigating) {
      timerRef.current = setTimeout(() => setShowLoader(true), 500)
    }
    return () => clearTimeout(timerRef.current)
  }, [isNavigating])

  return (
    <NavigationContext value={{ setIsNavigating }}>
      <div
        className={cn(
          "transition-all duration-300",
          showLoader && "pointer-events-none blur-sm opacity-60"
        )}
      >
        {children}
      </div>
      {showLoader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <Spinner className="size-8" />
        </div>
      )}
    </NavigationContext>
  )
}
