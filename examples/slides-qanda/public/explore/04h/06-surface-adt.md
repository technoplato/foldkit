# Surface is a nested ADT

A start string names a surface. Nest device, then only the frameworks
that device allows. That is an ADT of valid pairs. It is not a free
string soup and not a generic `{ device, framework, language }` struct.

`macos/expo/ts` is illegal. macOS allows Native Swift
(`macos/native/swift`). It does not allow Expo.

Print is lowercase slashes. Schema tags are capitalized.

Proposed constructors. Not locked. Lock them on 04i.

```typescript
import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

const Expo = ts('Expo', {
  language: S.Literals(['Ts', 'Js']),
})
const Native = ts('Native', {
  language: S.Literal('Swift'),
})
const ReactNative = ts('ReactNative', {
  language: S.Literal('Ts'),
})

const Ios = ts('Ios', {
  framework: S.Union([Expo, Native, ReactNative]),
})
const Ipados = ts('Ipados', {
  framework: Native,
})
const Macos = ts('Macos', {
  framework: Native,
})
const Tvos = ts('Tvos', {
  framework: Native,
})

const CliCustom = ts('Custom', {
  language: S.Literal('Ts'),
})
const CliNamed = ts('Named', {
  name: S.NonEmptyString,
  language: S.Literal('Ts'),
})
const Cli = ts('Cli', {
  framework: S.Union([CliCustom, CliNamed]),
})

export const Surface = S.Union([Ios, Ipados, Macos, Tvos, Cli])
```

Each constructor prints one start string:

```text
Ios + Expo + Ts            ios/expo/ts
Ios + Expo + Js            ios/expo/js
Ios + Native + Swift       ios/native/swift
Ios + ReactNative + Ts     ios/react-native/ts
Ipados + Native + Swift    ipados/native/swift
Macos + Native + Swift     macos/native/swift
Tvos + Native + Swift      tvos/native/swift
Cli + Custom + Ts          cli/custom/ts
Cli + Named(foo) + Ts      cli/foo/ts
```

Non-captive is a CLI property. It is not a `framework` constructor.
`cli/noncaptive/ts` does not parse.

Lock-in stays a different id. `counter:level:show` is not a `Surface`.
