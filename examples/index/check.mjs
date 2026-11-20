#!/opt/homebrew/bin/node

/**
 * Checks what the sites on pisspoursoftware.xyz serve, not their status codes.
 * Every request goes through Caddy on this Mac (127.0.0.1:8780) under the site's
 * own host name, so the route is checked together with the server behind it.
 *
 *   node examples/index/check.mjs               every check
 *   node examples/index/check.mjs --no-browser  skip the headless browser checks
 *
 * Exits 1 when any check fails. README.md says what each check proves.
 */
import fs from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { deriveSites, toPublicJson } from './sites.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CADDY_HOST = process.env.SITE_INDEX_CADDY_HOST || '127.0.0.1'
const CADDY_PORT = Number(process.env.SITE_INDEX_CADDY_PORT || 8780)
const APEX_HOST = 'pisspoursoftware.xyz'
const APEX_BUNDLE_MARKER = 'Loading live site index'

const REQUEST_TIMEOUT_MS = 10_000
const SITE_LIST_BUDGET_MS = 2_000
const LIST_REFRESH_WAIT_MS = 8_000
const LIST_REFRESH_POLL_MS = 1_000
const RENDER_TIMEOUT_MS = 10_000
const SETTLE_TIMEOUT_MS = 12_000
const SETTLE_POLL_MS = 500
const SETTLED_AFTER_UNCHANGED_POLLS = 4
const RENDERED_TEXT_PREVIEW_LENGTH = 70

const isBrowserEnabled = !process.argv.includes('--no-browser')

// NOTE: the browser's request is forwarded asking for an unencoded body, and
// Node has already read that body whole, so these headers would describe a
// response the browser never receives.
const UNFORWARDED_HEADERS = new Set([
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'connection',
])

const results = []

function record(isPassing, subject, detail) {
  results.push({ isPassing, subject, detail })
  process.stdout.write(
    `${isPassing ? 'ok  ' : 'FAIL'}  ${subject}  ${detail}\n`,
  )
}

function note(subject, detail) {
  process.stdout.write(`note  ${subject}  ${detail}\n`)
}

function fetchThroughCaddy(host, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now()
    const request = http.request(
      {
        host: CADDY_HOST,
        port: CADDY_PORT,
        path: requestPath,
        method: options.method || 'GET',
        headers: { Accept: 'text/html,*/*', ...options.headers, Host: host },
        timeout: REQUEST_TIMEOUT_MS,
      },
      response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            contentType: response.headers['content-type'] || '',
            headers: response.headers,
            body: Buffer.concat(chunks),
            elapsedMs: Math.round(performance.now() - startedAt),
          })
        })
        response.on('error', reject)
      },
    )
    request.on('timeout', () => {
      request.destroy(new Error(`no answer in ${REQUEST_TIMEOUT_MS} ms`))
    })
    request.on('error', reject)
    request.end(options.body)
  })
}

async function fetchOrRecord(subject, host, requestPath) {
  try {
    return await fetchThroughCaddy(host, requestPath)
  } catch (error) {
    record(false, subject, `${requestPath}: ${error.message}`)
    return null
  }
}

function titleOf(htmlText) {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(htmlText)
  return match ? match[1].trim() : null
}

function entryScriptOf(htmlText) {
  const scriptTags = htmlText.match(/<script\b[^>]*>/gi) || []
  const localSources = []
  for (const tag of scriptTags) {
    const source = /\bsrc=["']([^"']+)["']/i.exec(tag)
    if (!source || /^(https?:)?\/\//.test(source[1])) {
      continue
    }
    const scriptPath = source[1].startsWith('/')
      ? source[1]
      : `/${source[1].replace(/^\.\//, '')}`
    if (/\btype=["']module["']/i.test(tag)) {
      return scriptPath
    }
    localSources.push(scriptPath)
  }
  return localSources.length > 0 ? localSources[0] : null
}

function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath)
  } catch {
    return null
  }
}

