import { Array, Option, Schema as S, String as Str } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

// ADT

/** Owner of settings. Always included on Restricted settings. */
export const ownerEmail = 'halfjew22@gmail.com'

/** Host that stays Restricted to the owner. Never Public. Never Bypass. */
export const settingsHostName = 'settings.knophy.com'

/** Visibility Public. Anyone may open the host. */
export const Public = ts('Public')
/** Visibility Restricted to these emails. */
export const Restricted = ts('Restricted', {
  emails: S.NonEmptyArray(NonEmptyString),
})
/** Host visibility. Public and Restricted are exclusive. */
export const Visibility = S.Union([Public, Restricted])
/** Host visibility. */
export type Visibility = typeof Visibility.Type

/** No apply in flight. */
export const ApplyIdle = ts('Idle')
/** Access write is in flight. */
export const Applying = ts('Applying')
/** Last Access write succeeded. */
export const Applied = ts('Applied')
/** Last Access write failed. */
export const ApplyFailed = ts('Failed', { reason: NonEmptyString })
/** Apply of a visibility change. */
export const Apply = S.Union([ApplyIdle, Applying, Applied, ApplyFailed])
/** Apply of a visibility change. */
export type Apply = typeof Apply.Type

/** Access token is present on the origin. Never painted as the secret. */
export const TokenReady = ts('Ready')
/** Access token is missing on the origin. */
export const MissingToken = ts('MissingToken')
/** Origin token status. Ready and Missing are exclusive. */
export const Token = S.Union([TokenReady, MissingToken])
/** Origin token status. */
export type Token = typeof Token.Type

/** One Caddy host. */
export const Host = ts('Host', {
  name: NonEmptyString,
  visibility: Visibility,
})
/** One Caddy host. */
export type Host = typeof Host.Type

/** Hosts have not been read. */
export const HostsEmpty = ts('Empty')
/** Hosts from Caddyfile plus Access. */
export const HostsPopulated = ts('Populated', {
  items: S.NonEmptyArray(Host),
})
/** Host list. */
export const Hosts = S.Union([HostsEmpty, HostsPopulated])
/** Host list. */
export type Hosts = typeof Hosts.Type

/** No email draft. */
export const DraftIdle = ts('Idle')
/** Typing an email for a Restricted host. */
export const Drafting = ts('Drafting', {
  host: NonEmptyString,
  text: S.String,
})
/** Email draft. */
export const Draft = S.Union([DraftIdle, Drafting])
/** Email draft. */
export type Draft = typeof Draft.Type

/** No notice. */
export const NoticeNone = ts('None')
/** A notice. */
export const NoticeSome = ts('Some', { text: NonEmptyString })
/** Transient notice. */
export const Notice = S.Union([NoticeNone, NoticeSome])
/** Transient notice. */
export type Notice = typeof Notice.Type

/** Origin could not be reached. */
export const Unreachable = ts('Unreachable')
/** Origin response was not a tagged Snapshot. */
export const Invalid = ts('Invalid')
/** Apply was refused. settings stays Restricted. */
export const Refused = ts('Refused')
/** Why a Settings origin call failed. */
export const OriginFailure = S.Union([Unreachable, Invalid, Refused])
/** Why a Settings origin call failed. */
export type OriginFailure = typeof OriginFailure.Type

/** Loaded hosts and token status. Token secret is never in this snapshot. */
export const Snapshot = ts('Snapshot', {
  token: Token,
  hosts: S.Array(Host),
})
/** Loaded hosts and token status. */
export type Snapshot = typeof Snapshot.Type

/** Origin read failed. */
export const OriginFailed = ts('Failed', { reason: OriginFailure })
/** Origin result a capability may return. */
export const OriginReport = S.Union([Snapshot, OriginFailed])
/** Origin result a capability may return. */
export type OriginReport = typeof OriginReport.Type

/** The Settings Model. */
export const Model = S.Struct({
  token: Token,
  apply: Apply,
  hosts: Hosts,
  draft: Draft,
  notice: Notice,
})
/** The Settings Model. */
export type Model = typeof Model.Type

/** Product identity title printed by hosts that need a document title. */
export const title = 'Settings'

