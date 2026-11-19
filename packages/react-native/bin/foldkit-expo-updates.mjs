#!/usr/bin/env node
// Hands an Expo app its newest code over the Expo Updates protocol, signed.
//
//   foldkit-expo-updates publish --from <expo export folder> --store <folder> \
//       --runtime-version <name> [--config <app config json>]
//   foldkit-expo-updates serve --store <folder> --key <private key pem> \
//       --public-url <address the app asks> [--port 8794] [--host 127.0.0.1]
//
// `publish` copies what `expo export` wrote into the store as one update of
// one runtime. `serve` answers the app's updates module: the newest update
// for the runtime it names, as a manifest signed with the private key, then
// each file that manifest names. The app is built with the matching
// certificate and takes code signed by nothing else. An update is for the
// native app it was built for: a different runtime gets nothing.
//
// The private key is read from the file named and never printed. The
// server listens on one address, loopback unless told otherwise; put it
// behind whatever carries the app's requests to this machine.
//
// It uses nothing but Node, so the one file can be copied to where a
// service runs from.
import { createHash, createSign } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

// STORE

const updateRecord = 'foldkit-update.json'

const folderNameOf = at => at.toISOString().replaceAll(':', '-')

/**
 * Copies one `expo export` into the store as an update of one runtime,
 * and returns the folder it wrote.
 */
export const publish = ({ from, store, runtimeVersion, expoClient, now }) => {
  const createdAt = now ?? new Date()
  const folder = join(store, runtimeVersion, folderNameOf(createdAt))
  mkdirSync(folder, { recursive: true })
  cpSync(from, folder, { recursive: true })
  writeFileSync(
    join(folder, updateRecord),
    JSON.stringify({
      createdAt: createdAt.toISOString(),
      runtimeVersion,
      expoClient: expoClient ?? {},
    }),
  )
  return folder
}

const newestUpdateOf = (store, runtimeVersion) => {
  const runtimeFolder = join(store, runtimeVersion)
  if (!isPlainName(runtimeVersion) || !existsSync(runtimeFolder)) {
    return undefined
  }
  const names = readdirSync(runtimeFolder)
    .filter(name => existsSync(join(runtimeFolder, name, updateRecord)))
    .sort()
  const name = names.at(-1)
  return name === undefined
    ? undefined
    : { name, folder: join(runtimeFolder, name) }
}

const isPlainName = name => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)

// MANIFEST

const contentTypes = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
}

const base64Url = bytes =>
  bytes
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

