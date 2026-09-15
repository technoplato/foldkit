# Proposed Surface constructors

These constructors are examples to lock. They are not the 04h lock.

Nest device, then valid frameworks for that device. `macos/expo/ts` must
be unrepresentable. Native Swift covers iOS, iPadOS, macOS, and tvOS.
Non-captive is a CLI property, not a framework slot.

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
const Ipados = ts('Ipados', { framework: Native })
const Macos = ts('Macos', { framework: Native })
const Tvos = ts('Tvos', { framework: Native })

const CliCustom = ts('Custom', { language: S.Literal('Ts') })
const CliNamed = ts('Named', {
  name: S.NonEmptyString,
  language: S.Literal('Ts'),
})
const Cli = ts('Cli', {
  framework: S.Union([CliCustom, CliNamed]),
})

export const Surface = S.Union([Ios, Ipados, Macos, Tvos, Cli])
```

Printed start strings:

```text
ios/expo/ts
ios/expo/js
ios/native/swift
ios/react-native/ts
ipados/native/swift
macos/native/swift
tvos/native/swift
cli/custom/ts
cli/<framework>/ts
```

Illegal: `cli/noncaptive/ts`, `macos/expo/ts`.

Lock-in stays `counter:level:show`. Start does not take that id.
