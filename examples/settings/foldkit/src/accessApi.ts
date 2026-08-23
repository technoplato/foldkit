import { NonEmptyString } from 'foldkit/adt'
import { readFileSync } from 'node:fs'

import {
  type AccessApp,
  hostsFromAccess,
  parseCaddyHosts,
  planApply,
} from '../../core/src/access.js'
import {
  MissingToken,
  Public,
  Restricted,
  TokenReady,
  type Visibility,
  isSettingsHost,
  ownerEmail,
  settingsHostName,
} from '../../core/src/model.js'

const accountId = 'd6f9ebd4f56b194ca634d758929cde28'
const caddyPath = '/Users/laptop/.config/knophy-host/Caddyfile'
const tokenPath = '/Users/laptop/.config/knophy-host/access.env'

const protectedAppIds = new Set([
  '5f089ff0-560d-4a92-81ba-932e57ead142',
  '41fd510a-2eb0-4412-a5b4-d3b7867d4b23',
  'eb37dfdf-8621-4dfb-b545-5a0152d4bd3b',
  '9881e580-b3a4-438a-ad20-eac8bed6890b',
])

export type SettingsPayload = Readonly<{
  token: ReturnType<typeof TokenReady> | ReturnType<typeof MissingToken>
  hosts: ReturnType<typeof hostsFromAccess>
}>

const readToken = (): string | undefined => {
  try {
    const text = readFileSync(tokenPath, 'utf8')
    for (const line of text.split('\n')) {
      if (line.startsWith('CLOUDFLARE_API_TOKEN=')) {
        const value = line.slice('CLOUDFLARE_API_TOKEN='.length).trim()
        return value.length > 0 ? value : undefined
      }
    }
    const fromEnv = process.env.CLOUDFLARE_API_TOKEN
    return fromEnv && fromEnv.length > 0 ? fromEnv : undefined
  } catch {
    const fromEnv = process.env.CLOUDFLARE_API_TOKEN
    return fromEnv && fromEnv.length > 0 ? fromEnv : undefined
  }
}

const readCaddyfile = (): string => {
  try {
    return readFileSync(caddyPath, 'utf8')
  } catch {
    return ''
  }
}

const cf = async (
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await response.json()
  return { status: response.status, json }
}

const emailsFromPolicies = (policies: unknown): string[] => {
  if (!Array.isArray(policies)) {
    return []
  }
  const emails: string[] = []
  for (const policy of policies) {
    if (typeof policy !== 'object' || policy === null) {
      continue
    }
    const include = (policy as { include?: unknown }).include
    if (!Array.isArray(include)) {
      continue
    }
    for (const rule of include) {
      if (typeof rule !== 'object' || rule === null) {
        continue
      }
      const email = (rule as { email?: { email?: string } }).email?.email
      if (typeof email === 'string') {
        emails.push(email)
      }
    }
  }
  return emails
}

const kindFromPolicies = (policies: unknown): AccessApp['kind'] => {
  if (!Array.isArray(policies) || policies.length === 0) {
    return 'Other'
  }
  const decisions = policies.map(policy =>
    typeof policy === 'object' && policy !== null
      ? (policy as { decision?: string }).decision
      : undefined,
  )
  if (decisions.every(decision => decision === 'bypass')) {
    const everyone = policies.some(policy => {
      const include = (policy as { include?: unknown[] }).include
      return (
        Array.isArray(include) &&
        include.some(rule => 'everyone' in (rule ?? {}))
      )
    })
    if (everyone) {
      return 'Bypass'
    }
  }
  if (decisions.some(decision => decision === 'allow')) {
    return 'Allow'
  }
  return 'Other'
}

const listApps = async (token: string): Promise<AccessApp[]> => {
  const listed = await cf(
    token,
    'GET',
    `/accounts/${accountId}/access/apps?per_page=100`,
  )
  const result = (listed.json as { result?: unknown[] }).result
  if (!Array.isArray(result)) {
    return []
  }
  const apps: AccessApp[] = []
  for (const raw of result) {
    if (typeof raw !== 'object' || raw === null) {
      continue
    }
    const app = raw as {
      id?: string
      name?: string
      domain?: string
      type?: string
    }
    if (typeof app.id !== 'string' || typeof app.domain !== 'string') {
      continue
    }
    const detail = await cf(
      token,
      'GET',
      `/accounts/${accountId}/access/apps/${app.id}`,
    )
    const policies = (detail.json as { result?: { policies?: unknown } }).result
      ?.policies
    apps.push({
      id: app.id,
      name: app.name ?? app.domain,
      domain: app.domain,
      kind: kindFromPolicies(policies),
      emails: emailsFromPolicies(policies),
    })
  }
  return apps
}

