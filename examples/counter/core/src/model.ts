import { Effect, Option, Schema as S } from 'effect'
import { Device } from 'foldkit/renderers/devices'

// MODEL

/** The canonical initial count shared by Counter hosts. */
export const initialCount = 0

/** Portable URI for this Program's home destination. */
export const uri = '/counter'

/** Product identity title printed by `show` IDENTITY. Not host chrome. */
export const title = 'counter'

/**
 * Product identity sentence. Host chrome looks up `hostSurfaces`, not this.
 * `show` IDENTITY prints the CLI host description from core.
 */
export const description =
  'all business logic and sync logic are written in Foldkit; consumed and rendered by CLI.'

const noneDevice = Effect.succeed(Option.none<Device>())
const nonePath = Effect.succeed(Option.none<string>())
const noneShare = Effect.succeed(Option.none<string>())

/**
 * The Counter Model: the count plus occupiable navigation.
 *
 * `maybeDevice` and `maybePath` are occupancy, not paint-only flags.
 * `show --device phone` and `show --path /counter` write these fields so
 * Instant peers paint the same chrome. `show --path counter.increment`
 * occupies `/counter/increment`. Bare show (no `--path`) stays none.
 * `share --name kitchen --with bob` occupies `/counter/kitchen` and
 * stores ACL on `maybeOwner` / `maybeGranted`. That is not L6
 * `--audience mine`.
 */
export const Model = S.Struct({
  count: S.Number,
  maybeDevice: S.Option(Device).pipe(
    S.withDecodingDefaultKey(noneDevice),
    S.withConstructorDefault(noneDevice),
  ),
  maybePath: S.Option(S.String).pipe(
    S.withDecodingDefaultKey(nonePath),
    S.withConstructorDefault(nonePath),
  ),
  maybeShareName: S.Option(S.String).pipe(
    S.withDecodingDefaultKey(noneShare),
    S.withConstructorDefault(noneShare),
  ),
  maybeOwner: S.Option(S.String).pipe(
    S.withDecodingDefaultKey(noneShare),
    S.withConstructorDefault(noneShare),
  ),
  maybeGranted: S.Option(S.String).pipe(
    S.withDecodingDefaultKey(noneShare),
    S.withConstructorDefault(noneShare),
  ),
})
/** A Counter Model value. */
export type Model = typeof Model.Type
