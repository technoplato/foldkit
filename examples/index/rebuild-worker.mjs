/** Runs one rebuild of the site list off the server's main thread. */
import { parentPort } from 'node:worker_threads'

import { deriveSites, toPublicJson } from './sites.mjs'

parentPort.postMessage(toPublicJson(deriveSites()))
