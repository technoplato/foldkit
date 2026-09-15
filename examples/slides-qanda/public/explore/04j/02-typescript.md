# TypeScript start prints

Start names a surface, not a lock-in. Lock-in stays `counter:level:show`.
Nest device, then only frameworks that device allows, then language.
Start always opens a new device.

```text
$ death start ios/expo/ts
started  device=ios  framework=expo  language=ts
```

```text
$ death start ios/expo/js
started  device=ios  framework=expo  language=js
```

```text
$ death start ios/react-native/ts
started  device=ios  framework=react-native  language=ts
```

```text
$ death start cli/custom/ts
started  device=cli  framework=custom  language=ts
```

A named CLI framework uses the same nest:

```text
$ death start cli/<framework>/ts
started  device=cli  framework=<framework>  language=ts
```

`cli/noncaptive/ts` is illegal. Non-captive describes a CLI, not a
framework. `macos/expo/ts` is unrepresentable.
