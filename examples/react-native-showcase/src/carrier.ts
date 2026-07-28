/** Extracts the portable Program path from a web, custom-scheme, or Expo Go carrier. */
export const portablePathFromCarrier = (carrier: string): string => {
  const parsed = new URL(carrier)
  if (parsed.pathname === '/--') {
    return `/${parsed.search}`
  } else if (parsed.pathname.startsWith('/--/')) {
    return `${parsed.pathname.slice(3)}${parsed.search}`
  } else {
    return `${parsed.pathname}${parsed.search}`
  }
}

/** Removes the leading slash expected by Program routers before Expo creates a carrier. */
export const expoLinkingPath = (portablePath: string): string =>
  portablePath.startsWith('/') ? portablePath.slice(1) : portablePath
