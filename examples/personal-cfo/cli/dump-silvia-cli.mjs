import fs from 'node:fs'
import { Effect } from 'effect'
import {
  RequestedAddAccount,
  RequestedAddVault,
  RequestedArmRadar,
  RequestedChat,
  RequestedLogin,
  RequestedNotify,
  RequestedOpen,
  RequestedRadarTick,
} from 'personal-cfo-core'
import { withRuntime } from './dist/host.js'
import { paintModel } from './dist/paint.js'

const dir = '/tmp/silvia-cli/painted'
fs.mkdirSync(dir, { recursive: true })
const write = (name, model) => {
  const text = paintModel(model)
  fs.writeFileSync(`${dir}/${name}.txt`, `$ cfo ${name}\n\n${text}\n`)
}

const program = withRuntime((runtime) =>
  Effect.gen(function* () {
    const login = yield* runtime.run(RequestedLogin({ email: 'alice@fake.com' }))
    write('01-login-dashboard', login)
    const dash = yield* runtime.run(RequestedOpen({ screen: 'dashboard' }))
    write('02-dashboard', dash)
    yield* runtime.run(
      RequestedAddAccount({
        name: 'Prove Cash',
        institution: 'Prove Bank',
        kind: 'cash',
        balanceCents: 10000,
      }),
    )
    const accounts = yield* runtime.run(RequestedOpen({ screen: 'accounts' }))
    write('03-accounts', accounts)
    yield* runtime.run(RequestedAddVault({ title: 'W2 stub', origin: 'upload' }))
    const vault = yield* runtime.run(RequestedOpen({ screen: 'vault' }))
    write('04-vault', vault)
    yield* runtime.run(
      RequestedArmRadar({
        question: 'Did net worth move?',
        cadence: 'daily',
        everyMinutes: 0,
      }),
    )
    const radar = yield* runtime.run(RequestedOpen({ screen: 'radar' }))
    write('05-radar', radar)
    yield* runtime.run(RequestedRadarTick())
    const radarTick = yield* runtime.run(RequestedOpen({ screen: 'radar' }))
    write('06-radar-tick', radarTick)
    yield* runtime.run(
      RequestedNotify({
        title: 'Personal CFO',
        body: 'CLI prove ping',
        channel: 'local',
      }),
    )
    yield* runtime.run(RequestedChat({ text: 'What is my net worth?' }))
    const chat = yield* runtime.run(RequestedOpen({ screen: 'chat' }))
    write('07-chat', chat)
    const more = yield* runtime.run(RequestedOpen({ screen: 'more' }))
    write('08-more', more)
  }),
)

Effect.runPromise(program)
  .then(() => {
    console.log('dumped', fs.readdirSync(dir).join(','))
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
