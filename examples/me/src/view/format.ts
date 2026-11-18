// CONSTANT

const TIME_ZONE = 'America/New_York'

// FORMAT

/** An ISO time as it is read in New York: `Nov 5, 11:31 AM`. */
export const formatDate = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  } else {
    return date.toLocaleString('en-US', {
      timeZone: TIME_ZONE,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
}
