#!/usr/bin/env node
import {
  NotedPlayer,
  PointedAtSection,
  RequestedReload,
  SectionColumn,
  SectionKey,
  solOfLamports,
} from 'brandon-core-example'
import { Array as Array_, Effect, Option, Schema as S } from 'effect'
import { readFileSync } from 'node:fs'

import { parseMarkdown } from '@foldkit/markdown/vite'

import { accountKeyOf, defaultAccountKey } from './account.js'
import { makeBrandonAdmin } from './adminStore.js'
import { brandonEnv, listOf } from './env.js'
import { sameTotals } from './facts.js'
import { SectionKind } from './store.js'
import { WalletNetwork } from './walletMirror.js'

// COMMAND

const usage = `brandon: drive Brandon dot (the page follows within a second).

  brandon go <section-key>                     point every open page at a section
  brandon reload                               reload every open page
  brandon score list [--game KEY]              each player's total
  brandon score sync [--game KEY]              copy Scribe's score rows missing from the log
  brandon score check [--game KEY]             the log's totals against Scribe's rows
  brandon score add <name> <points> "<reason>" [--by NAME] [--segment N] [--recording ID] [--game KEY]
                                               a correction is negative points
  brandon note <name> "<note>" [--dunce]       a note beside a player
  brandon section list
  brandon section put <key> --title T --kind Markdown|QrLinks|Scoreboard|Football|Wallets|Wallet
      --column Top|Main|Side --flag F --position N [--file F.md] [--links '[{"label":"…","url":"…"}]']
  brandon account set <email|default> --name NAME --flags a,b,c
  brandon account flags <name> [--add a,b] [--remove c]
                                               change one person's flags by name, never an address
  brandon account list                         names and flags, never an address
  brandon wallet add <address> --label L [--network Devnet|Mainnet]
  brandon wallet list
  brandon wallet mirror                        read public chain data now`

const defaultGame = 'halloween-2026'

/** Mainnet waits for Michael's word; the environment records that he gave it. */
const mainnetApproved = 'BRANDON_MAINNET_APPROVED'

type Parsed = Readonly<{
  positionals: ReadonlyArray<string>
  options: ReadonlyMap<string, string>
}>

const booleanFlags: ReadonlySet<string> = new Set(['--dunce'])

const parse = (args: ReadonlyArray<string>): Parsed => {
  const positionals: Array<string> = []
  const options = new Map<string, string>()
  for (let index = 0; index < args.length; index += 1) {
    const arg = args.at(index) ?? ''
    if (booleanFlags.has(arg)) {
      options.set(arg, 'true')
    } else if (arg.startsWith('--')) {
      options.set(arg, args.at(index + 1) ?? '')
      index += 1
    } else {
      positionals.push(arg)
    }
  }
  return { positionals, options }
}

const need = (parsed: Parsed, name: string): string => {
  const value = parsed.options.get(name)
  if (value === undefined || value === '') {
    throw new Error(`Missing ${name}.`)
  }
  return value
}

const print = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line)
  })