function sourceTitlesOf(sourceDir) {
  if (!sourceDir) {
    return []
  }
  const titles = []
  for (const relativePath of ['index.html', 'dist/index.html']) {
    const page = readIfExists(path.join(sourceDir, relativePath))
    const title = page === null ? null : titleOf(page.toString('utf8'))
    if (title !== null && !titles.includes(title)) {
      titles.push(title)
    }
  }
  return titles
}

function withoutGeneratedAt(sitesJson) {
  const parsed = JSON.parse(sitesJson)
  delete parsed.generatedAt
  return JSON.stringify(parsed)
}

/** Returns the script's text and whether it matched the built file on disk. */
async function checkEntryScript(subject, host, htmlText, sourceDir) {
  const entryScript = entryScriptOf(htmlText)
  if (!entryScript) {
    record(false, subject, 'the page names no script of its own to load')
    return null
  }

  const script = await fetchOrRecord(subject, host, entryScript)
  if (script === null) {
    return null
  }

  const isJavaScript = /javascript/i.test(script.contentType)
  const startsLikeHtml = script.body
    .subarray(0, 64)
    .toString('utf8')
    .trimStart()
    .startsWith('<')
  if (
    script.status !== 200 ||
    !isJavaScript ||
    startsLikeHtml ||
    script.body.length === 0
  ) {
    record(
      false,
      subject,
      `script ${entryScript} is ${script.body.length} bytes of ${script.contentType || 'no content type'} (status ${script.status}), not JavaScript`,
    )
    return null
  }

  const distDir = sourceDir ? path.join(sourceDir, 'dist') : null
  if (distDir === null || !fs.existsSync(distDir)) {
    record(
      true,
      subject,
      `script ${entryScript} is ${script.body.length} bytes of JavaScript`,
    )
    note(
      subject,
      `not compared with a build: no dist folder in ${sourceDir || 'an unknown source folder'}`,
    )
    return { text: script.body.toString('utf8'), isBuiltCopy: false }
  }

  const builtPath = path.join(distDir, entryScript)
  const builtScript = readIfExists(builtPath)
  if (builtScript === null) {
    record(
      false,
      subject,
      `script ${entryScript} is not in ${distDir}, so the page comes from another build`,
    )
    return { text: script.body.toString('utf8'), isBuiltCopy: false }
  }

  const isBuiltCopy = script.body.equals(builtScript)
  record(
    isBuiltCopy,
    subject,
    isBuiltCopy
      ? `script ${entryScript} is ${builtPath} byte for byte (${script.body.length} bytes)`
      : `script ${entryScript} (${script.body.length} bytes) differs from ${builtPath} (${builtScript.length} bytes)`,
  )
  return { text: script.body.toString('utf8'), isBuiltCopy }
}

async function checkApexIndex(sites) {
  const subject = APEX_HOST

  const page = await fetchOrRecord(subject, APEX_HOST, '/')
  if (page !== null) {
    const pageText = page.body.toString('utf8')
    const hasRoot = pageText.includes('<div id="root">')
    record(
      hasRoot && titleOf(pageText) === 'Piss Pour Software',
      subject,
      `page title is ${JSON.stringify(titleOf(pageText))} and it ${hasRoot ? 'has' : 'lacks'} the Foldkit root element`,
    )

    const bundle = await checkEntryScript(
      subject,
      APEX_HOST,
      pageText,
      __dirname,
    )
    if (bundle !== null) {
      const isOwnBundle = bundle.text.includes(APEX_BUNDLE_MARKER)
      record(
        isOwnBundle,
        subject,
        `the script ${isOwnBundle ? 'is' : 'is not'} the index page's own bundle (looked for ${JSON.stringify(APEX_BUNDLE_MARKER)})`,
      )
    }
  }

  const siteList = await fetchOrRecord(subject, APEX_HOST, '/api/sites.json')
  if (siteList === null) {
    return
  }

  record(
    siteList.elapsedMs <= SITE_LIST_BUDGET_MS,
    subject,
    `/api/sites.json answered in ${siteList.elapsedMs} ms (limit ${SITE_LIST_BUDGET_MS} ms)`,
  )

  const expectedJson = withoutGeneratedAt(toPublicJson(sites))
  const deadline = Date.now() + LIST_REFRESH_WAIT_MS
  let servedBody = siteList.body
  let isSameList = false
  while (true) {
    try {
      isSameList =
        withoutGeneratedAt(servedBody.toString('utf8')) === expectedJson
    } catch (error) {
      record(false, subject, `/api/sites.json is not JSON: ${error.message}`)
      return
    }
    if (isSameList || Date.now() >= deadline) {
      break
    }

    await new Promise(resolve => setTimeout(resolve, LIST_REFRESH_POLL_MS))
    const refetched = await fetchOrRecord(subject, APEX_HOST, '/api/sites.json')
    if (refetched === null) {
      return
    }
    servedBody = refetched.body
  }

  record(
    isSameList,
    subject,
    isSameList
      ? `/api/sites.json lists the ${sites.apps.length} apps and ${sites.demos.length} demos the routing files give`
      : `/api/sites.json still differs from the list the routing files give after ${LIST_REFRESH_WAIT_MS} ms`,
  )
}