/** Default Restricted emails. Includes the owner. */
export const defaultRestrictedEmails = (): readonly [
  typeof NonEmptyString.Type,
] => [NonEmptyString.make(ownerEmail)]

/** Default Restricted visibility. */
export const defaultRestricted = (): typeof Restricted.Type =>
  Restricted.make({ emails: defaultRestrictedEmails() })

/** Empty start. Screen still paints Settings. Init then loads Access. */
export const emptyModel = (): Model =>
  Model.make({
    token: MissingToken(),
    apply: ApplyIdle(),
    hosts: HostsEmpty(),
    draft: DraftIdle(),
    notice: NoticeNone(),
  })

/** Model used while the first origin read is in flight. */
export const loadingModel = (): Model =>
  Model.make({
    token: MissingToken(),
    apply: Applying(),
    hosts: HostsEmpty(),
    draft: DraftIdle(),
    notice: NoticeNone(),
  })

/** Sample snapshot: ingest and counter Public, settings Restricted. */
export const sampleHosts = (): ReadonlyArray<Host> => [
  Host.make({
    name: NonEmptyString.make('ingest.knophy.com'),
    visibility: Public(),
  }),
  Host.make({
    name: NonEmptyString.make('counter.knophy.com'),
    visibility: Public(),
  }),
  Host.make({
    name: NonEmptyString.make('casino.knophy.com'),
    visibility: defaultRestricted(),
  }),
  Host.make({
    name: NonEmptyString.make(settingsHostName),
    visibility: defaultRestricted(),
  }),
]

/** Sample Snapshot inhabited by the test origin. */
export const sampleSnapshot = Snapshot.make({
  token: TokenReady(),
  hosts: sampleHosts(),
})

/** Model whose origin is the sample Snapshot. */
export const loadedModel = (): Model => {
  const items = sampleHosts()
  const first = items[0]
  if (first === undefined) {
    return emptyModel()
  }
  return Model.make({
    token: TokenReady(),
    apply: ApplyIdle(),
    hosts: HostsPopulated.make({
      items: [first, ...items.slice(1)],
    }),
    draft: DraftIdle(),
    notice: NoticeNone(),
  })
}

/** Clears a notice. */
export const withoutNotice = (model: Model): Model =>
  Model.make({
    ...model,
    notice: NoticeNone(),
  })

/** Sets a notice. */
export const withNotice = (model: Model, text: string): Model =>
  Model.make({
    ...model,
    notice: NoticeSome.make({ text: NonEmptyString.make(text) }),
  })

/** Replaces hosts from a snapshot. */
export const withSnapshot = (model: Model, snapshot: Snapshot): Model => {
  const first = snapshot.hosts[0]
  if (first === undefined) {
    return Model.make({
      ...model,
      token: snapshot.token,
      hosts: HostsEmpty(),
    })
  }
  return Model.make({
    ...model,
    token: snapshot.token,
    hosts: HostsPopulated.make({ items: [first, ...snapshot.hosts.slice(1)] }),
  })
}

/** Finds a host by name. */
export const findHost = (hosts: Hosts, name: string): Option.Option<Host> => {
  if (hosts._tag === 'Empty') {
    return Option.none()
  }
  return Array.findFirst(hosts.items, item => item.name === name)
}

/** Draft text is a usable email. */
export const hasDraftEmail = (draft: Draft): boolean =>
  draft._tag === 'Drafting' &&
  draft.text.includes('@') &&
  !Str.isEmpty(draft.text.trim())

/** Whether this host is the settings host. */
export const isSettingsHost = (name: string): boolean =>
  name === settingsHostName

/** Emails of a Restricted visibility. */
export const emailsOf = (
  visibility: Visibility,
): ReadonlyArray<typeof NonEmptyString.Type> => {
  if (visibility._tag === 'Public') {
    return []
  }
  return visibility.emails
}

/** Restricted emails are only the default wildcard user. */
export const isDefaultRestrictedEmails = (
  emails: ReadonlyArray<string>,
): boolean => emails.length === 1 && emails[0] === ownerEmail

/** Empty start. Alias used by screen-only clients. */
export const unreadModel = emptyModel()
/** Loading start. Alias used by screen-only clients. */
export const readingModel = loadingModel()
/** Sample loaded hosts. Alias used by screen-only clients. */
export const readModel = loadedModel()
