#!/usr/bin/env node
import { Array, Effect, pipe } from 'effect'
import { MacOSLiveWalletResources } from 'wallet-node-client-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runWalletTerminal } from './host.js'

const walletResources =
  process.env['FOLDKIT_WALLET_RESOURCES'] === 'simulated'
    ? SimulatedWalletResources
    : MacOSLiveWalletResources

const maybeCarrier = pipe(
  Array.drop(process.argv, 2),
  Array.dropWhile(argument => argument === '--'),
  Array.head,
)

runWalletTerminal(maybeCarrier, walletResources).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
