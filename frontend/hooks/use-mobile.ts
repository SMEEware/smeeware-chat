import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

const DESKTOP_QUERY = `(min-width: ${MOBILE_BREAKPOINT}px)`

function subscribeDesktop(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * true ab der Desktop-Breite. Anders als ``useIsMobile`` kennt der Server
 * hier bewusst nur ``false``: wer etwas erst ab Desktop anstossen will (eine
 * Anfrage, ein teures Rendern), startet so nie auf dem Handy, nur weil der
 * erste Render die Breite noch nicht kannte.
 */
export function useIsDesktop() {
  return React.useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  )
}
