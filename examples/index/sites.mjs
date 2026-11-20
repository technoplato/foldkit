/**
 * Derives every site served on pisspoursoftware.xyz from the files that route and
 * run them: the Caddyfile (~/.config/knophy-router/Caddyfile), the separate
 * tunnels (~/.config/knophy-host/<name>/cloudflared.yml), the demos manifest
 * (examples/demos-launchd/services.json), and the LaunchAgents
 * (~/Library/LaunchAgents). server.mjs serves the result and check.mjs compares
 * the live sites with it.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HOME = os.homedir()
const CADDYFILE_PATH =
  process.env.SITE_INDEX_CADDYFILE ||
  path.join(HOME, '.config/knophy-router/Caddyfile')
const KNOPHY_HOST_DIR =
  process.env.SITE_INDEX_KNOPHY_HOST_DIR ||
  path.join(HOME, '.config/knophy-host')
const DEMOS_SERVICES_PATH =
  process.env.SITE_INDEX_DEMOS_SERVICES ||
  path.resolve(__dirname, '../demos-launchd/services.json')
const LAUNCH_AGENTS_DIR =
  process.env.SITE_INDEX_LAUNCH_AGENTS_DIR ||
  path.join(HOME, 'Library/LaunchAgents')

const MAX_SCRIPT_BYTES = 64 * 1024
const GIT_TIMEOUT_MS = 10 * 1000

function readTextIfExists(filePath, maxBytes = 1024 * 1024) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size > maxBytes) return ''
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

function readSmallScriptIfText(filePath) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_SCRIPT_BYTES) {
      return ''
    }
    const fd = fs.openSync(filePath, 'r')
    const head = Buffer.alloc(Math.min(stat.size, 64))
    fs.readSync(fd, head, 0, head.length, 0)
    fs.closeSync(fd)
    const isBinary = head.includes(0)
    if (isBinary) return ''
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

function readJsonIfExists(filePath) {
  const raw = readTextIfExists(filePath)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

/** Changes whenever one of the files the site list is derived from changes. */
export function routingFilesKey() {
  const watched = [
    CADDYFILE_PATH,
    DEMOS_SERVICES_PATH,
    LAUNCH_AGENTS_DIR,
    ...listDir(LAUNCH_AGENTS_DIR)
      .filter(file => file.endsWith('.plist'))
      .map(file => path.join(LAUNCH_AGENTS_DIR, file)),
    ...listDir(KNOPHY_HOST_DIR).map(name =>
      path.join(KNOPHY_HOST_DIR, name, 'cloudflared.yml'),
    ),
  ]
  return watched
    .map(filePath => {
      try {
        return `${filePath}:${fs.statSync(filePath).mtimeMs}`
      } catch {
        return `${filePath}:missing`
      }
    })
    .join('|')
}

const gitCache = new Map()
function getGitInfo(dir) {
  if (!dir) return null
  if (gitCache.has(dir)) return gitCache.get(dir)
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    }).trim()
    const isUnderHome = root.startsWith(HOME + path.sep)
    if (!root || !isUnderHome) {
      gitCache.set(dir, null)
      return null
    }
    if (gitCache.has(root)) {
      const cached = gitCache.get(root)
      gitCache.set(dir, cached)
      return cached
    }

    let remote = ''
    let remoteName = ''
    for (const name of ['origin', 'work']) {
      try {
        remote = execFileSync('git', ['remote', 'get-url', name], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: GIT_TIMEOUT_MS,
        }).trim()
        if (remote) {
          remoteName = name
          break
        }
      } catch {}
    }

    let repoUrl = null
    const sshMatch = /^git@github\.com:(.+?)(?:\.git)?$/u.exec(remote)
    const httpsMatch = /^https?:\/\/github\.com\/(.+?)(?:\.git)?$/u.exec(remote)
    if (sshMatch) {
      repoUrl = `https://github.com/${sshMatch[1]}`
    } else if (httpsMatch) {
      repoUrl = `https://github.com/${httpsMatch[1]}`
    }

    // NOTE: a link names the checked-out branch only when the remote has that
    // branch. A local-only branch would make a dead link, so it links to main.
    let branch = 'main'
    try {
      const currentBranch = execFileSync('git', ['branch', '--show-current'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: GIT_TIMEOUT_MS,
      }).trim()
      if (currentBranch) {
        execFileSync(
          'git',
          [
            'show-ref',
            '--verify',
            '--quiet',
            `refs/remotes/${remoteName}/${currentBranch}`,
          ],
          { cwd: root, stdio: 'ignore', timeout: GIT_TIMEOUT_MS },
        )
        branch = currentBranch
      }
    } catch {}

    const info = repoUrl ? { root, repoUrl, branch } : null
    gitCache.set(root, info)
    gitCache.set(dir, info)
    return info
  } catch {
    gitCache.set(dir, null)
    return null
  }
}