/** Returns whether the demo has a page, so the browser pass knows what to load. */
async function checkDemo(demo) {
  const subject = demo.primaryHost
  const page = await fetchOrRecord(subject, demo.primaryHost, '/')
  if (page === null) {
    return false
  }

  const pageText = page.body.toString('utf8')
  const sourceTitles = sourceTitlesOf(demo.sourceDir)
  const isHtmlPage =
    /html/i.test(page.contentType) && pageText.includes('<script')
  if (!isHtmlPage && sourceTitles.length === 0) {
    note(
      subject,
      `not checked: nothing to load at / (status ${page.status}, ${page.body.length} bytes) and no index.html in ${demo.sourceDir || 'an unknown source folder'}`,
    )
    return false
  }
  if (!isHtmlPage) {
    record(
      false,
      subject,
      `/ is not a page with a script (status ${page.status}, ${page.body.length} bytes of ${page.contentType || 'no content type'})`,
    )
    return false
  }

  const script = await checkEntryScript(
    subject,
    demo.primaryHost,
    pageText,
    demo.sourceDir,
  )

  const servedTitle = titleOf(pageText)
  if (sourceTitles.length > 0) {
    const sourceTitleList = sourceTitles
      .map(title => JSON.stringify(title))
      .join(' or ')
    if (sourceTitles.includes(servedTitle)) {
      record(
        true,
        subject,
        `page title ${JSON.stringify(servedTitle)} matches index.html in ${demo.sourceDir}`,
      )
    } else if (script !== null && script.isBuiltCopy) {
      note(
        subject,
        `page title is ${JSON.stringify(servedTitle)}; index.html in ${demo.sourceDir} says ${sourceTitleList}`,
      )
    } else {
      record(
        false,
        subject,
        `page title is ${JSON.stringify(servedTitle)} but index.html in ${demo.sourceDir} says ${sourceTitleList}`,
      )
    }
  }
  return true
}

async function checkApp(app) {
  const subject = app.primaryHost
  const page = await fetchOrRecord(subject, app.primaryHost, '/')
  if (page === null) {
    return
  }

  if (app.staticRoot) {
    let sourcePage = null
    try {
      sourcePage = fs.readFileSync(path.join(app.staticRoot, 'index.html'))
    } catch {
      sourcePage = null
    }
    if (sourcePage !== null) {
      record(
        page.body.equals(sourcePage),
        subject,
        page.body.equals(sourcePage)
          ? `serves ${path.join(app.staticRoot, 'index.html')} byte for byte (${page.body.length} bytes)`
          : `serves ${page.body.length} bytes that differ from ${path.join(app.staticRoot, 'index.html')}`,
      )
      return
    }
  }

  const isHtml = /html/i.test(page.contentType)
  const servedTitle = isHtml ? titleOf(page.body.toString('utf8')) : null
  const summary = `status ${page.status}, ${page.body.length} bytes of ${page.contentType || 'no content type'}${servedTitle === null ? '' : `, title ${JSON.stringify(servedTitle)}`}`
  if (page.status >= 500) {
    record(false, subject, summary)
  } else if (page.status >= 200 && page.status < 300 && page.body.length > 0) {
    record(true, subject, summary)
  } else {
    note(subject, `not checked: nothing to compare at / (${summary})`)
  }
}

