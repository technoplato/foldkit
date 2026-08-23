import { Array, Option } from 'effect'
import { NonEmptyString } from 'foldkit/adt'

import {
  Host,
  Public,
  Restricted,
  type Visibility,
  defaultRestricted,
  isSettingsHost,
  ownerEmail,
  settingsHostName,
} from './model.js'

/** One Access application as the origin reports it. Secret is never here. */
export type AccessApp = Readonly<{
  id: string
  name: string
  domain: string
  kind: 'Bypass' | 'Allow' | 'Other'
  emails: ReadonlyArray<string>
}>

/** Hosts from a Caddyfile. Skips the catch-all empty host. */
export const parseCaddyHosts = (caddyfile: string): ReadonlyArray<string> => {
  const hosts: string[] = []
  const seen = new Set<string>()
  for (const match of caddyfile.matchAll(/^http:\/\/([^\s{]+)\s*\{/gm)) {
    const host = match[1]?.trim() ?? ''
    if (host.length === 0 || seen.has(host)) {
      continue
    }
    seen.add(host)
    hosts.push(host)
  }
  if (!seen.has(settingsHostName)) {
    hosts.push(settingsHostName)
  }
  return hosts
}

const oneLabelWildcard = (domain: string): string | undefined => {
  if (!domain.startsWith('*.')) {
    return undefined
  }
  return domain.slice(2)
}

/** Whether an Access domain covers a Caddy host. */
export const appCoversHost = (appDomain: string, host: string): boolean => {
  if (appDomain === host) {
    return true
  }
  const suffix = oneLabelWildcard(appDomain)
  if (suffix === undefined) {
    return false
  }
  if (!host.endsWith(`.${suffix}`)) {
    return false
  }
  const prefix = host.slice(0, host.length - suffix.length - 1)
  return prefix.length > 0 && !prefix.includes('.')
}

const isRootWildcard = (domain: string): boolean => domain === '*.knophy.com'

const specificity = (domain: string): number => {
  if (!domain.startsWith('*.')) {
    return 100 + domain.length
  }
  return domain.length
}

/** Most specific Access app that covers a host. Root wildcard is fallback only. */
export const coveringApp = (
  host: string,
  apps: ReadonlyArray<AccessApp>,
): AccessApp | undefined => {
  const matches = apps.filter(
    app => appCoversHost(app.domain, host) && !isRootWildcard(app.domain),
  )
  const first = matches[0]
  if (first === undefined) {
    return undefined
  }
  return Array.reduce(matches, first, (best, app) =>
    specificity(app.domain) > specificity(best.domain) ? app : best,
  )
}

/** Visibility for one Caddy host from current Access apps. */
export const visibilityForHost = (
  host: string,
  apps: ReadonlyArray<AccessApp>,
): Visibility => {
  if (isSettingsHost(host)) {
    const exact = apps.find(app => app.domain === host)
    if (
      exact !== undefined &&
      exact.kind === 'Allow' &&
      exact.emails.length > 0
    ) {
      return Restricted.make({
        emails: [
          NonEmptyString.make(exact.emails[0] ?? ownerEmail),
          ...exact.emails.slice(1).map(email => NonEmptyString.make(email)),
        ],
      })
    }
    return defaultRestricted()
  }
  const app = coveringApp(host, apps)
  if (app === undefined) {
    return defaultRestricted()
  }
  if (app.kind === 'Bypass') {
    return Public()
  }
  if (app.kind === 'Allow' && app.emails.length > 0) {
    return Restricted.make({
      emails: [
        NonEmptyString.make(app.emails[0] ?? ownerEmail),
        ...app.emails.slice(1).map(email => NonEmptyString.make(email)),
      ],
    })
  }
  return defaultRestricted()
}

/** Hosts painted after loading Caddyfile + Access apps. */
export const hostsFromAccess = (
  caddyHosts: ReadonlyArray<string>,
  apps: ReadonlyArray<AccessApp>,
): ReadonlyArray<Host> =>
  Array.map(caddyHosts, name =>
    Host.make({
      name: NonEmptyString.make(name),
      visibility: visibilityForHost(name, apps),
    }),
  )

/** Plan for applying visibility. Origin executes it. Never Bypass settings. */
export type ApplyPlan =
  | Readonly<{ _tag: 'RefusePublicSettings' }>
  | Readonly<{ _tag: 'Noop' }>
  | Readonly<{ _tag: 'CreateBypass'; domain: string }>
  | Readonly<{ _tag: 'DeleteBypass'; domain: string }>
  | Readonly<{
      _tag: 'UpsertAllow'
      domain: string
      emails: ReadonlyArray<string>
    }>

const onlyDefaultOwner = (emails: ReadonlyArray<string>): boolean =>
  emails.length === 1 && emails[0] === ownerEmail

/** Decide how to apply visibility. settings never gets a Bypass plan. */
export const planApply = (
  host: string,
  visibility: Visibility,
  apps: ReadonlyArray<AccessApp>,
): ApplyPlan => {
  if (isSettingsHost(host)) {
    if (visibility._tag === 'Public') {
      return { _tag: 'RefusePublicSettings' }
    }
    const emails = visibility.emails
    if (emails.includes(ownerEmail) === false) {
      return {
        _tag: 'UpsertAllow',
        domain: host,
        emails: [ownerEmail, ...emails],
      }
    }
    return { _tag: 'UpsertAllow', domain: host, emails }
  }
  if (visibility._tag === 'Public') {
    const current = visibilityForHost(host, apps)
    if (current._tag === 'Public') {
      return { _tag: 'Noop' }
    }
    return { _tag: 'CreateBypass', domain: host }
  }
  const emails = visibility.emails
  const covering = coveringApp(host, apps)
  const exactBypass = apps.find(
    app => app.domain === host && app.kind === 'Bypass',
  )
  const parentBypass = apps.find(
    app =>
      app.kind === 'Bypass' &&
      app.domain !== host &&
      appCoversHost(app.domain, host),
  )
  if (onlyDefaultOwner(emails) && parentBypass === undefined) {
    if (exactBypass !== undefined) {
      return { _tag: 'DeleteBypass', domain: host }
    }
    if (covering === undefined || covering.kind !== 'Allow') {
      return { _tag: 'Noop' }
    }
    return { _tag: 'DeleteBypass', domain: host }
  }
  return { _tag: 'UpsertAllow', domain: host, emails }
}

export { Option }