function githubUrlForDir(dir) {
  const info = getGitInfo(dir)
  if (!info) return null
  const rel = path.relative(info.root, dir).split(path.sep).join('/')
  const isOutsideRepo = rel.startsWith('..')
  if (!rel || rel === '.' || isOutsideRepo) {
    return info.repoUrl
  }
  return `${info.repoUrl}/tree/${encodeURIComponent(info.branch).replaceAll('%2F', '/')}/${rel}`
}

const workspacePackagesCache = new Map()
function findPackageDirInWorkspace(workspaceRoot, pkgName) {
  if (!workspaceRoot || !pkgName) return null
  let pkgMap = workspacePackagesCache.get(workspaceRoot)
  if (!pkgMap) {
    pkgMap = new Map()
    const examplesDir = path.join(workspaceRoot, 'examples')
    try {
      for (const entry of fs.readdirSync(examplesDir, {
        withFileTypes: true,
      })) {
        if (!entry.isDirectory()) continue
        const d1 = path.join(examplesDir, entry.name)
        const p1 = readJsonIfExists(path.join(d1, 'package.json'))
        if (p1 && p1.name) pkgMap.set(p1.name, d1)
        try {
          for (const sub of fs.readdirSync(d1, { withFileTypes: true })) {
            if (
              !sub.isDirectory() ||
              sub.name === 'node_modules' ||
              sub.name === 'dist'
            )
              continue
            const d2 = path.join(d1, sub.name)
            const p2 = readJsonIfExists(path.join(d2, 'package.json'))
            if (p2 && p2.name) pkgMap.set(p2.name, d2)
          }
        } catch {}
      }
    } catch {}
    workspacePackagesCache.set(workspaceRoot, pkgMap)
  }
  return pkgMap.get(pkgName) || null
}

function extractFirstReadmeSentence(readmeText) {
  if (!readmeText) return null
  const lines = readmeText.split(/\r?\n/)
  const paragraph = []
  let inCode = false
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('```')) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    if (line === '') {
      if (paragraph.length > 0) break
      continue
    }
    if (
      line.startsWith('#') ||
      line.startsWith('>') ||
      line.startsWith('|') ||
      line.startsWith('![')
    ) {
      if (paragraph.length > 0) break
      continue
    }
    paragraph.push(line)
  }
  if (paragraph.length === 0) return null
  const joined = paragraph
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (joined.length <= 180) return joined
  const dot = joined.indexOf('. ', 60)
  if (dot !== -1 && dot <= 180) return joined.slice(0, dot + 1)
  return `${joined.slice(0, 177).trimEnd()}…`
}