const idOf = text => {
  const hex = createHash('sha256').update(text).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const assetOf = ({ folder, path, extension, contentType, url }) => {
  const bytes = readFileSync(join(folder, path))
  return {
    hash: base64Url(createHash('sha256').update(bytes).digest()),
    key: createHash('md5').update(bytes).digest('hex'),
    contentType,
    ...(extension === undefined ? {} : { fileExtension: extension }),
    url,
  }
}

/** The manifest of one stored update, for one platform, as the app reads it. */
export const manifestOf = ({ update, runtimeVersion, platform, publicUrl }) => {
  const metadataText = readFileSync(
    join(update.folder, 'metadata.json'),
    'utf8',
  )
  const record = JSON.parse(
    readFileSync(join(update.folder, updateRecord), 'utf8'),
  )
  const files = JSON.parse(metadataText).fileMetadata?.[platform]
  if (files === undefined) {
    return undefined
  }
  const urlOf = path =>
    `${publicUrl}/assets/${runtimeVersion}/${update.name}/${path}`
  return {
    id: idOf(`${metadataText}${record.createdAt}${platform}`),
    createdAt: record.createdAt,
    runtimeVersion,
    launchAsset: assetOf({
      folder: update.folder,
      path: files.bundle,
      contentType: 'application/javascript',
      url: urlOf(files.bundle),
    }),
    assets: files.assets.map(asset =>
      assetOf({
        folder: update.folder,
        path: asset.path,
        extension: `.${asset.ext}`,
        contentType:
          contentTypes[`.${asset.ext}`] ?? 'application/octet-stream',
        url: urlOf(asset.path),
      }),
    ),
    metadata: {},
    extra: { expoClient: record.expoClient },
  }
}

// ANSWER

const signatureOf = (text, privateKeyPem) =>
  `sig="${createSign('RSA-SHA256').update(text).sign(privateKeyPem, 'base64')}", keyid="main"`

const multipartOf = (parts, boundary) =>
  Buffer.from(
    `${parts
      .map(
        part =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"\r\nContent-Type: application/json; charset=utf-8\r\n${
            part.signature === undefined
              ? ''
              : `expo-signature: ${part.signature}\r\n`
          }\r\n${part.text}\r\n`,
      )
      .join('')}--${boundary}--\r\n`,
  )

const plain = (status, text) => ({
  status,
  headers: { 'content-type': 'text/plain; charset=utf-8' },
  body: Buffer.from(text),
})

const signedParts = ({ name, value, headers, privateKeyPem }) => {
  const text = JSON.stringify(value)
  const boundary = `foldkit-${createHash('sha256').update(text).digest('hex').slice(0, 24)}`
  return {
    status: 200,
    headers: {
      'expo-protocol-version': '1',
      'expo-sfv-version': '0',
      'cache-control': 'private, max-age=0',
      'content-type': `multipart/mixed; boundary=${boundary}`,
    },
    body: multipartOf(
      [
        {
          name,
          text,
          ...(headers['expo-expect-signature'] === undefined
            ? {}
            : { signature: signatureOf(text, privateKeyPem) }),
        },
        {
          name: 'extensions',
          text: JSON.stringify({ assetRequestHeaders: {} }),
        },
      ],
      boundary,
    ),
  }
}

const fileAnswer = (store, relative) => {
  const wanted = normalize(join(store, relative))
  const root = normalize(store) + sep
  if (
    !wanted.startsWith(root) ||
    relative.split('/').some(part => part === '..' || part === '') ||
    !existsSync(wanted) ||
    !statSync(wanted).isFile()
  ) {
    return plain(404, 'not here\n')
  }
  const extension = /\.[A-Za-z0-9]+$/.exec(wanted)?.[0] ?? ''
  return {
    status: 200,
    headers: {
      'content-type':
        extension === '.hbc' || extension === '.js' || extension === '.bundle'
          ? 'application/javascript'
          : (contentTypes[extension] ?? 'application/octet-stream'),
      'cache-control': 'private, max-age=31536000, immutable',
    },
    body: readFileSync(wanted),
  }
}

/**
 * What the server says to one request. `path` may carry whatever comes
 * before it on the way in: only its end, `/manifest`, `/health` or
 * `/assets/…`, is read.
 */
export const answer = ({ store, privateKeyPem, publicUrl, path, headers }) => {
  const assetsAt = path.indexOf('/assets/')
  if (path.endsWith('/health')) {
    return plain(200, 'ok\n')
  } else if (assetsAt >= 0) {
    return fileAnswer(store, path.slice(assetsAt + '/assets/'.length))
  } else if (!path.endsWith('/manifest')) {
    return plain(404, 'not here\n')
  }
  const runtimeVersion = headers['expo-runtime-version'] ?? ''
  const platform = headers['expo-platform'] ?? ''
  const update = newestUpdateOf(store, runtimeVersion)
  const manifest =
    update === undefined
      ? undefined
      : manifestOf({ update, runtimeVersion, platform, publicUrl })
  if (manifest === undefined) {
    return plain(404, 'no update for this runtime\n')
  } else if (headers['expo-current-update-id'] === manifest.id) {
    return signedParts({
      name: 'directive',
      value: { type: 'noUpdateAvailable' },
      headers,
      privateKeyPem,
    })
  } else {
    return signedParts({
      name: 'manifest',
      value: manifest,
      headers,
      privateKeyPem,
    })
  }
}

// COMMAND

const flagsOf = words =>
  Object.fromEntries(
    words
      .map((word, index) => [word, words[index + 1]])
      .filter(([word]) => word.startsWith('--'))
      .map(([word, value]) => [word.slice(2), value]),
  )

const lowerCased = headers =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(', ') : (value ?? ''),
    ]),
  )

const main = () => {
  const [command, ...rest] = process.argv.slice(2)
  const flags = flagsOf(rest)
  if (command === 'publish') {
    const folder = publish({
      from: flags.from,
      store: flags.store,
      runtimeVersion: flags['runtime-version'],
      expoClient:
        flags.config === undefined
          ? {}
          : JSON.parse(readFileSync(flags.config, 'utf8')),
    })
    console.log(`published ${folder}`)
  } else if (command === 'serve') {
    const privateKeyPem = readFileSync(flags.key, 'utf8')
    const host = flags.host ?? '127.0.0.1'
    const port = Number(flags.port ?? '8794')
    createServer((request, response) => {
      const said = answer({
        store: flags.store,
        privateKeyPem,
        publicUrl: flags['public-url'],
        path: (request.url ?? '/').split('?')[0],
        headers: lowerCased(request.headers),
      })
      // NOTE: one line a request: what was asked and what was answered,
      // never a header or a key.
      console.log(
        `${new Date().toISOString()} ${said.status} ${(request.url ?? '/').split('?')[0]} runtime=${request.headers['expo-runtime-version'] ?? '-'} current=${request.headers['expo-current-update-id'] ?? '-'}`,
      )
      response.writeHead(said.status, said.headers)
      response.end(said.body)
    }).listen(port, host, () => {
      console.log(
        `foldkit-expo-updates listening on ${host}:${port.toString()}`,
      )
    })
  } else {
    console.error(
      'usage: foldkit-expo-updates publish|serve (see the top of this file)',
    )
    process.exit(2)
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
}
