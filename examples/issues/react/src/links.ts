import { Option } from 'effect'

/**
 * The path a link opens inside the tracker, with its query, when it points
 * at this site: `/issues/1358` for a chip of #1358. A link to another site,
 * such as his words on words.pisspoursoftware.xyz, opens in the browser
 * instead. Opening inside the app keeps the loaded Issues, which a reload
 * would read again.
 */
export const inAppPath = (
  href: string,
  origin: string,
): Option.Option<string> =>
  Option.flatMap(
    Option.liftThrowable((value: string) => new URL(value, origin))(href),
    url =>
      url.origin === origin
        ? Option.some(`${url.pathname}${url.search}`)
        : Option.none(),
  )