function loadPlaywright() {
  // NOTE: Playwright is installed for packages/examples-e2e, so it is loaded
  // from that package instead of being a second dependency here.
  const requireFromE2e = createRequire(
    path.resolve(__dirname, '../../packages/examples-e2e/package.json'),
  )
  return requireFromE2e('playwright')
}

function isOwnHost(hostname) {
  return hostname === APEX_HOST || hostname.endsWith(`.${APEX_HOST}`)
}

/**
 * Opens https://<host>/ with every request for a pisspoursoftware.xyz name
 * answered from Caddy on this Mac. The page gets its real https origin, so
 * browser features that need a secure origin (crypto.randomUUID) behave as they
 * do on the live site.
 */
async function openPage(browser, host) {
  const context = await browser.newContext()
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (!isOwnHost(url.hostname)) {
      await route.continue()
      return
    }

    try {
      const { host: _host, ...headers } = request.headers()
      const response = await fetchThroughCaddy(
        url.hostname,
        `${url.pathname}${url.search}`,
        {
          method: request.method(),
          headers: { ...headers, 'accept-encoding': 'identity' },
          body: request.postDataBuffer() ?? undefined,
        },
      )
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(
          Object.entries(response.headers).filter(
            ([name, value]) =>
              typeof value === 'string' && !UNFORWARDED_HEADERS.has(name),
          ),
        ),
        body: response.body,
      })
    } catch {
      await route.abort()
    }
  })

  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  try {
    await page.goto(`https://${host}/`, {
      waitUntil: 'load',
      timeout: RENDER_TIMEOUT_MS,
    })
    await page
      .waitForFunction(() => document.body.innerText.trim().length > 0, null, {
        timeout: RENDER_TIMEOUT_MS,
      })
      .catch(() => undefined)
    return { page, context, pageErrors }
  } catch (error) {
    await context.close()
    throw error
  }
}

/**
 * The page's text once it has stopped changing. A page that starts on a loading
 * line keeps changing until its data arrives.
 */
async function settledBodyText(page) {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS
  let previousText = null
  let unchangedPolls = 0
  while (
    Date.now() < deadline &&
    unchangedPolls < SETTLED_AFTER_UNCHANGED_POLLS
  ) {
    const text = (await page.locator('body').innerText())
      .replace(/\s+/g, ' ')
      .trim()
    unchangedPolls = text === previousText ? unchangedPolls + 1 : 0
    previousText = text
    await page.waitForTimeout(SETTLE_POLL_MS)
  }
  return previousText ?? ''
}