export const loadSettings = async (): Promise<SettingsPayload> => {
  const token = readToken()
  const caddyHosts = parseCaddyHosts(readCaddyfile())
  if (token === undefined) {
    return {
      token: MissingToken(),
      hosts: hostsFromAccess(caddyHosts, []),
    }
  }
  const apps = await listApps(token)
  return {
    token: TokenReady(),
    hosts: hostsFromAccess(caddyHosts, apps),
  }
}

const decodeVisibility = (value: unknown): Visibility | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const tag = (value as { _tag?: string })._tag
  if (tag === 'Public') {
    return Public()
  }
  if (tag === 'Restricted') {
    const emails = (value as { emails?: unknown }).emails
    if (!Array.isArray(emails) || emails.length === 0) {
      return Restricted.make({
        emails: [NonEmptyString.make(ownerEmail)],
      })
    }
    return Restricted.make({
      emails: [
        NonEmptyString.make(String(emails[0])),
        ...emails.slice(1).map(email => NonEmptyString.make(String(email))),
      ],
    })
  }
  return undefined
}

const createBypass = async (token: string, domain: string): Promise<void> => {
  if (isSettingsHost(domain)) {
    throw new Error('settings never Bypass')
  }
  await cf(token, 'POST', `/accounts/${accountId}/access/apps`, {
    name: `${domain} public`,
    domain,
    type: 'self_hosted',
    session_duration: '24h',
    app_launcher_visible: true,
    destinations: [{ type: 'public', uri: domain }],
    policies: [
      {
        name: 'Public',
        decision: 'bypass',
        include: [{ everyone: {} }],
      },
    ],
  })
}

const deleteExactBypass = async (
  token: string,
  domain: string,
  apps: ReadonlyArray<AccessApp>,
): Promise<void> => {
  const match = apps.find(app => app.domain === domain && app.kind === 'Bypass')
  if (match === undefined) {
    return
  }
  if (protectedAppIds.has(match.id)) {
    return
  }
  await cf(token, 'DELETE', `/accounts/${accountId}/access/apps/${match.id}`)
}

const upsertAllow = async (
  token: string,
  domain: string,
  emails: ReadonlyArray<string>,
  apps: ReadonlyArray<AccessApp>,
): Promise<void> => {
  const include = emails.map(email => ({ email: { email } }))
  const existing = apps.find(
    app =>
      app.domain === domain &&
      app.kind === 'Allow' &&
      !protectedAppIds.has(app.id),
  )
  const policies = [
    {
      name: domain === settingsHostName ? 'Allow Michael' : 'Allow',
      decision: 'allow',
      include,
    },
  ]
  if (existing !== undefined) {
    await cf(
      token,
      'PUT',
      `/accounts/${accountId}/access/apps/${existing.id}`,
      {
        name: existing.name,
        domain,
        type: 'self_hosted',
        session_duration: '24h',
        app_launcher_visible: true,
        destinations: [{ type: 'public', uri: domain }],
        policies,
      },
    )
    return
  }
  await cf(token, 'POST', `/accounts/${accountId}/access/apps`, {
    name: domain,
    domain,
    type: 'self_hosted',
    session_duration: '24h',
    app_launcher_visible: true,
    destinations: [{ type: 'public', uri: domain }],
    policies,
  })
}

export const applySettings = async (
  host: string,
  rawVisibility: unknown,
): Promise<{ status: number; payload: SettingsPayload }> => {
  const visibility = decodeVisibility(rawVisibility)
  if (visibility === undefined) {
    return { status: 400, payload: await loadSettings() }
  }
  const token = readToken()
  if (token === undefined) {
    return { status: 401, payload: await loadSettings() }
  }
  const apps = await listApps(token)
  const plan = planApply(host, visibility, apps)
  if (plan._tag === 'RefusePublicSettings') {
    return { status: 403, payload: await loadSettings() }
  }
  if (plan._tag === 'CreateBypass') {
    await deleteExactBypass(token, plan.domain, apps)
    const refreshed = await listApps(token)
    const already = refreshed.find(
      app => app.domain === plan.domain && app.kind === 'Bypass',
    )
    if (already === undefined) {
      await createBypass(token, plan.domain)
    }
  }
  if (plan._tag === 'DeleteBypass') {
    await deleteExactBypass(token, plan.domain, apps)
  }
  if (plan._tag === 'UpsertAllow') {
    await deleteExactBypass(token, plan.domain, apps)
    const refreshed = await listApps(token)
    await upsertAllow(token, plan.domain, plan.emails, refreshed)
  }
  return { status: 200, payload: await loadSettings() }
}