const run = (args: ReadonlyArray<string>): Effect.Effect<void, Error> => {
  const parsed = parse(args)
  const [area, verb, first, second, third] = parsed.positionals
  const admin = makeBrandonAdmin(brandonEnv())
  const game = parsed.options.get('--game') ?? defaultGame
  if (area === 'go' && verb !== undefined) {
    return admin.appendFact(
      PointedAtSection({
        sectionKey: SectionKey.make(verb),
        atMs: Date.now(),
      }),
    )
  } else if (area === 'reload') {
    return admin.appendFact(RequestedReload({ atMs: Date.now() }))
  } else if (area === 'score' && verb === 'list') {
    return Effect.flatMap(admin.scoreTotals(game), totals =>
      print(
        [...totals.entries()]
          .sort(([, left], [, right]) => right - left)
          .map(([name, total]) => `${name}: ${total.toString()}`)
          .join('\n'),
      ),
    )
  } else if (area === 'score' && verb === 'sync') {
    return Effect.flatMap(admin.syncScoresToLog(game), written =>
      print(`${written.toString()} score row(s) copied to the log.`),
    )
  } else if (area === 'score' && verb === 'check') {
    return Effect.gen(function* () {
      const fromLog = yield* admin.logTotals
      const fromScribe = yield* admin.scoreTotals(game)
      yield* Option.match(sameTotals(fromLog, fromScribe), {
        onNone: () => print('The log and Scribe agree.'),
        onSome: difference => Effect.fail(new Error(difference)),
      })
    })
  } else if (
    area === 'score' &&
    verb === 'add' &&
    first !== undefined &&
    second !== undefined &&
    third !== undefined
  ) {
    const segment = parsed.options.get('--segment')
    const recording = parsed.options.get('--recording')
    return admin.awardPoints({
      gameKey: game,
      name: first,
      points: Number(second),
      reason: third,
      awardedBy: parsed.options.get('--by') ?? 'the listener',
      ...(segment === undefined ? {} : { segmentIndex: Number(segment) }),
      ...(recording === undefined ? {} : { recordingID: recording }),
    })
  } else if (area === 'note' && verb !== undefined) {
    return admin.appendFact(
      NotedPlayer({
        name: verb,
        maybeNote: Option.fromNullishOr(first),
        isDunce: parsed.options.has('--dunce'),
      }),
    )
  } else if (area === 'section' && verb === 'list') {
    return Effect.flatMap(admin.sections, rows =>
      print(
        rows
          .map(
            row =>
              `${row.position.toString()}  ${row.sectionKey}  ${row.kind}  ${row.column}  flag ${row.flag}`,
          )
          .join('\n'),
      ),
    )
  } else if (area === 'section' && verb === 'put' && first !== undefined) {
    const file = parsed.options.get('--file')
    const links = parsed.options.get('--links')
    if (file !== undefined) {
      parseMarkdown(readFileSync(file, 'utf8'))
    }
    return admin.putSection({
      sectionKey: first,
      title: need(parsed, '--title'),
      kind: S.decodeUnknownSync(SectionKind)(need(parsed, '--kind')),
      column: S.decodeUnknownSync(SectionColumn)(need(parsed, '--column')),
      flag: need(parsed, '--flag'),
      position: Number(need(parsed, '--position')),
      maybeMarkdown:
        file === undefined
          ? Option.none()
          : Option.some(readFileSync(file, 'utf8')),
      maybeLinks:
        links === undefined ? Option.none() : Option.some(JSON.parse(links)),
    })
  } else if (area === 'account' && verb === 'set' && first !== undefined) {
    return admin.setAccount(
      first === defaultAccountKey ? defaultAccountKey : accountKeyOf(first),
      {
        displayName: need(parsed, '--name'),
        flags: listOf(need(parsed, '--flags')),
      },
    )
  } else if (area === 'account' && verb === 'flags' && first !== undefined) {
    const added = listOf(parsed.options.get('--add'))
    const removed = listOf(parsed.options.get('--remove'))
    return Effect.flatMap(
      admin.changeFlags(first, flags =>
        Array_.dedupe(
          Array_.appendAll(
            Array_.filter(flags, flag => !Array_.contains(removed, flag)),
            added,
          ),
        ),
      ),
      ({ displayName, flags }) => print(`${displayName}: ${flags.join(', ')}`),
    )
  } else if (area === 'account' && verb === 'list') {
    return Effect.flatMap(admin.accounts, rows =>
      print(
        rows
          .map(
            ({ displayName, flags }) => `${displayName}: ${flags.join(', ')}`,
          )
          .join('\n'),
      ),
    )
  } else if (area === 'wallet' && verb === 'add' && first !== undefined) {
    const network = S.decodeUnknownSync(WalletNetwork)(
      parsed.options.get('--network') ?? 'Devnet',
    )
    if (network === 'Mainnet' && process.env[mainnetApproved] !== 'yes') {
      return Effect.fail(
        new Error(
          `Mainnet waits for Michael's word. Set ${mainnetApproved}=yes once he has said so.`,
        ),
      )
    }
    return admin.addWallet({
      network,
      address: first,
      label: need(parsed, '--label'),
    })
  } else if (area === 'wallet' && verb === 'list') {
    return Effect.flatMap(admin.wallets, rows =>
      print(
        rows
          .map(
            row =>
              `${row.label}  ${row.network}  ${row.address}  ${solOfLamports(row.balanceAtomic)} SOL  ${row.transactions.length.toString()} transactions`,
          )
          .join('\n'),
      ),
    )
  } else if (area === 'wallet' && verb === 'mirror') {
    return Effect.flatMap(admin.mirrorWallets(globalThis.fetch), changed =>
      print(`${changed.toString()} address(es) changed.`),
    )
  } else {
    return print(usage)
  }
}

Effect.runPromise(run(process.argv.slice(2))).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