async function checkApexIndexInBrowser(browser, sites) {
  const subject = `${APEX_HOST} in a browser`
  const expectedCardCount = sites.apps.length + sites.demos.length
  let opened
  try {
    opened = await openPage(browser, APEX_HOST)
  } catch (error) {
    record(false, subject, `did not load: ${error.message.split('\n')[0]}`)
    return
  }

  const { page, context, pageErrors } = opened
  try {
    const startedAt = performance.now()
    const hasCards = await page
      .waitForFunction(
        expected =>
          document.querySelectorAll('main ul > li').length === expected,
        expectedCardCount,
        {
          timeout: RENDER_TIMEOUT_MS,
        },
      )
      .then(() => true)
      .catch(() => false)
    const cardCount = await page.locator('main ul > li').count()
    const bodyText = await page.locator('body').innerText()
    record(
      hasCards,
      subject,
      `shows ${cardCount} site cards, expected ${expectedCardCount} (waited ${Math.round(performance.now() - startedAt)} ms after load)`,
    )
    record(
      !bodyText.includes(APEX_BUNDLE_MARKER),
      subject,
      bodyText.includes(APEX_BUNDLE_MARKER)
        ? `is stuck on ${JSON.stringify(APEX_BUNDLE_MARKER)}`
        : 'has left the loading state',
    )

    const firstDemo = sites.demos[0]
    if (firstDemo) {
      const label = firstDemo.primaryHost.replace(
        /\.pisspoursoftware\.xyz$/,
        '',
      )
      const link = page.locator(`main a[href="${firstDemo.url}"]`)
      const linkText =
        (await link.count()) > 0 ? await link.first().innerText() : null
      record(
        linkText === label,
        subject,
        `the card for ${firstDemo.url} reads ${JSON.stringify(linkText)}, expected ${JSON.stringify(label)}`,
      )
    }
    record(
      pageErrors.length === 0,
      subject,
      `${pageErrors.length} uncaught script errors${pageErrors.length > 0 ? `: ${pageErrors[0]}` : ''}`,
    )
  } finally {
    await context.close()
  }
}

async function checkDemoInBrowser(browser, demo) {
  const subject = `${demo.primaryHost} in a browser`
  let rendered
  try {
    rendered = await openPage(browser, demo.primaryHost)
  } catch (error) {
    record(false, subject, `did not load: ${error.message.split('\n')[0]}`)
    return
  }

  const { page, context, pageErrors } = rendered
  try {
    const bodyText = await settledBodyText(page)
    const elementCount = await page
      .locator('body *:not(script):not(style)')
      .count()
    const pictureCount = await page
      .locator('body canvas, body svg, body img, body video')
      .count()
    const hasContent = bodyText.length > 0 || pictureCount > 0
    const isPassing = hasContent && pageErrors.length === 0
    const preview =
      bodyText.length > RENDERED_TEXT_PREVIEW_LENGTH
        ? `${bodyText.slice(0, RENDERED_TEXT_PREVIEW_LENGTH)}…`
        : bodyText
    record(
      isPassing,
      subject,
      `drew ${elementCount} elements, text ${JSON.stringify(preview)}${pageErrors.length > 0 ? `, uncaught error: ${pageErrors[0]}` : ''}`,
    )
  } finally {
    await context.close()
  }
}

async function runBrowserChecks(sites, demosWithPages) {
  let playwright
  try {
    playwright = loadPlaywright()
  } catch (error) {
    record(
      false,
      'browser checks',
      `Playwright did not load: ${error.message.split('\n')[0]}`,
    )
    return
  }

  // NOTE: Chromium resolves every pisspoursoftware.xyz name to this Mac, so a
  // request the check does not answer itself (a WebSocket) cannot reach the live
  // site.
  const browser = await playwright.chromium.launch({
    args: [
      `--host-resolver-rules=MAP *.${APEX_HOST} ${CADDY_HOST}, MAP ${APEX_HOST} ${CADDY_HOST}`,
    ],
  })
  try {
    await checkApexIndexInBrowser(browser, sites)
    for (const demo of demosWithPages) {
      await checkDemoInBrowser(browser, demo)
    }
  } finally {
    await browser.close()
  }
}

const sites = deriveSites()

await checkApexIndex(sites)

const demosWithPages = []
for (const demo of sites.demos) {
  if (await checkDemo(demo)) {
    demosWithPages.push(demo)
  }
}

for (const app of sites.apps) {
  await checkApp(app)
}

if (isBrowserEnabled) {
  await runBrowserChecks(sites, demosWithPages)
}

const failures = results.filter(result => !result.isPassing)
process.stdout.write(
  `\n${results.length - failures.length} of ${results.length} checks passed${isBrowserEnabled ? '' : ' (browser checks skipped)'}\n`,
)
for (const failure of failures) {
  process.stdout.write(`FAIL  ${failure.subject}  ${failure.detail}\n`)
}
process.exit(failures.length === 0 ? 0 : 1)
