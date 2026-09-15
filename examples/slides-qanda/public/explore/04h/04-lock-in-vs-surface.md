# Start names a surface. A lock-in id names a scored rung.

`death start` takes a surface string. A lock-in id such as `counter:level:show` names a scored rung. Do not pass a lock-in id to start.

Surface. This is what you pass to start:

```text
$ death start ios/expo/ts
started  device=ios  framework=expo  language=ts
```

Lock-in. This is what you score. The id shape stays `counter:level:<rung>`:

```text
$ death lock-in counter:level:show
ok  id=counter:level:show  rung=show
```

`counter:level:show` is not a start string. `ios/expo/ts` is not a lock-in id.
