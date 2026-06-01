"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useNavigation } from "./navigation-context"

type AppLinkProps = React.ComponentProps<typeof Link>

export function AppLink({ onClick, ...props }: AppLinkProps) {
  const { setIsNavigating } = useNavigation()
  const pathname = usePathname()
  const href = typeof props.href === "string" ? props.href : props.href.pathname ?? ""
  const isCurrentPage = href === pathname

  return (
    <Link
      {...props}
      onClick={(e) => {
        if (!isCurrentPage) setIsNavigating(true)
        onClick?.(e)
      }}
    />
  )
}