function descriptionForDir(dir) {
  if (!dir) return null
  const parent = path.dirname(dir)
  const candidates = [dir, parent, path.join(parent, 'core')]
  for (const candidate of candidates) {
    const pkg = readJsonIfExists(path.join(candidate, 'package.json'))
    if (pkg && typeof pkg.description === 'string' && pkg.description.trim()) {
      return pkg.description.trim()
    }
    const readme = readTextIfExists(path.join(candidate, 'README.md'))
    const sentence = extractFirstReadmeSentence(readme)
    if (sentence) return sentence
  }
  const indexHtml = readTextIfExists(path.join(dir, 'index.html'))
  const titleMatch = /<title>([^<]+)<\/title>/i.exec(indexHtml)
  if (titleMatch && titleMatch[1].trim()) {
    return titleMatch[1].trim()
  }
  return null
}

function resolveDirFromCommand(command, args = [], cwd = null) {
  if (command) {
    const script = readSmallScriptIfText(command)
    if (script.startsWith('#!')) {
      const text = script
        .split(/\r?\n/)
        .filter(line => !line.trimStart().startsWith('#'))
        .join('\n')
      const cdMatch = /^\s*cd\s+([^\s;#]+)/m.exec(text)
      const baseDir = cdMatch ? cdMatch[1].replace(/^['"]|['"]$/g, '') : cwd
      const filterMatch = /pnpm\s+(?:--filter|-F)\s+([^\s'"]+)/.exec(text)
      if (filterMatch && baseDir) {
        const pkgDir = findPackageDirInWorkspace(baseDir, filterMatch[1])
        if (pkgDir) return pkgDir
      }
      const entryMatch = /examples\/([a-z0-9_-]+(?:\/[a-z0-9_-]+)?)/i.exec(text)
      if (entryMatch && baseDir) {
        const candidate = path.join(baseDir, 'examples', entryMatch[1])
        if (fs.existsSync(candidate)) return candidate
      }
      if (baseDir && fs.existsSync(baseDir)) return baseDir
    }
  }
  if (cwd && fs.existsSync(cwd)) return cwd
  for (const arg of args) {
    if (typeof arg === 'string' && arg.startsWith('/') && fs.existsSync(arg)) {
      return fs.statSync(arg).isDirectory() ? arg : path.dirname(arg)
    }
  }
  return null
}

function loadDemoServices() {
  const byPort = new Map()
  const manifest = readTextIfExists(DEMOS_SERVICES_PATH)
  let parsed = null
  try {
    parsed = JSON.parse(manifest, (_field, value) =>
      typeof value === 'string' ? value.replaceAll('${HOME}', HOME) : value,
    )
  } catch {
    parsed = null
  }
  if (!Array.isArray(parsed)) return byPort
  for (const entry of parsed) {
    if (!entry || !entry.port || !entry.name || entry.name === 'index') {
      continue
    }
    const dir = resolveDirFromCommand(entry.command, entry.args, entry.cwd)
    byPort.set(Number(entry.port), {
      name: entry.name,
      dir,
      description: descriptionForDir(dir),
      githubUrl: githubUrlForDir(dir),
    })
  }
  return byPort
}

function scanLaunchAgentsByPort() {
  const byPort = new Map()
  let files = []
  try {
    files = fs
      .readdirSync(LAUNCH_AGENTS_DIR)
      .filter(
        f => f.endsWith('.plist') && f !== 'com.knophy.foldkit.demos.plist',
      )
  } catch {
    return byPort
  }

  for (const file of files) {
    const plistText = readTextIfExists(
      path.join(LAUNCH_AGENTS_DIR, file),
      128 * 1024,
    )
    if (!plistText) continue

    const progMatch =
      /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(
        plistText,
      )
    if (!progMatch) continue
    const args = Array.from(
      progMatch[1].matchAll(/<string>([^<]+)<\/string>/g),
    ).map(m => m[1])
    if (args.length === 0) continue

    const wdMatch =
      /<key>WorkingDirectory<\/key>\s*<string>([^<]+)<\/string>/.exec(plistText)
    const cwd = wdMatch ? wdMatch[1] : null
    const scriptText = readSmallScriptIfText(args[0])
    const combined = `${plistText}\n${args.join(' ')}\n${scriptText}`

    const ports = new Set()
    for (const m of combined.matchAll(
      /--port[=\s]+(\d{4,5})|PORT[=:]\s*(\d{4,5})|127\.0\.0\.1:(\d{4,5})/g,
    )) {
      const p = Number(m[1] || m[2] || m[3])
      if (p && p !== 8780 && p !== 2019) ports.add(p)
    }
    if (ports.size === 0) continue

    const dir = resolveDirFromCommand(args[0], args.slice(1), cwd)
    if (!dir) continue
    const meta = {
      dir,
      description: descriptionForDir(dir),
      githubUrl: githubUrlForDir(dir),
    }
    for (const p of ports) {
      if (!byPort.has(p)) byPort.set(p, meta)
    }
  }
  return byPort
}

function cleanCaddyComment(commentLines) {
  const cleaned = []
  for (const raw of commentLines) {
    const line = raw.replace(/^#\s?/, '').trim()
    if (!line) continue
    if (/^----\s+.*\s+(begin|end)\s+----$/i.test(line)) continue
    cleaned.push(line)
  }
  if (cleaned.length === 0) return null
  const joined = cleaned.join(' ').replace(/\s+/g, ' ').trim()
  const withoutHost = joined.replace(
    /^[a-z0-9.-]+\.(?:pisspoursoftware\.xyz|knophy\.com)(?:\s*\([^)]+\))?:\s*/i,
    '',
  )
  if (withoutHost.length <= 180) return withoutHost
  const dot = withoutHost.indexOf('. ', 50)
  if (dot !== -1 && dot <= 180) return withoutHost.slice(0, dot + 1)
  return `${withoutHost.slice(0, 177).trimEnd()}…`
}

function parseCaddyBlocks(text) {
  const blocks = []
  const lines = text.split(/\r?\n/)
  let currentHost = null
  let currentComment = []
  let pendingComments = []
  let depth = 0
  let bodyLines = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!currentHost) {
      if (trimmed.startsWith('#')) {
        pendingComments.push(trimmed)
        continue
      }
      if (trimmed === '') {
        pendingComments = []
        continue
      }
      const match = /^http:\/\/([^\s{]+)\s*\{$/.exec(trimmed)
      if (match) {
        currentHost = match[1]
        currentComment = pendingComments
        pendingComments = []
        depth = 1
        bodyLines = []
      } else {
        pendingComments = []
      }
    } else {
      for (const ch of trimmed) {
        if (ch === '{') depth += 1
        else if (ch === '}') depth -= 1
      }
      if (depth <= 0) {
        blocks.push({
          host: currentHost,
          body: bodyLines.join('\n'),
          comment: cleanCaddyComment(currentComment),
        })
        currentHost = null
        currentComment = []
        depth = 0
        bodyLines = []
      } else {
        bodyLines.push(line)
      }
    }
  }
  return blocks
}

function extractTargetInfo(body) {
  const ports = new Set()
  for (const m of body.matchAll(
    /(?:loopback_proxy|local_proxy|reverse_proxy\s+127\.0\.0\.1:)\s*(\d+)/g,
  )) {
    const p = Number(m[1])
    if (p !== 8780) ports.add(p)
  }
  for (const m of body.matchAll(/import\s+laptop\s+(\d+)/g)) {
    ports.add(Number(m[1]))
  }
  const rootMatch = /root\s+\*\s+"([^"]+)"/.exec(body)
  const isStatic = /\bfile_server\b/.test(body)
  const isDisabled =
    /\brespond\s+"[^"]*disabled[^"]*"\s+503\b/i.test(body) ||
    /^\s*bind\s+127\.0\.0\.1\s*\n\s*respond\s+404\s*$/.test(body.trim())
  const isLaptop = /\bimport\s+laptop\b/.test(body)
  return {
    ports: Array.from(ports).sort((a, b) => a - b),
    staticRoot: rootMatch ? rootMatch[1] : null,
    isStatic,
    isDisabled,
    isLaptop,
  }
}

function scanSeparateTunnels() {
  const found = []
  let entries = []
  try {
    entries = fs.readdirSync(KNOPHY_HOST_DIR, { withFileTypes: true })
  } catch {
    return found
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const cfgPath = path.join(KNOPHY_HOST_DIR, entry.name, 'cloudflared.yml')
    const text = readTextIfExists(cfgPath, 64 * 1024)
    if (!text) continue

    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const m =
        /^\s*-\s*hostname:\s*([a-z0-9.-]+\.pisspoursoftware\.xyz)\s*$/i.exec(
          lines[i],
        )
      if (!m) continue
      const host = m[1].toLowerCase()
      let port = null
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const sm = /service:\s*https?:\/\/127\.0\.0\.1:(\d+)/i.exec(lines[j])
        if (sm) {
          port = Number(sm[1])
          break
        }
        if (/^\s*-\s*hostname:/.test(lines[j])) break
      }
      found.push({ host, port, source: `tunnel:${entry.name}` })
    }
  }
  return found
}

function choosePrimaryHost(hosts) {
  return [...hosts].sort((a, b) => {
    const la = a.split('.')[0]
    const lb = b.split('.')[0]
    const aHasDemo = la.endsWith('demo') ? 1 : 0
    const bHasDemo = lb.endsWith('demo') ? 1 : 0
    if (aHasDemo !== bHasDemo) return aHasDemo - bHasDemo
    const aHasDash = la.includes('-') ? 1 : 0
    const bHasDash = lb.includes('-') ? 1 : 0
    if (aHasDash !== bHasDash) return aHasDash - bHasDash
    if (la.length !== lb.length) return la.length - lb.length
    return la.localeCompare(lb)
  })[0]
}

function kindOf(item) {
  if (item.isStatic) {
    return 'Static'
  } else if (item.isLaptop) {
    return 'Laptop'
  } else if (item.source.startsWith('tunnel:')) {
    return 'Tunnel'
  } else {
    return 'Service'
  }
}

export function deriveSites() {
  gitCache.clear()
  workspacePackagesCache.clear()

  const caddyText = readTextIfExists(CADDYFILE_PATH)
  const blocks = parseCaddyBlocks(caddyText)
  const demoByPort = loadDemoServices()
  const agentByPort = scanLaunchAgentsByPort()
  const scribeGitUrl = githubUrlForDir(path.join(HOME, 'Scribe'))

  const direct = new Map()
  const twinHop = new Map()

  for (const { host, body, comment } of blocks) {
    if (host === 'pisspoursoftware.xyz' || host.includes('*')) continue
    const info = extractTargetInfo(body)
    if (info.isDisabled) continue

    if (host.endsWith('.pisspoursoftware.xyz')) {
      direct.set(host, {
        host,
        ports: info.ports,
        staticRoot: info.staticRoot,
        isStatic: info.isStatic,
        isLaptop: info.isLaptop,
        comment,
        source: 'caddy-direct',
      })
    } else if (host.endsWith('.knophy.com')) {
      const label = host.slice(0, -'.knophy.com'.length)
      if (!label || label.includes('.')) continue
      const twinHost = `${label}.pisspoursoftware.xyz`
      twinHop.set(twinHost, {
        host: twinHost,
        ports: info.ports,
        staticRoot: info.staticRoot,
        isStatic: info.isStatic,
        isLaptop: info.isLaptop,
        comment,
        source: 'caddy-twin',
      })
    }
  }

  const allByHost = new Map()
  for (const [host, item] of twinHop.entries()) {
    allByHost.set(host, item)
  }
  for (const [host, item] of direct.entries()) {
    allByHost.set(host, item)
  }

  for (const tunnelSite of scanSeparateTunnels()) {
    if (!allByHost.has(tunnelSite.host)) {
      allByHost.set(tunnelSite.host, {
        host: tunnelSite.host,
        ports: tunnelSite.port ? [tunnelSite.port] : [],
        staticRoot: null,
        isStatic: false,
        isLaptop: false,
        comment: null,
        source: tunnelSite.source,
      })
    }
  }

  const demoGroups = new Map()
  const apps = []

  for (const item of allByHost.values()) {
    const matchedDemoPort = item.ports.find(p => demoByPort.has(p))
    if (matchedDemoPort !== undefined) {
      const groupKey = item.ports.includes(5205) ? 5205 : matchedDemoPort
      if (!demoGroups.has(groupKey)) {
        const meta = demoByPort.get(groupKey) || demoByPort.get(matchedDemoPort)
        demoGroups.set(groupKey, {
          demoName: meta.name,
          description: meta.description || item.comment || null,
          githubUrl: meta.githubUrl || null,
          sourceDir: meta.dir || null,
          ports: new Set(),
          hosts: [],
        })
      }
      const group = demoGroups.get(groupKey)
      if (!group.description && item.comment) group.description = item.comment
      for (const p of item.ports) group.ports.add(p)
      group.hosts.push(item.host)
    } else {
      let agentMeta = null
      for (const p of item.ports) {
        if (agentByPort.has(p)) {
          agentMeta = agentByPort.get(p)
          break
        }
      }
      const label = item.host.replace(/\.pisspoursoftware\.xyz$/, '')
      const devDir = path.join(HOME, 'Development', label)
      const devDirMeta = fs.existsSync(devDir)
        ? {
            description: descriptionForDir(devDir),
            githubUrl: githubUrlForDir(devDir),
          }
        : null

      const description =
        item.comment ||
        (agentMeta && agentMeta.description) ||
        (devDirMeta && devDirMeta.description) ||
        null
      const githubUrl =
        (agentMeta && agentMeta.githubUrl) ||
        (devDirMeta && devDirMeta.githubUrl) ||
        (item.staticRoot ? githubUrlForDir(item.staticRoot) : null) ||
        (item.comment && /\bscribe\b/i.test(item.comment)
          ? scribeGitUrl
          : null) ||
        null

      apps.push({
        name: label,
        primaryHost: item.host,
        url: `https://${item.host}`,
        aliases: [],
        ports: item.ports,
        description,
        githubUrl,
        staticRoot: item.staticRoot,
        kind: kindOf(item),
      })
    }
  }

  const demos = []
  for (const group of demoGroups.values()) {
    const primaryHost = choosePrimaryHost(group.hosts)
    const aliases = group.hosts
      .filter(h => h !== primaryHost)
      .sort((a, b) => a.localeCompare(b))
    demos.push({
      name: group.demoName,
      primaryHost,
      url: `https://${primaryHost}`,
      aliases,
      ports: Array.from(group.ports).sort((a, b) => a - b),
      description: group.description,
      githubUrl: group.githubUrl,
      sourceDir: group.sourceDir,
      kind: 'FoldkitDemo',
    })
  }

  demos.sort((a, b) => a.primaryHost.localeCompare(b.primaryHost))
  apps.sort((a, b) => a.primaryHost.localeCompare(b.primaryHost))

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      apps: apps.length,
      demos: demos.length,
      totalHosts:
        apps.length + demos.reduce((sum, d) => sum + 1 + d.aliases.length, 0),
    },
    apps,
    demos,
  }
}

const PRIVATE_FIELDS = new Set(['sourceDir', 'staticRoot'])

/** The site list as the page receives it, without the local folders. */
export function toPublicJson(sites) {
  return JSON.stringify(
    sites,
    (field, value) => (PRIVATE_FIELDS.has(field) ? undefined : value),
    2,
  )
}
