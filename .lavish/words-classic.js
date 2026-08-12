//#region ../../packages/foldkit/dist/brand/brand.js
var e = e =>
    typeof e == 'object' &&
    !!e &&
    'sel' in e &&
    typeof e.sel == 'string' &&
    'data' in e &&
    'children' in e &&
    'text' in e &&
    'elm' in e &&
    'key' in e,
  t = (e, t) => {
    e.identity === void 0 && (e.identity = t)
  },
  n = (n, r) => {
    if (e(n)) t(n, r)
    else if (Array.isArray(n)) for (let i of n) e(i) && t(i, r)
    return n
  },
  r = (e, t) => {
    switch (t.length) {
      case 0:
        return e
      case 1:
        return t[0](e)
      case 2:
        return t[1](t[0](e))
      case 3:
        return t[2](t[1](t[0](e)))
      case 4:
        return t[3](t[2](t[1](t[0](e))))
      case 5:
        return t[4](t[3](t[2](t[1](t[0](e)))))
      case 6:
        return t[5](t[4](t[3](t[2](t[1](t[0](e))))))
      case 7:
        return t[6](t[5](t[4](t[3](t[2](t[1](t[0](e)))))))
      case 8:
        return t[7](t[6](t[5](t[4](t[3](t[2](t[1](t[0](e))))))))
      case 9:
        return t[8](t[7](t[6](t[5](t[4](t[3](t[2](t[1](t[0](e)))))))))
      default: {
        let n = e
        for (let e = 0, r = t.length; e < r; e++) n = t[e](n)
        return n
      }
    }
  },
  i = {
    pipe() {
      return r(this, arguments)
    },
  },
  a = /*#__PURE__*/ (function () {
    function e() {}
    return ((e.prototype = i), e)
  })(),
  o = function (e, t) {
    if (typeof e == 'function')
      return function () {
        return e(arguments) ? t.apply(this, arguments) : e => t(e, ...arguments)
      }
    switch (e) {
      case 0:
      case 1:
        throw RangeError(`Invalid arity ${e}`)
      case 2:
        return function (e, n) {
          return arguments.length >= 2
            ? t(e, n)
            : function (n) {
                return t(n, e)
              }
        }
      case 3:
        return function (e, n, r) {
          return arguments.length >= 3
            ? t(e, n, r)
            : function (r) {
                return t(r, e, n)
              }
        }
      default:
        return function () {
          if (arguments.length >= e) return t.apply(this, arguments)
          let n = arguments
          return function (e) {
            return t(e, ...n)
          }
        }
    }
  },
  s = e => e,
  c = e => () => e,
  l = /*#__PURE__*/ c(!0),
  u = /*#__PURE__*/ c(!1),
  d = /*#__PURE__*/ c(void 0),
  f = d
function p(e, ...t) {
  return r(e, t)
}
function m(e, t, n, r, i, a, o, s, c) {
  switch (arguments.length) {
    case 1:
      return e
    case 2:
      return function () {
        return t(e.apply(this, arguments))
      }
    case 3:
      return function () {
        return n(t(e.apply(this, arguments)))
      }
    case 4:
      return function () {
        return r(n(t(e.apply(this, arguments))))
      }
    case 5:
      return function () {
        return i(r(n(t(e.apply(this, arguments)))))
      }
    case 6:
      return function () {
        return a(i(r(n(t(e.apply(this, arguments))))))
      }
    case 7:
      return function () {
        return o(a(i(r(n(t(e.apply(this, arguments)))))))
      }
    case 8:
      return function () {
        return s(o(a(i(r(n(t(e.apply(this, arguments))))))))
      }
    case 9:
      return function () {
        return c(s(o(a(i(r(n(t(e.apply(this, arguments)))))))))
      }
  }
}
function h(e) {
  let t = /* @__PURE__ */ new WeakMap()
  return n => {
    if (t.has(n)) return t.get(n)
    let r = e(n)
    return (t.set(n, r), r)
  }
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/internal/equal.js
var g = e => {
    let t = new Set(Reflect.ownKeys(e))
    if (e.constructor === Object) return t
    e instanceof Error && t.delete('stack')
    let n = Object.getPrototypeOf(e),
      r = n
    for (; r !== null && r !== Object.prototype; ) {
      let e = Reflect.ownKeys(r)
      for (let n = 0; n < e.length; n++) t.add(e[n])
      r = Object.getPrototypeOf(r)
    }
    return (
      t.has('constructor') &&
        typeof e.constructor == 'function' &&
        n === e.constructor.prototype &&
        t.delete('constructor'),
      t
    )
  },
  _ = /*#__PURE__*/ new WeakSet()
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/Predicate.js
function v(e) {
  return typeof e == 'string'
}
function ee(e) {
  return typeof e == 'number'
}
function te(e) {
  return typeof e == 'boolean'
}
function ne(e) {
  return typeof e == 'symbol'
}
function re(e) {
  return v(e) || ee(e) || ne(e)
}
function ie(e) {
  return typeof e == 'function'
}
function ae(e) {
  return e === void 0
}
function oe(e) {
  return e !== void 0
}
function se(e) {
  return e !== null
}
function ce(e) {
  return e != null
}
function le(e) {
  return !0
}
function ue(e) {
  return typeof e == 'object' && !!e
}
function de(e) {
  return typeof e == 'object' && !!e && !Array.isArray(e)
}
function fe(e) {
  return (typeof e == 'object' && !!e) || ie(e)
}
var y = /*#__PURE__*/ o(2, (e, t) => fe(e) && t in e),
  pe = /*#__PURE__*/ o(2, (e, t) => y(e, '_tag') && e._tag === t)
function me(e) {
  return y(e, Symbol.iterator) || v(e)
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/Hash.js
var b = '~effect/interfaces/Hash',
  x = e => {
    switch (typeof e) {
      case 'number':
        return ye(e)
      case 'bigint':
        return S(e.toString(10))
      case 'boolean':
        return S(String(e))
      case 'symbol':
        return S(String(e))
      case 'string':
        return S(e)
      case 'undefined':
        return S('undefined')
      case 'function':
      case 'object':
        if (e === null) return S('null')
        if (e instanceof Date) return S(e.toISOString())
        if (e instanceof RegExp) return S(e.toString())
        {
          if (_.has(e)) return he(e)
          if (De.has(e)) return De.get(e)
          let t = ke(e, () =>
            ve(e)
              ? e[b]()
              : typeof e == 'function'
                ? he(e)
                : Array.isArray(e) || ArrayBuffer.isView(e)
                  ? Ce(e)
                  : e instanceof Map
                    ? we(e)
                    : e instanceof Set
                      ? Te(e)
                      : xe(e),
          )
          return (De.set(e, t), t)
        }
      default:
        throw Error(
          `BUG: unhandled typeof ${typeof e} - please report an issue at https://github.com/Effect-TS/effect/issues`,
        )
    }
  },
  he = e => (
    Ee.has(e) || Ee.set(e, ye(Math.floor(Math.random() * (2 ** 53 - 1)))),
    Ee.get(e)
  ),
  ge = /*#__PURE__*/ o(2, (e, t) => (e * 53) ^ t),
  _e = e => (e & 3221225471) | ((e >>> 1) & 1073741824),
  ve = e => y(e, b),
  ye = e => {
    if (e !== e) return S('NaN')
    if (e === Infinity) return S('Infinity')
    if (e === -Infinity) return S('-Infinity')
    let t = e | 0
    for (t !== e && (t ^= e * 4294967295); e > 4294967295; )
      t ^= e /= 4294967295
    return _e(t)
  },
  S = e => {
    let t = 5381,
      n = e.length
    for (; n; ) t = (t * 33) ^ e.charCodeAt(--n)
    return _e(t)
  },
  be = (e, t) => {
    let n = 12289
    for (let r of t) n ^= ge(x(r), x(e[r]))
    return _e(n)
  },
  xe = e => be(e, g(e)),
  Se = (e, t) => n => {
    let r = e
    for (let e of n) r ^= t(e)
    return _e(r)
  },
  Ce = /*#__PURE__*/ Se(6151, x),
  we = /*#__PURE__*/ Se(/*#__PURE__*/ S('Map'), ([e, t]) => ge(x(e), x(t))),
  Te = /*#__PURE__*/ Se(/*#__PURE__*/ S('Set'), x),
  Ee = /*#__PURE__*/ new WeakMap(),
  De = /*#__PURE__*/ new WeakMap(),
  Oe = /*#__PURE__*/ new WeakSet()
function ke(e, t) {
  if (Oe.has(e)) return S('[Circular]')
  Oe.add(e)
  let n = t()
  return (Oe.delete(e), n)
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/Equal.js
var C = '~effect/interfaces/Equal'
function w() {
  return arguments.length === 1
    ? e => Ae(e, arguments[0])
    : Ae(arguments[0], arguments[1])
}
function Ae(e, t) {
  if (e === t) return !0
  if (e == null || t == null) return !1
  let n = typeof e
  return n === typeof t
    ? n === 'number' && e !== e && t !== t
      ? !0
      : (n !== 'object' && n !== 'function') || _.has(e) || _.has(t)
        ? !1
        : Fe(e, t, Pe)
    : !1
}
function je(e, t, n) {
  let r = Me.has(e),
    i = Ne.has(t)
  if (r && i) return !0
  if (r || i) return !1
  ;(Me.add(e), Ne.add(t))
  let a = n()
  return (Me.delete(e), Ne.delete(t), a)
}
var Me = /*#__PURE__*/ new WeakSet(),
  Ne = /*#__PURE__*/ new WeakSet()
function Pe(e, t) {
  if (x(e) !== x(t)) return !1
  if (e instanceof Date)
    return t instanceof Date ? e.toISOString() === t.toISOString() : !1
  if (e instanceof RegExp)
    return t instanceof RegExp ? e.toString() === t.toString() : !1
  let n = We(e),
    r = We(t)
  if (n !== r) return !1
  let i = n && r
  return typeof e == 'function' && !i
    ? !1
    : je(e, t, () =>
        i
          ? e[C](t)
          : Array.isArray(e)
            ? !Array.isArray(t) || e.length !== t.length
              ? !1
              : Le(e, t)
            : ArrayBuffer.isView(e)
              ? !ArrayBuffer.isView(t) || e.byteLength !== t.byteLength
                ? !1
                : Re(e, t)
              : e instanceof Map
                ? !(t instanceof Map) || e.size !== t.size
                  ? !1
                  : Ve(e, t)
                : e instanceof Set
                  ? !(t instanceof Set) || e.size !== t.size
                    ? !1
                    : Ue(e, t)
                  : ze(e, t),
      )
}
function Fe(e, t, n) {
  let r = Ie.get(e)
  if (!r) ((r = /* @__PURE__ */ new WeakMap()), Ie.set(e, r))
  else if (r.has(t)) return r.get(t)
  let i = n(e, t)
  r.set(t, i)
  let a = Ie.get(t)
  return (
    a || ((a = /* @__PURE__ */ new WeakMap()), Ie.set(t, a)),
    a.set(e, i),
    i
  )
}
var Ie = /*#__PURE__*/ new WeakMap()
function Le(e, t) {
  for (let n = 0; n < e.length; n++) if (!Ae(e[n], t[n])) return !1
  return !0
}
function Re(e, t) {
  if (e.length !== t.length) return !1
  for (let n = 0; n < e.length; n++) if (e[n] !== t[n]) return !1
  return !0
}
function ze(e, t) {
  let n = g(e),
    r = g(t)
  if (n.size !== r.size) return !1
  for (let i of n) if (!r.has(i) || !Ae(e[i], t[i])) return !1
  return !0
}
function Be(e, t) {
  return function (n, r) {
    for (let [i, a] of n) {
      let n = !1
      for (let [o, s] of r)
        if (e(i, o) && t(a, s)) {
          n = !0
          break
        }
      if (!n) return !1
    }
    return !0
  }
}
var Ve = /*#__PURE__*/ Be(Ae, Ae)
function He(e) {
  return function (t, n) {
    for (let r of t) {
      let t = !1
      for (let i of n)
        if (e(r, i)) {
          t = !0
          break
        }
      if (!t) return !1
    }
    return !0
  }
}
var Ue = /*#__PURE__*/ He(Ae),
  We = e => y(e, C),
  Ge = () => w,
  Ke = e => (t, n) => t === n || e(t, n),
  qe = e => e.length > 0,
  Je = /*#__PURE__*/ Symbol.for('~effect/Redactable'),
  Ye = e => y(e, Je)
function Xe(e) {
  return Ye(e) ? Ze(e) : e
}
function Ze(e) {
  return e[Je](globalThis['~effect/Fiber/currentFiber']?.context ?? $e)
}
var Qe = '~effect/Fiber/currentFiber',
  $e = {
    '~effect/Context': {},
    mapUnsafe: /*#__PURE__*/ new Map(),
    pipe() {
      return r(this, arguments)
    },
  }
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/Formatter.js
function et(e, t) {
  let n = t?.space ?? 0,
    r = /* @__PURE__ */ new WeakSet(),
    i = n ? (typeof n == 'number' ? ' '.repeat(n) : n) : '',
    a = e => i.repeat(e),
    o = (e, t) => {
      let n = e?.constructor
      return n && n !== Object.prototype.constructor && n.name
        ? `${n.name}(${t})`
        : t
    },
    s = e => {
      try {
        return Reflect.ownKeys(e)
      } catch {
        return ['[ownKeys threw]']
      }
    }
  function c(e, n = 0) {
    if (Array.isArray(e)) {
      if (r.has(e)) return tt
      if ((r.add(e), !i || e.length <= 1))
        return `[${e.map(e => c(e, n)).join(',')}]`
      let t = e.map(e => c(e, n + 1)).join(',\n' + a(n + 1))
      return `[\n${a(n + 1)}${t}\n${a(n)}]`
    }
    if (e instanceof Date) return it(e)
    if (
      !t?.ignoreToString &&
      y(e, 'toString') &&
      typeof e.toString == 'function' &&
      e.toString !== Object.prototype.toString &&
      e.toString !== Array.prototype.toString
    ) {
      let t = at(e)
      return e instanceof Error && e.cause
        ? `${t} (cause: ${c(e.cause, n)})`
        : t
    }
    if (typeof e == 'string') return JSON.stringify(e)
    if (
      typeof e == 'number' ||
      e == null ||
      typeof e == 'boolean' ||
      typeof e == 'symbol'
    )
      return String(e)
    if (typeof e == 'bigint') return String(e) + 'n'
    if (typeof e == 'object' || typeof e == 'function') {
      if (r.has(e)) return tt
      if ((r.add(e), Je in e)) return et(Ze(e))
      if (Symbol.iterator in e)
        return `${e.constructor.name}(${c(Array.from(e), n)})`
      let t = s(e)
      return !i || t.length <= 1
        ? o(e, `{${t.map(t => `${nt(t)}:${c(e[t], n)}`).join(',')}}`)
        : o(
            e,
            `{\n${t.map(t => `${a(n + 1)}${nt(t)}: ${c(e[t], n + 1)}`).join(',\n')}\n${a(n)}}`,
          )
    }
    return String(e)
  }
  return c(e, 0)
}
var tt = '[Circular]'
function nt(e) {
  return typeof e == 'string' ? JSON.stringify(e) : String(e)
}
function rt(e) {
  return e.map(e => `[${nt(e)}]`).join('')
}
function it(e) {
  try {
    return e.toISOString()
  } catch {
    return 'Invalid Date'
  }
}
function at(e) {
  try {
    let t = e.toString()
    return typeof t == 'string' ? t : String(t)
  } catch {
    return '[toString threw]'
  }
}
function ot(e, t) {
  let n = []
  return JSON.stringify(
    e,
    function (e, t) {
      let r = Xe(t)
      if (typeof r != 'object' || !r) return r
      for (; n.length > 0 && n[n.length - 1] !== this; ) n.pop()
      if (!n.includes(r)) return (n.push(r), r)
    },
    t?.space,
  )
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/Inspectable.js
var st = /*#__PURE__*/ Symbol.for('nodejs.util.inspect.custom'),
  ct = e => {
    try {
      if (y(e, 'toJSON') && ie(e.toJSON) && e.toJSON.length === 0)
        return e.toJSON()
      if (Array.isArray(e)) return e.map(ct)
    } catch {
      return '[toJSON threw]'
    }
    return Xe(e)
  },
  lt = class e {
    called = !1
    self
    constructor(e) {
      this.self = e
    }
    next(e) {
      return this.called
        ? {
            value: e,
            done: !0,
          }
        : ((this.called = !0),
          {
            value: this.self,
            done: !1,
          })
    }
    [Symbol.iterator]() {
      return new e(this.self)
    }
  },
  ut = /*#__PURE__*/ (() => {
    let e = '~effect/Utils/internal',
      t = { [e]: e => e() },
      n = {
        [e]: e => {
          try {
            return e()
          } finally {
          }
        },
      }
    return t[e](() => /* @__PURE__ */ Error().stack)?.includes(e) === !0
      ? t[e]
      : n[e]
  })(),
  dt = '~effect/Effect',
  ft = '~effect/Exit',
  pt = {
    _A: s,
    _E: s,
    _R: s,
  },
  mt = `${dt}/identifier`,
  T = `${dt}/args`,
  ht = `${dt}/evaluate`,
  gt = `${dt}/successCont`,
  _t = `${dt}/failureCont`,
  vt = `${dt}/ensureCont`,
  yt = /*#__PURE__*/ Symbol.for('effect/Effect/Yield'),
  bt = {
    pipe() {
      return r(this, arguments)
    },
    toJSON() {
      return { ...this }
    },
    toString() {
      return et(this.toJSON(), {
        ignoreToString: !0,
        space: 2,
      })
    },
    [st]() {
      return this.toJSON()
    },
  },
  xt = {
    [dt]: pt,
    ...bt,
    [Symbol.iterator]() {
      return new lt(this)
    },
    toJSON() {
      return {
        _id: 'Effect',
        op: this[mt],
        ...(T in this ? { args: this[T] } : void 0),
      }
    },
  },
  St = e => y(e, dt),
  Ct = e => y(e, ft),
  wt = '~effect/Cause',
  Tt = '~effect/Cause/Reason',
  Et = e => y(e, wt),
  Dt = class {
    [wt]
    reasons
    constructor(e) {
      ;((this[wt] = wt), (this.reasons = e))
    }
    pipe() {
      return r(this, arguments)
    }
    toJSON() {
      return {
        _id: 'Cause',
        failures: this.reasons.map(e => e.toJSON()),
      }
    }
    toString() {
      return `Cause(${et(this.reasons)})`
    }
    [st]() {
      return this.toJSON()
    }
    [C](e) {
      return (
        Et(e) &&
        this.reasons.length === e.reasons.length &&
        this.reasons.every((t, n) => w(t, e.reasons[n]))
      )
    }
    [b]() {
      return Ce(this.reasons)
    }
  },
  Ot = /*#__PURE__*/ new WeakMap(),
  kt = class {
    [Tt]
    annotations
    _tag
    constructor(e, t, n) {
      if (
        ((this[Tt] = Tt),
        (this._tag = e),
        t !== At && typeof n == 'object' && n && t.size > 0)
      ) {
        let e = Ot.get(n)
        ;(e && (t = new Map([...e, ...t])), Ot.set(n, t))
      }
      this.annotations = t
    }
    annotate(e, t) {
      if (e.mapUnsafe.size === 0) return this
      let n = new Map(this.annotations)
      e.mapUnsafe.forEach((e, r) => {
        ;(t?.overwrite !== !0 && n.has(r)) || n.set(r, e)
      })
      let r = Object.assign(Object.create(Object.getPrototypeOf(this)), this)
      return ((r.annotations = n), r)
    }
    pipe() {
      return r(this, arguments)
    }
    toString() {
      return et(this)
    }
    [st]() {
      return this.toString()
    }
  },
  At = /*#__PURE__*/ new Map(),
  jt = class extends kt {
    error
    constructor(e, t = At) {
      ;(super('Fail', t, e), (this.error = e))
    }
    toString() {
      return `Fail(${et(this.error)})`
    }
    toJSON() {
      return {
        _tag: 'Fail',
        error: this.error,
      }
    }
    [C](e) {
      return (
        Lt(e) && w(this.error, e.error) && w(this.annotations, e.annotations)
      )
    }
    [b]() {
      return ge(S(this._tag))(ge(x(this.error))(x(this.annotations)))
    }
  },
  Mt = e => new Dt(e),
  Nt = e => new Dt([new jt(e)]),
  Pt = class extends kt {
    defect
    constructor(e, t = At) {
      ;(super('Die', t, e), (this.defect = e))
    }
    toString() {
      return `Die(${et(this.defect)})`
    }
    toJSON() {
      return {
        _tag: 'Die',
        defect: this.defect,
      }
    }
    [C](e) {
      return (
        Rt(e) && w(this.defect, e.defect) && w(this.annotations, e.annotations)
      )
    }
    [b]() {
      return ge(S(this._tag))(ge(x(this.defect))(x(this.annotations)))
    }
  },
  Ft = e => new Dt([new Pt(e)]),
  It = /*#__PURE__*/ o(
    e => Et(e[0]),
    (e, t, n) =>
      t.mapUnsafe.size === 0 ? e : new Dt(e.reasons.map(e => e.annotate(t, n))),
  ),
  Lt = e => e._tag === 'Fail',
  Rt = e => e._tag === 'Die',
  zt = e => e._tag === 'Interrupt'
function Bt(e) {
  return Jt('Effect.evaluate: Not implemented')
}
var Vt = e => ({
    ...xt,
    [mt]: e.op,
    [ht]: e[ht] ?? Bt,
    [gt]: e[gt],
    [_t]: e[_t],
    [vt]: e[vt],
  }),
  Ht = e => {
    let t = Vt(e)
    return function () {
      let n = Object.create(t)
      return ((n[T] = e.single === !1 ? arguments : arguments[0]), n)
    }
  },
  Ut = e => {
    let t = {
      ...Vt(e),
      [ft]: ft,
      _tag: e.op,
      get [e.prop]() {
        return this[T]
      },
      toString() {
        return `${e.op}(${et(this[T])})`
      },
      toJSON() {
        return {
          _id: 'Exit',
          _tag: e.op,
          [e.prop]: this[T],
        }
      },
      [C](e) {
        return Ct(e) && e._tag === this._tag && w(this[T], e[T])
      },
      [b]() {
        return ge(S(e.op), x(this[T]))
      },
    }
    return function (e) {
      let n = Object.create(t)
      return ((n[T] = e), n)
    }
  },
  E = /*#__PURE__*/ Ut({
    op: 'Success',
    prop: 'value',
    [ht](e) {
      let t = e.getCont(gt)
      return t ? t[gt](this[T], e, this) : e.yieldWith(this)
    },
  }),
  Wt = { key: 'effect/Cause/StackTrace' },
  Gt = { key: 'effect/Cause/InterruptorStackTrace' },
  Kt = /*#__PURE__*/ Ut({
    op: 'Failure',
    prop: 'cause',
    [ht](e) {
      let t = this[T],
        n = !1
      e.currentStackFrame &&
        ((t = It(t, { mapUnsafe: new Map([[Wt.key, e.currentStackFrame]]) })),
        (n = !0))
      let r = e.getCont(_t)
      for (; e.interruptible && e._interruptedCause && r; ) r = e.getCont(_t)
      return r ? r[_t](t, e, n ? void 0 : this) : e.yieldWith(n ? this : Kt(t))
    },
  }),
  qt = e => Kt(Nt(e)),
  Jt = e => Kt(Ft(e)),
  D = /*#__PURE__*/ Ht({
    op: 'WithFiber',
    [ht](e) {
      return this[T](e)
    },
  }),
  Yt = /*#__PURE__*/ (function () {
    class e extends globalThis.Error {}
    let t = /*#__PURE__*/ Vt({
      op: 'YieldableError',
      [ht]() {
        return qt(this)
      },
    })
    return (delete t.toString, Object.assign(e.prototype, t), e)
  })(),
  Xt = /*#__PURE__*/ (function () {
    let e = /*#__PURE__*/ Symbol.for('effect/Data/Error/plainArgs')
    return class extends Yt {
      constructor(t) {
        ;(super(t?.message, t?.cause ? { cause: t.cause } : void 0),
          t &&
            (Object.assign(this, t),
            Object.defineProperty(this, e, {
              value: t,
              enumerable: !1,
            })))
      }
      toJSON() {
        return {
          ...this[e],
          ...this,
        }
      }
    }
  })(),
  Zt = e => {
    class t extends Xt {
      _tag = e
    }
    return ((t.prototype.name = e), t)
  }
Zt('NoSuchElementError')
var Qt = '~effect/Cause/Done',
  $t = e => y(e, Qt),
  en = {
    [Qt]: Qt,
    _tag: 'Done',
    value: void 0,
  },
  tn = e =>
    e === void 0
      ? en
      : {
          [Qt]: Qt,
          _tag: 'Done',
          value: e,
        },
  nn = /*#__PURE__*/ qt(en),
  rn = e => (e === void 0 ? nn : qt(tn(e))),
  an = '~effect/data/Option',
  on = {
    [an]: { _A: e => e },
    ...bt,
    [Symbol.iterator]() {
      return new lt(this)
    },
  },
  sn = /*#__PURE__*/ Object.defineProperty(
    /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(on), {
      _tag: 'Some',
      _op: 'Some',
      [C](e) {
        return un(e) && fn(e) && w(this.value, e.value)
      },
      [b]() {
        return ge(x(this._tag))(x(this.value))
      },
      toString() {
        return `some(${et(this.value)})`
      },
      toJSON() {
        return {
          _id: 'Option',
          _tag: this._tag,
          value: ct(this.value),
        }
      },
    }),
    'valueOrUndefined',
    {
      get() {
        return this.value
      },
    },
  ),
  cn = /*#__PURE__*/ x('None'),
  ln = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(on), {
    _tag: 'None',
    _op: 'None',
    valueOrUndefined: void 0,
    [C](e) {
      return un(e) && dn(e)
    },
    [b]() {
      return cn
    },
    toString() {
      return 'none()'
    },
    toJSON() {
      return {
        _id: 'Option',
        _tag: this._tag,
      }
    },
  }),
  un = e => y(e, an),
  dn = e => e._tag === 'None',
  fn = e => e._tag === 'Some',
  pn = /*#__PURE__*/ Object.create(ln),
  mn = e => {
    let t = Object.create(sn)
    return ((t.value = e), t)
  },
  hn = '~effect/data/Result',
  gn = {
    [hn]: {
      /* v8 ignore next 2 */
      _A: e => e,
      _E: e => e,
    },
    ...bt,
    [Symbol.iterator]() {
      return new lt(this)
    },
  },
  _n = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(gn), {
    _tag: 'Success',
    _op: 'Success',
    [C](e) {
      return yn(e) && xn(e) && w(this.success, e.success)
    },
    [b]() {
      return ge(x(this._tag))(x(this.success))
    },
    toString() {
      return `success(${et(this.success)})`
    },
    toJSON() {
      return {
        _id: 'Result',
        _tag: this._tag,
        value: ct(this.success),
      }
    },
  }),
  vn = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(gn), {
    _tag: 'Failure',
    _op: 'Failure',
    [C](e) {
      return yn(e) && bn(e) && w(this.failure, e.failure)
    },
    [b]() {
      return ge(x(this._tag))(x(this.failure))
    },
    toString() {
      return `failure(${et(this.failure)})`
    },
    toJSON() {
      return {
        _id: 'Result',
        _tag: this._tag,
        failure: ct(this.failure),
      }
    },
  }),
  yn = e => y(e, hn),
  bn = e => e._tag === 'Failure',
  xn = e => e._tag === 'Success',
  Sn = e => {
    let t = Object.create(vn)
    return ((t.failure = e), t)
  },
  Cn = e => {
    let t = Object.create(_n)
    return ((t.success = e), t)
  }
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/Order.js
function wn(e) {
  return (t, n) => (t === n ? 0 : e(t, n))
}
var Tn = /*#__PURE__*/ wn((e, t) =>
    globalThis.Number.isNaN(e) && globalThis.Number.isNaN(t)
      ? 0
      : globalThis.Number.isNaN(e)
        ? -1
        : globalThis.Number.isNaN(t)
          ? 1
          : e < t
            ? -1
            : 1,
  ),
  En = /*#__PURE__*/ o(2, (e, t) => wn((n, r) => e(t(n), t(r)))),
  Dn = e => o(2, (t, n) => e(t, n) === 1),
  On = e => o(2, (t, n) => e(t, n) !== -1),
  O = () => pn,
  k = mn,
  kn = un,
  A = dn,
  j = fn,
  M = /*#__PURE__*/ o(2, (e, { onNone: t, onSome: n }) =>
    A(e) ? t() : n(e.value),
  ),
  An = /*#__PURE__*/ o(2, (e, t) => (A(e) ? t() : e.value)),
  jn = e => (e == null ? O() : k(e)),
  Mn = /*#__PURE__*/ An(d),
  Nn = /*#__PURE__*/ /* @__PURE__ */ o(2, (e, t) => {
    if (j(e)) return e.value
    throw t()
  })(() => /* @__PURE__ */ Error('getOrThrow called on a None')),
  Pn = /*#__PURE__*/ o(2, (e, t) => (A(e) ? O() : k(t(e.value)))),
  Fn = /*#__PURE__*/ o(2, (e, t) => (A(e) ? O() : t(e.value))),
  In = e => (A(e) ? [] : [e.value]),
  Ln = /*#__PURE__*/ o(2, (e, t) =>
    A(e) ? O() : t(e.value) ? k(e.value) : O(),
  ),
  Rn = e => Ke((t, n) => (A(t) ? A(n) : A(n) ? !1 : e(t.value, n.value))),
  zn = /*#__PURE__*/ o(2, (e, t) => (t(e) ? k(e) : O())),
  Bn = Cn,
  Vn = Sn,
  Hn = yn,
  Un = bn,
  Wn = xn,
  Gn = e => {
    let t = e[Symbol.iterator]().next()
    if (t.done) throw Error('headUnsafe: empty iterable')
    return t.value
  },
  Kn = /*#__PURE__*/ o(2, (e, t) => {
    let n = 0
    for (let r of e) {
      let e = t(r, n)
      if (te(e)) {
        if (e) return k(r)
      } else if (j(e)) return e
      n++
    }
    return O()
  }),
  qn = Object.fromEntries,
  Jn = /*#__PURE__*/ o(2, (e, t) => {
    let n = []
    for (let r of $n(e)) n.push(t(r, e[r]))
    return n
  }),
  Yn = /*#__PURE__*/ Jn((e, t) => [e, t]),
  Xn = /*#__PURE__*/ o(2, (e, t) => Object.hasOwn(e, t)),
  Zn = /*#__PURE__*/ o(2, (e, t) => (Xn(e, t) ? k(e[t]) : O())),
  Qn = /*#__PURE__*/ o(2, (e, t) => {
    let n = { ...e }
    for (let r of $n(e)) n[r] = t(e[r], r)
    return n
  }),
  $n = e => Object.keys(e),
  er = e => Jn(e, (e, t) => t),
  tr = (e, t) => ({ [e]: t }),
  nr = globalThis.Array,
  rr = /*#__PURE__*/ o(2, (e, t) => {
    let n = Math.max(1, Math.floor(e)),
      r = new nr(n)
    for (let e = 0; e < n; e++) r[e] = t(e)
    return r
  }),
  ir = (e, t) => (e <= t ? rr(t - e + 1, t => e + t) : [e]),
  ar = e => (nr.isArray(e) ? e : nr.from(e)),
  or = /*#__PURE__*/ o(2, (e, { onEmpty: t, onNonEmpty: n }) =>
    mr(e) ? n(e) : t(),
  ),
  sr = /*#__PURE__*/ o(2, (e, { onEmpty: t, onNonEmpty: n }) =>
    mr(e) ? n(vr(e), xr(e)) : t(),
  ),
  cr = /*#__PURE__*/ o(2, (e, t) => [t, ...e]),
  lr = /*#__PURE__*/ o(2, (e, t) => [...e, t]),
  ur = /*#__PURE__*/ o(2, (e, t) => ar(e).concat(ar(t))),
  dr = nr.isArray,
  fr = e => e.length === 0,
  pr = qe,
  mr = qe
function hr(e, t) {
  return e < 0 || e >= t.length
}
var gr = (e, t) => Math.floor(Math.min(Math.max(0, e), t.length)),
  _r = /*#__PURE__*/ o(2, (e, t) => {
    let n = Math.floor(t)
    return hr(n, e) ? O() : k(e[n])
  }),
  vr = /*#__PURE__*/ /* @__PURE__ */ o(2, (e, t) => {
    let n = Math.floor(t)
    if (hr(n, e)) throw Error(`Index out of bounds: ${n}`)
    return e[n]
  })(0),
  yr = e => (mr(e) ? k(br(e)) : O()),
  br = e => e[e.length - 1],
  xr = e => e.slice(1),
  Sr = /*#__PURE__*/ o(2, (e, t) => {
    let n = ar(e)
    return n.slice(0, gr(t, n))
  }),
  Cr = /*#__PURE__*/ o(2, (e, t) => {
    let n = ar(e),
      r = gr(t, n)
    return r === 0 ? [] : n.slice(-r)
  }),
  wr = /*#__PURE__*/ o(2, (e, t) => {
    let n = ar(e)
    return n.slice(gr(t, n), n.length)
  }),
  Tr = /*#__PURE__*/ o(2, (e, t) => {
    let n = 0
    for (let r of e) {
      if (t(r, n)) return k(n)
      n++
    }
    return O()
  }),
  Er = Kn,
  Dr = /*#__PURE__*/ o(2, (e, t) => {
    let n = ar(e)
    for (let e = n.length - 1; e >= 0; e--) {
      let r = n[e],
        i = t(r, e)
      if (typeof i == 'boolean') {
        if (i) return k(r)
      } else if (j(i)) return i
    }
    return O()
  }),
  Or = /*#__PURE__*/ (e =>
    o(2, (t, n) => {
      for (let r of t) if (e(n, r)) return !0
      return !1
    }))(/*#__PURE__*/ Ge()),
  kr = /*#__PURE__*/ o(3, (e, t, n) => {
    let r = ar(e),
      i = ar(t)
    return mr(r) ? (mr(i) ? Rr(n)(ur(r, i)) : r) : i
  }),
  Ar = /*#__PURE__*/ o(2, (e, t) => kr(e, t, Ge())),
  jr = () => [],
  Mr = e => [e],
  Nr = /*#__PURE__*/ o(2, (e, t) => e.map(t)),
  Pr = /*#__PURE__*/ o(2, (e, t) => {
    let n = ar(e),
      r = []
    for (let e = 0; e < n.length; e++) t(n[e], e) && r.push(n[e])
    return r
  }),
  Fr = /*#__PURE__*/ o(3, (e, t, n) =>
    ar(e).reduce((e, t, r) => n(e, t, r), t),
  ),
  Ir = /*#__PURE__*/ o(2, (e, t) => e.some(t)),
  Lr = /*#__PURE__*/ o(2, (e, t) => ar(e).forEach((e, n) => t(e, n))),
  Rr = /*#__PURE__*/ o(2, (e, t) => {
    let n = ar(e)
    if (mr(n)) {
      let e = [vr(n)],
        r = xr(n)
      for (let n of r) e.every(e => !t(n, e)) && e.push(n)
      return e
    }
    return []
  }),
  zr = /*#__PURE__*/ o(2, (e, t) => ar(e).join(t)),
  Br = '~effect/BigDecimal',
  Vr = {
    [Br]: Br,
    [b]() {
      let e = Jr(this)
      return ge(x(e.value), ye(e.scale))
    },
    [C](e) {
      return Hr(e) && Qr(this, e)
    },
    toString() {
      return `BigDecimal(${$r(this)})`
    },
    toJSON() {
      return {
        _id: 'BigDecimal',
        value: String(this.value),
        scale: this.scale,
      }
    },
    [st]() {
      return this.toJSON()
    },
    pipe() {
      return r(this, arguments)
    },
  },
  Hr = e => y(e, Br),
  Ur = (e, t) => {
    let n = Object.create(Vr)
    return ((n.value = e), (n.scale = t), n)
  },
  Wr = (e, t) => {
    if (e !== Gr && e % Kr === Gr) throw RangeError('Value must be normalized')
    let n = Ur(e, t)
    return ((n.normalized = n), n)
  },
  Gr = /*#__PURE__*/ BigInt(0),
  Kr = /*#__PURE__*/ BigInt(10),
  qr = /*#__PURE__*/ Wr(Gr, 0),
  Jr = e => {
    if (e.normalized === void 0)
      if (e.value === Gr) e.normalized = qr
      else {
        let t = `${e.value}`,
          n = 0
        for (let e = t.length - 1; e >= 0 && t[e] === '0'; e--) n++
        ;(n === 0 && (e.normalized = e),
          (e.normalized = Wr(
            BigInt(t.substring(0, t.length - n)),
            e.scale - n,
          )))
      }
    return e.normalized
  },
  Yr = /*#__PURE__*/ o(2, (e, t) =>
    t > e.scale
      ? Ur(e.value * Kr ** BigInt(t - e.scale), t)
      : t < e.scale
        ? Ur(e.value / Kr ** BigInt(e.scale - t), t)
        : e,
  ),
  Xr = e => (e.value < Gr ? Ur(-e.value, e.scale) : e),
  Zr = /*#__PURE__*/ Ke((e, t) =>
    e.scale > t.scale
      ? Yr(t, e.scale).value === e.value
      : e.scale < t.scale
        ? Yr(e, t.scale).value === t.value
        : e.value === t.value,
  ),
  Qr = /*#__PURE__*/ o(2, (e, t) => Zr(e, t)),
  $r = e => {
    let t = Jr(e)
    if (Math.abs(t.scale) >= 16) return ei(t)
    let n = t.value < Gr,
      r = n ? `${t.value}`.substring(1) : `${t.value}`,
      i,
      a
    if (t.scale >= r.length)
      ((i = '0'), (a = '0'.repeat(t.scale - r.length) + r))
    else {
      let e = r.length - t.scale
      if (e > r.length) {
        let t = e - r.length
        ;((i = `${r}${'0'.repeat(t)}`), (a = ''))
      } else ((a = r.slice(e)), (i = r.slice(0, e)))
    }
    let o = a === '' ? i : `${i}.${a}`
    return n ? `-${o}` : o
  },
  ei = e => {
    if (ti(e)) return '0e+0'
    let t = Jr(e),
      n = `${Xr(t).value}`,
      r = n.slice(0, 1),
      i = n.slice(1),
      a = `${ni(t) ? '-' : ''}${r}`
    i !== '' && (a += `.${i}`)
    let o = i.length - t.scale
    return `${a}e${o >= 0 ? '+' : ''}${o}`
  },
  ti = e => e.value === Gr,
  ni = e => e.value < Gr,
  ri = e =>
    Vt({
      op: e.label,
      [ht]: e.evaluate,
    }),
  ii = Object.getOwnPropertyDescriptor,
  ai = Object.prototype.hasOwnProperty,
  oi = Object.isExtensible,
  si = /*#__PURE__*/ (() => {
    let e = ii(Error, 'stackTraceLimit')
    return e === void 0
      ? oi(Error)
      : ai.call(e, 'writable')
        ? e.writable === !0
        : e.set !== void 0
  })(),
  ci = () => Error.stackTraceLimit,
  li = e => {
    si && (Error.stackTraceLimit = e)
  },
  ui = '~effect/Context/Service',
  di = function () {
    let e = ci()
    li(2)
    let t = /* @__PURE__ */ Error()
    li(e)
    function n() {}
    let r = n
    return (
      Object.setPrototypeOf(r, fi),
      Object.defineProperty(r, 'stack', {
        get() {
          return t.stack
        },
      }),
      arguments.length > 0
        ? ((r.key = arguments[0]),
          arguments[1]?.defaultValue &&
            ((r[pi] = pi), (r.defaultValue = arguments[1].defaultValue)),
          r)
        : function (e, t) {
            return ((r.key = e), t?.make && (r.make = t.make), r)
          }
    )
  },
  fi = {
    [ui]: ui,
    .../*#__PURE__*/ ri({
      label: 'Service',
      evaluate(e) {
        return E(Ti(e.context, this))
      },
    }),
    toJSON() {
      return {
        _id: 'Service',
        key: this.key,
        stack: this.stack,
      }
    },
    of(e) {
      return e
    },
    context(e) {
      return xi(this, e)
    },
    use(e) {
      return D(t => e(Ti(t.context, this)))
    },
    useSync(e) {
      return D(t => E(e(Ti(t.context, this))))
    },
  },
  pi = '~effect/Context/Reference',
  mi = '~effect/Context',
  hi = e => {
    let t = Object.create(gi)
    return ((t.mapUnsafe = e), (t.mutable = !1), t)
  },
  gi = {
    ...bt,
    [mi]: { _Services: e => e },
    toJSON() {
      return {
        _id: 'Context',
        services: Array.from(this.mapUnsafe).map(([e, t]) => ({
          key: e,
          value: t,
        })),
      }
    },
    [C](e) {
      if (!_i(e) || this.mapUnsafe.size !== e.mapUnsafe.size) return !1
      for (let t of this.mapUnsafe.keys())
        if (
          !e.mapUnsafe.has(t) ||
          !w(this.mapUnsafe.get(t), e.mapUnsafe.get(t))
        )
          return !1
      return !0
    },
    [b]() {
      return ye(this.mapUnsafe.size)
    },
  },
  _i = e => y(e, mi),
  vi = e => y(e, pi),
  yi = () => bi,
  bi = /*#__PURE__*/ hi(/*#__PURE__*/ new Map()),
  xi = (e, t) => hi(new Map([[e.key, t]])),
  Si = /*#__PURE__*/ o(3, (e, t, n) =>
    Ni(e, e => {
      e.set(t.key, n)
    }),
  ),
  Ci = /*#__PURE__*/ o(2, (e, t) => e.mapUnsafe.get(t.key)),
  wi = /*#__PURE__*/ o(2, (e, t) => {
    if (!e.mapUnsafe.has(t.key)) {
      if (pi in t) return Oi(t)
      throw ki(t)
    }
    return e.mapUnsafe.get(t.key)
  }),
  Ti = wi,
  Ei = (e, t) => (e.mapUnsafe.has(t.key) ? e.mapUnsafe.get(t.key) : Oi(t)),
  Di = '~effect/Context/defaultValue',
  Oi = e => (Di in e ? e[Di] : (e[Di] = e.defaultValue())),
  ki = e => {
    let t = /* @__PURE__ */ Error(
      `Service not found${e.key ? `: ${String(e.key)}` : ''}`,
    )
    if (e.stack) {
      let n = e.stack.split('\n')
      if (n.length > 2) {
        let e = n[2].match(/at (.*)/)
        e && (t.message += ` (defined at ${e[1]})`)
      }
    }
    if (t.stack) {
      let e = t.stack.split('\n')
      ;(e.splice(1, 3), (t.stack = e.join('\n')))
    }
    return t
  },
  Ai = /*#__PURE__*/ o(2, (e, t) =>
    e.mapUnsafe.has(t.key) ? k(e.mapUnsafe.get(t.key)) : vi(t) ? k(Oi(t)) : O(),
  ),
  ji = /*#__PURE__*/ o(2, (e, t) =>
    e.mapUnsafe.size === 0
      ? t
      : t.mapUnsafe.size === 0
        ? e
        : Ni(e, e => {
            t.mapUnsafe.forEach((t, n) => e.set(n, t))
          }),
  ),
  Mi = (...e) => {
    let t = /* @__PURE__ */ new Map()
    for (let n = 0; n < e.length; n++)
      e[n].mapUnsafe.forEach((e, n) => {
        t.set(n, e)
      })
    return hi(t)
  },
  Ni = (e, t) => {
    if (e.mutable) return (t(e.mapUnsafe), e)
    let n = new Map(e.mapUnsafe)
    return (t(n), hi(n))
  },
  Pi = di,
  Fi = '~effect/time/Duration',
  Ii = /*#__PURE__*/ BigInt(0),
  Li = /*#__PURE__*/ BigInt(1),
  Ri = /*#__PURE__*/ BigInt(1e3),
  zi = e => BigInt(e < 0 ? Math.ceil(e - 0.5) : Math.floor(e + 0.5)),
  Bi = e => zi(e * 1e6),
  Vi = (e, t) => (e.includes('.') ? zi(Number(e) * Number(t)) : BigInt(e) * t),
  Hi =
    /^(-?\d+(?:\.\d+)?)\s+(nanos?|micros?|millis?|seconds?|minutes?|hours?|days?|weeks?)$/,
  Ui = e => {
    switch (typeof e) {
      case 'number':
        return ta(e)
      case 'bigint':
        return ea(e)
      case 'string': {
        if (e === 'Infinity') return Qi
        if (e === '-Infinity') return $i
        let t = Hi.exec(e)
        if (!t) break
        let [n, r, i] = t
        if (i === 'nano' || i === 'nanos') return ea(Vi(r, Li))
        if (i === 'micro' || i === 'micros') return ea(Vi(r, Ri))
        let a = Number(r)
        switch (i) {
          case 'milli':
          case 'millis':
            return ta(a)
          case 'second':
          case 'seconds':
            return na(a)
          case 'minute':
          case 'minutes':
            return ra(a)
          case 'hour':
          case 'hours':
            return ia(a)
          case 'day':
          case 'days':
            return aa(a)
          case 'week':
          case 'weeks':
            return oa(a)
        }
        break
      }
      case 'object': {
        if (e === null) break
        if (Fi in e) return e
        if (Array.isArray(e))
          return e.length !== 2 || !e.every(ee)
            ? Wi(e)
            : Number.isNaN(e[0]) || Number.isNaN(e[1])
              ? Zi
              : e[0] === -Infinity || e[1] === -Infinity
                ? $i
                : e[0] === Infinity || e[1] === Infinity
                  ? Qi
                  : Yi(zi(e[0] * 1e9 + e[1]))
        let t = e,
          n = 0
        return (
          t.weeks && (n += t.weeks * 6048e5),
          t.days && (n += t.days * 864e5),
          t.hours && (n += t.hours * 36e5),
          t.minutes && (n += t.minutes * 6e4),
          t.seconds && (n += t.seconds * 1e3),
          t.milliseconds && (n += t.milliseconds),
          !t.microseconds && !t.nanoseconds
            ? Yi(n)
            : Yi(
                zi(
                  n * 1e6 + (t.microseconds ?? 0) * 1e3 + (t.nanoseconds ?? 0),
                ),
              )
        )
      }
    }
    return Wi(e)
  },
  Wi = e => {
    throw Error(`Invalid Input: ${e}`)
  },
  Gi = {
    _tag: 'Millis',
    millis: 0,
  },
  Ki = { _tag: 'Infinity' },
  qi = { _tag: 'NegativeInfinity' },
  Ji = {
    [Fi]: Fi,
    [b]() {
      return xe(this.value)
    },
    [C](e) {
      return Xi(e) && fa(this, e)
    },
    toString() {
      switch (this.value._tag) {
        case 'Infinity':
          return 'Infinity'
        case 'NegativeInfinity':
          return '-Infinity'
        case 'Nanos':
          return `${this.value.nanos} nanos`
        case 'Millis':
          return `${this.value.millis} millis`
      }
    },
    toJSON() {
      switch (this.value._tag) {
        case 'Millis':
          return {
            _id: 'Duration',
            _tag: 'Millis',
            millis: this.value.millis,
          }
        case 'Nanos':
          return {
            _id: 'Duration',
            _tag: 'Nanos',
            nanos: String(this.value.nanos),
          }
        case 'Infinity':
          return {
            _id: 'Duration',
            _tag: 'Infinity',
          }
        case 'NegativeInfinity':
          return {
            _id: 'Duration',
            _tag: 'NegativeInfinity',
          }
      }
    },
    [st]() {
      return this.toJSON()
    },
    pipe() {
      return r(this, arguments)
    },
  },
  Yi = e => {
    let t = Object.create(Ji)
    return (
      typeof e == 'number'
        ? isNaN(e) || e === 0 || Object.is(e, -0)
          ? (t.value = Gi)
          : Number.isFinite(e)
            ? Number.isInteger(e)
              ? (t.value = {
                  _tag: 'Millis',
                  millis: e,
                })
              : (t.value = {
                  _tag: 'Nanos',
                  nanos: Bi(e),
                })
            : (t.value = e > 0 ? Ki : qi)
        : e === Ii
          ? (t.value = Gi)
          : (t.value = {
              _tag: 'Nanos',
              nanos: e,
            }),
      t
    )
  },
  Xi = e => y(e, Fi),
  Zi = /*#__PURE__*/ Yi(0),
  Qi = /*#__PURE__*/ Yi(Infinity),
  $i = /*#__PURE__*/ Yi(-Infinity),
  ea = e => Yi(e),
  ta = e => Yi(e),
  na = e => Yi(e * 1e3),
  ra = e => Yi(e * 6e4),
  ia = e => Yi(e * 36e5),
  aa = e => Yi(e * 864e5),
  oa = e => Yi(e * 6048e5),
  sa = e =>
    la(Ui(e), {
      onMillis: s,
      onNanos: e => Number(e) / 1e6,
      onInfinity: () => Infinity,
      onNegativeInfinity: () => -Infinity,
    }),
  ca = e => {
    let t = Ui(e)
    switch (t.value._tag) {
      case 'Infinity':
      case 'NegativeInfinity':
        throw Error('Cannot convert infinite duration to nanos')
      case 'Nanos':
        return t.value.nanos
      case 'Millis':
        return Bi(t.value.millis)
    }
  },
  la = /*#__PURE__*/ o(2, (e, t) => {
    switch (e.value._tag) {
      case 'Millis':
        return t.onMillis(e.value.millis)
      case 'Nanos':
        return t.onNanos(e.value.nanos)
      case 'Infinity':
        return t.onInfinity()
      case 'NegativeInfinity':
        return (t.onNegativeInfinity ?? t.onInfinity)()
    }
  }),
  ua = /*#__PURE__*/ o(3, (e, t, n) =>
    e.value._tag === 'Infinity' ||
    e.value._tag === 'NegativeInfinity' ||
    t.value._tag === 'Infinity' ||
    t.value._tag === 'NegativeInfinity'
      ? n.onInfinity(e, t)
      : e.value._tag === 'Millis'
        ? t.value._tag === 'Millis'
          ? n.onMillis(e.value.millis, t.value.millis)
          : n.onNanos(ca(e), t.value.nanos)
        : n.onNanos(e.value.nanos, ca(t)),
  ),
  da = (e, t) =>
    ua(e, t, {
      onMillis: (e, t) => e === t,
      onNanos: (e, t) => e === t,
      onInfinity: (e, t) => e.value._tag === t.value._tag,
    }),
  fa = /*#__PURE__*/ o(2, (e, t) => da(e, t)),
  pa = /*#__PURE__*/ o(2, (e, t) => n => {
    let r = e(n)
    if (Un(r)) return Vn(n)
    let i = t(r.success)
    return Un(i) ? Vn(n) : i
  }),
  ma = /*#__PURE__*/ Pi('effect/Scheduler', { defaultValue: () => new _a() }),
  ha =
    'setImmediate' in globalThis
      ? e => {
          let t = globalThis.setImmediate(e)
          return () => globalThis.clearImmediate(t)
        }
      : e => {
          let t = setTimeout(e, 0)
          return () => clearTimeout(t)
        },
  ga = class {
    buckets = []
    scheduleTask(e, t) {
      let n = this.buckets,
        r = n.length,
        i,
        a = 0
      for (; a < r && !(n[a][0] > t); a++) i = n[a]
      i && i[0] === t
        ? i[1].push(e)
        : a === r
          ? n.push([t, [e]])
          : n.splice(a, 0, [t, [e]])
    }
    drain() {
      let e = this.buckets
      return ((this.buckets = []), e)
    }
  },
  _a = class {
    executionMode
    setImmediate
    constructor(e = 'async', t = ha) {
      ;((this.executionMode = e), (this.setImmediate = t))
    }
    shouldYield(e) {
      return e.currentOpCount >= e.maxOpsBeforeYield
    }
    makeDispatcher() {
      return new va(this.setImmediate)
    }
  },
  va = class {
    tasks = /*#__PURE__*/ new ga()
    running = void 0
    setImmediate
    constructor(e = ha) {
      this.setImmediate = e
    }
    scheduleTask(e, t) {
      ;(this.tasks.scheduleTask(e, t),
        this.running === void 0 &&
          (this.running = this.setImmediate(this.afterScheduled)))
    }
    afterScheduled = () => {
      ;((this.running = void 0), this.runTasks())
    }
    runTasks() {
      let e = this.tasks.drain()
      for (let t = 0; t < e.length; t++) {
        let n = e[t][1]
        for (let e = 0; e < n.length; e++) n[e]()
      }
    }
    flush() {
      for (; this.tasks.buckets.length > 0; )
        (this.running !== void 0 && (this.running(), (this.running = void 0)),
          this.runTasks())
    }
  },
  ya = /*#__PURE__*/ Pi('effect/Scheduler/MaxOpsBeforeYield', {
    defaultValue: () => 2048,
  }),
  ba = /*#__PURE__*/ Pi('effect/Scheduler/PreventSchedulerYield', {
    defaultValue: () => !1,
  }),
  xa = 'effect/Tracer/ParentSpan',
  Sa = class extends di()(xa) {},
  Ca = e => e,
  wa = /*#__PURE__*/ Pi('effect/Tracer/DisablePropagation', {
    defaultValue: u,
  }),
  Ta = /*#__PURE__*/ Pi('effect/Tracer/CurrentTraceLevel', {
    defaultValue: () => 'Info',
  }),
  Ea = /*#__PURE__*/ Pi('effect/Tracer/MinimumTraceLevel', {
    defaultValue: () => 'All',
  }),
  Da = 'effect/Tracer',
  Oa = /*#__PURE__*/ Pi(Da, {
    defaultValue: () => Ca({ span: e => new ka(e) }),
  }),
  ka = class {
    _tag = 'Span'
    spanId
    traceId = 'native'
    sampled
    name
    parent
    annotations
    links
    startTime
    kind
    status
    attributes
    events = []
    constructor(e) {
      ;((this.name = e.name),
        (this.parent = e.parent),
        (this.annotations = e.annotations),
        (this.links = e.links),
        (this.startTime = e.startTime),
        (this.kind = e.kind),
        (this.sampled = e.sampled),
        (this.status = {
          _tag: 'Started',
          startTime: e.startTime,
        }),
        (this.attributes = /* @__PURE__ */ new Map()),
        (this.traceId = Mn(e.parent)?.traceId ?? Aa(32)),
        (this.spanId = Aa(16)))
    }
    end(e, t) {
      this.status = {
        _tag: 'Ended',
        endTime: e,
        exit: t,
        startTime: this.status.startTime,
      }
    }
    attribute(e, t) {
      this.attributes.set(e, t)
    }
    event(e, t, n) {
      this.events.push([e, t, n ?? {}])
    }
    addLinks(e) {
      this.links.push(...e)
    }
  },
  Aa = /*#__PURE__*/ (function () {
    return function (e) {
      let t = ''
      for (let n = 0; n < e; n++)
        t += 'abcdef0123456789'.charAt(Math.floor(Math.random() * 16))
      return t
    }
  })(),
  ja = 'effect/observability/Metric/FiberRuntimeMetricsKey',
  Ma = /*#__PURE__*/ Pi('effect/References/CurrentConcurrency', {
    defaultValue: () => 'unbounded',
  }),
  Na = /*#__PURE__*/ Pi('effect/References/CurrentStackFrame', {
    defaultValue: d,
  }),
  Pa = /*#__PURE__*/ Pi('effect/References/TracerEnabled', { defaultValue: l }),
  Fa = /*#__PURE__*/ Pi('effect/References/TracerTimingEnabled', {
    defaultValue: l,
  }),
  Ia = /*#__PURE__*/ Pi('effect/References/TracerSpanAnnotations', {
    defaultValue: () => ({}),
  }),
  La = /*#__PURE__*/ Pi('effect/References/TracerSpanLinks', {
    defaultValue: () => [],
  }),
  Ra = /*#__PURE__*/ Pi('effect/References/CurrentLogLevel', {
    defaultValue: () => 'Info',
  }),
  za = /*#__PURE__*/ Pi('effect/References/MinimumLogLevel', {
    defaultValue: () => 'Info',
  }),
  Ba = e => {
    if (
      e?.captureStackTrace === !1 ||
      (e?.captureStackTrace !== void 0 &&
        typeof e.captureStackTrace != 'boolean')
    )
      return e
    let t = ci()
    li(3)
    let n = /* @__PURE__ */ Error()
    return (
      li(t),
      {
        ...e,
        captureStackTrace: Va(() => n.stack),
      }
    )
  },
  Va = /*#__PURE__*/ (e => t => {
    let n
    return () => {
      if (n !== void 0) return n
      let r = t()
      if (!r) return
      let i = r.split('\n')
      if (i[e] !== void 0) return ((n = i[e].trim()), n)
    }
  })(3),
  Ha = class extends kt {
    fiberId
    constructor(e, t = At) {
      ;(super('Interrupt', t, 'Interrupted'), (this.fiberId = e))
    }
    toString() {
      return `Interrupt(${this.fiberId})`
    }
    toJSON() {
      return {
        _tag: 'Interrupt',
        fiberId: this.fiberId,
      }
    }
    [C](e) {
      return (
        zt(e) &&
        this.fiberId === e.fiberId &&
        this.annotations === e.annotations
      )
    }
    [b]() {
      return ge(S(`${this._tag}:${this.fiberId}`))(he(this.annotations))
    }
  },
  Ua = e => new Dt([new Ha(e)]),
  Wa = e => {
    for (let t = 0; t < e.reasons.length; t++) {
      let n = e.reasons[t]
      if (n._tag === 'Fail') return Bn(n.error)
    }
    return Vn(e)
  },
  Ga = e => e.reasons.some(zt),
  Ka = e => {
    let t
    for (let n = 0; n < e.reasons.length; n++) {
      let r = e.reasons[n]
      r._tag === 'Interrupt' &&
        ((t ??= /* @__PURE__ */ new Set()),
        r.fiberId !== void 0 && t.add(r.fiberId))
    }
    return t ? Bn(t) : Vn(e)
  },
  qa = e => e.reasons.length > 0 && e.reasons.every(zt),
  Ja = /*#__PURE__*/ o(2, (e, t) => {
    if (e.reasons.length === 0) return t
    if (t.reasons.length === 0) return e
    let n = new Dt(Ar(e.reasons, t.reasons))
    return w(e, n) ? e : n
  }),
  Ya = /*#__PURE__*/ o(2, (e, t) => {
    let n = !1,
      r = e.reasons.map(e => (Lt(e) ? ((n = !0), new jt(t(e.error))) : e))
    return n ? Mt(r) : e
  }),
  Xa = e => {
    let t = {
      Fail: [],
      Die: [],
      Interrupt: [],
    }
    for (let n = 0; n < e.reasons.length; n++)
      t[e.reasons[n]._tag].push(e.reasons[n])
    return t
  },
  Za = e => {
    let t = Xa(e)
    return t.Fail.length > 0
      ? t.Fail[0].error
      : t.Die.length > 0
        ? t.Die[0].defect
        : t.Interrupt.length > 0
          ? new globalThis.Error('All fibers interrupted without error')
          : new globalThis.Error('Empty cause')
  },
  Qa = (e, t) => {
    let n = [],
      r = []
    if (e.reasons.length === 0) return n
    let i = ci()
    li(1)
    for (let i of e.reasons) {
      if (i._tag === 'Interrupt') {
        r.push(i)
        continue
      }
      n.push($a(i._tag === 'Die' ? i.defect : i.error, i.annotations, t))
    }
    if (n.length === 0) {
      let e = /* @__PURE__ */ Error('The fiber was interrupted by:')
      ;((e.name = 'InterruptCause'), (e.stack = io(e, r)))
      let i = new globalThis.Error('All fibers interrupted without error', {
        cause: e,
      })
      ;((i.name = 'InterruptError'),
        (i.stack = `${i.name}: ${i.message}`),
        n.push($a(i, r[0].annotations, t)))
    }
    return (li(i), n)
  },
  $a = (e, t, n) => {
    let r = typeof e,
      i
    if (e && r === 'object') {
      if (
        ((i = new globalThis.Error(eo(e), {
          cause: e.cause ? $a(e.cause) : void 0,
        })),
        typeof e.name == 'string' && (i.name = e.name),
        typeof e.stack == 'string')
      )
        i.stack = no(e.stack, i, t)
      else {
        let e = `${i.name}: ${i.message}`
        i.stack = t ? ro(e, t) : e
      }
      n?.includeCauseInStack && (i.stack = so(i))
      for (let t of Object.keys(e)) t in i || (i[t] = e[t])
    } else
      i = new globalThis.Error(
        e ? (r === 'string' ? e : ot(e)) : `Unknown error: ${e}`,
      )
    return i
  },
  eo = e => {
    if (typeof e.message == 'string') return e.message
    if (
      typeof e.toString == 'function' &&
      e.toString !== Object.prototype.toString &&
      e.toString !== Array.prototype.toString
    )
      try {
        return e.toString()
      } catch {}
    return ot(e)
  },
  to = /\((.*)\)/g,
  no = (e, t, n) => {
    let r = `${t.name}: ${t.message}`,
      i = (e.startsWith(r) ? e.slice(r.length) : e).split('\n'),
      a = [r]
    for (
      let e = 1;
      e < i.length && !/(?:Generator\.next|~effect\/Effect)/.test(i[e]);
      e++
    )
      a.push(i[e])
    return n ? ro(a.join('\n'), n) : a.join('\n')
  },
  ro = (e, t) => {
    let n = t?.get(Wt.key)
    return (n && (e = `${e}\n${ao(n)}`), e)
  },
  io = (e, t) => {
    let n = [`${e.name}: ${e.message}`]
    for (let e of t) {
      let t = e.fiberId === void 0 ? 'unknown' : `#${e.fiberId}`,
        r = e.annotations.get(Gt.key)
      ;(n.push(`    at fiber (${t})`), r && n.push(ao(r)))
    }
    return n.join('\n')
  },
  ao = e => {
    let t = [],
      n = e,
      r = 0
    for (; n && r < 10; ) {
      let e = n.stack()
      if (e) {
        let r = e.matchAll(to),
          i = !1
        for (let [, e] of r) ((i = !0), t.push(`    at ${n.name} (${e})`))
        i || t.push(`    at ${n.name} (${e.replace(/^at /, '')})`)
      } else t.push(`    at ${n.name}`)
      ;((n = n.parent), r++)
    }
    return t.join('\n')
  },
  oo = e => Qa(e).map(so).join('\n'),
  so = e => (e.cause ? `${e.stack} {\n${co(e.cause, '  ')}\n}` : e.stack),
  co = (e, t) => {
    let n = e.stack.split('\n'),
      r = `${t}[cause]: ${n[0]}`
    for (let e = 1, i = n.length; e < i; e++) r += `\n${t}${n[e]}`
    return (e.cause && (r += ` {\n${co(e.cause, `${t}  `)}\n${t}}`), r)
  },
  lo = '~effect/Fiber/dev',
  uo = {
    _A: s,
    _E: s,
  },
  fo = { id: 0 },
  po = () => globalThis[Qe],
  mo = class {
    constructor(e, t = !0) {
      ;((this[lo] = uo),
        this.setContext(e),
        (this.id = ++fo.id),
        (this.currentOpCount = 0),
        (this.currentLoopCount = 0),
        (this.interruptible = t),
        (this._stack = []),
        (this._observers = []),
        (this._exit = void 0),
        (this._children = void 0),
        (this._interruptedCause = void 0),
        (this._yielded = void 0),
        this.runtimeMetrics?.recordFiberStart(this.context))
    }
    [lo]
    id
    interruptible
    currentOpCount
    currentLoopCount
    _stack
    _observers
    _exit
    _currentExit
    _children
    _interruptedCause
    _yielded
    context
    currentScheduler
    currentTracerContext
    currentSpan
    currentLogLevel
    minimumLogLevel
    currentStackFrame
    runtimeMetrics
    maxOpsBeforeYield
    currentPreventYield
    _dispatcher = void 0
    get currentDispatcher() {
      return (this._dispatcher ??= this.currentScheduler.makeDispatcher())
    }
    getRef(e) {
      return Ei(this.context, e)
    }
    addObserver(e) {
      return this._exit
        ? (e(this._exit), f)
        : (this._observers.push(e),
          () => {
            let t = this._observers.indexOf(e)
            t >= 0 && this._observers.splice(t, 1)
          })
    }
    interruptUnsafe(e, t) {
      if (this._exit) return
      let n = Ua(e)
      ;(this.currentStackFrame && (n = It(n, xi(Wt, this.currentStackFrame))),
        t && (n = It(n, t)),
        (this._interruptedCause = this._interruptedCause
          ? Ja(this._interruptedCause, n)
          : n),
        this.interruptible && this.evaluate(wo(this._interruptedCause)))
    }
    pollUnsafe() {
      return this._exit
    }
    evaluate(e) {
      if (this._exit) return
      if (this._yielded !== void 0) {
        let e = this._yielded
        ;((this._yielded = void 0), e())
      }
      let t = this.runLoop(e)
      if (t === yt) return
      let n = ho.interruptChildren && ho.interruptChildren(this)
      if (n !== void 0) return this.evaluate(I(n, () => t))
      ;((this._exit = t),
        this.runtimeMetrics?.recordFiberEnd(this.context, this._exit))
      for (let e = 0; e < this._observers.length; e++) this._observers[e](t)
      this._observers.length = 0
    }
    runLoop(e) {
      let t = globalThis[Qe]
      globalThis[Qe] = this
      let n = !1,
        r = e
      this.currentOpCount = 0
      let i = ++this.currentLoopCount
      try {
        for (;;) {
          if (
            (this.currentOpCount++,
            !n &&
              !this.currentPreventYield &&
              this.currentScheduler.shouldYield(this))
          ) {
            n = !0
            let e = r
            r = I(Eo, () => e)
          }
          if (
            ((r = this.currentTracerContext
              ? this.currentTracerContext(r, this)
              : r[ht](this)),
            i !== this.currentLoopCount)
          )
            return yt
          if (r === yt) {
            let e = this._yielded
            return ft in e ? ((this._yielded = void 0), e) : yt
          }
        }
      } catch (e) {
        return y(r, ht)
          ? this.runLoop(Jt(e))
          : Jt(`Fiber.runLoop: Not a valid effect: ${String(r)}`)
      } finally {
        globalThis[Qe] = t
      }
    }
    getCont(e) {
      for (;;) {
        let t = this._stack.pop()
        if (!t) return
        let n = t[vt] && t[vt](this)
        if (n) return ((n[e] = n), n)
        if (t[e]) return t
      }
    }
    yieldWith(e) {
      return ((this._yielded = e), yt)
    }
    children() {
      return (this._children ??= /* @__PURE__ */ new Set())
    }
    pipe() {
      return r(this, arguments)
    }
    setContext(e) {
      this.context = e
      let t = this.getRef(ma)
      ;(t !== this.currentScheduler &&
        ((this.currentScheduler = t), (this._dispatcher = void 0)),
        (this.currentSpan = e.mapUnsafe.get(xa)),
        (this.currentLogLevel = this.getRef(Ra)),
        (this.minimumLogLevel = this.getRef(za)),
        (this.currentStackFrame = e.mapUnsafe.get(Na.key)),
        (this.maxOpsBeforeYield = this.getRef(ya)),
        (this.currentPreventYield = this.getRef(ba)),
        (this.runtimeMetrics = e.mapUnsafe.get(ja)))
      let n = e.mapUnsafe.get(Da)
      this.currentTracerContext = n ? n.context : void 0
    }
    get currentSpanLocal() {
      return this.currentSpan?._tag === 'Span' ? this.currentSpan : void 0
    }
  },
  ho = { interruptChildren: void 0 },
  go = e => {
    if (!e.currentStackFrame) return
    let t = /* @__PURE__ */ new Map()
    return (t.set(Wt.key, e.currentStackFrame), hi(t))
  },
  _o = e => {
    if (!(e._children === void 0 || e._children.size === 0))
      return Co(e._children)
  },
  vo = e => {
    let t = e
    return t._exit
      ? N(t._exit)
      : Ro(n => (t._exit ? n(N(t._exit)) : P(e.addObserver(e => n(N(e))))))
  },
  yo = e =>
    Ro(t => {
      let n = e[Symbol.iterator](),
        r = [],
        i
      function a() {
        let e = n.next()
        for (; !e.done; ) {
          if (e.value._exit) {
            ;(r.push(e.value._exit), (e = n.next()))
            continue
          }
          i = e.value.addObserver(e => {
            ;(r.push(e), a())
          })
          return
        }
        t(N(r))
      }
      return (a(), P(() => i?.()))
    }),
  bo = e => {
    let t = e
    return t._exit
      ? t._exit
      : Ro(n => (t._exit ? n(t._exit) : P(e.addObserver(n))))
  },
  xo = e => D(t => So(e, t.id)),
  So = /*#__PURE__*/ o(
    e => y(e[0], lo),
    (e, t, n) =>
      D(r => {
        let i = go(r)
        return (
          (i = i && n ? ji(i, n) : (i ?? n)),
          e.interruptUnsafe(t, i),
          Xo(vo(e))
        )
      }),
  ),
  Co = e =>
    D(t => {
      let n = go(t)
      for (let r of e) r.interruptUnsafe(t.id, n)
      return Xo(yo(e))
    }),
  N = E,
  wo = Kt,
  To = qt,
  P = /*#__PURE__*/ Ht({
    op: 'Sync',
    [ht](e) {
      let t = this[T](),
        n = e.getCont(gt)
      return n ? n[gt](t, e) : e.yieldWith(E(t))
    },
  }),
  F = /*#__PURE__*/ Ht({
    op: 'Suspend',
    [ht](e) {
      return this[T]()
    },
  }),
  Eo = /*#__PURE__*/ /* @__PURE__ */ Ht({
    op: 'Yield',
    [ht](e) {
      let t = !1
      return (
        e.currentDispatcher.scheduleTask(() => {
          t || e.evaluate(ls)
        }, this[T] ?? 0),
        e.yieldWith(() => {
          t = !0
        })
      )
    },
  })(0),
  Do = e => N(k(e)),
  Oo = /*#__PURE__*/ N(/*#__PURE__*/ O()),
  ko = e => F(() => wo(ut(e))),
  Ao = e => Jt(e),
  jo = e => F(() => To(ut(e))),
  Mo = /*#__PURE__*/ N(void 0),
  No = e => {
    let t = typeof e == 'function' ? e : e.try,
      n =
        typeof e == 'function'
          ? e => new dl(e, 'An error occurred in Effect.try')
          : e.catch
    return F(() => {
      try {
        return N(ut(t))
      } catch (e) {
        return To(ut(() => n(e)))
      }
    })
  },
  Po = e => {
    let t = typeof e == 'function' ? e : e.try,
      n =
        typeof e == 'function'
          ? e => new dl(e, 'An error occurred in Effect.tryPromise')
          : e.catch
    return Io(function (e, r) {
      let i = t => {
        try {
          e(To(ut(() => n(t))))
        } catch (t) {
          e(Ao(t))
        }
      }
      try {
        ut(() => t(r)).then(t => e(N(t)), i)
      } catch (e) {
        i(e)
      }
    }, t.length !== 0)
  },
  Fo = e => D(t => e(t.id)),
  Io = /*#__PURE__*/ Ht({
    op: 'Async',
    single: !1,
    [ht](e) {
      let t = ut(() => this[T][0].bind(e.currentScheduler)),
        n = !1,
        r = !1,
        i = this[T][1] ? new AbortController() : void 0,
        a = t(t => {
          n || ((n = !0), r ? e.evaluate(t) : (r = t))
        }, i?.signal)
      return r === !1
        ? ((r = !0),
          (e._yielded = () => {
            n = !0
          }),
          (i === void 0 && a === void 0) ||
            e._stack.push(Lo(() => ((n = !0), i?.abort(), a ?? ls))),
          yt)
        : r
    },
  }),
  Lo = /*#__PURE__*/ Ht({
    op: 'AsyncFinalizer',
    [vt](e) {
      e.interruptible && ((e.interruptible = !1), e._stack.push(yc))
    },
    [_t](e, t) {
      return Ga(e) ? I(this[T](), () => wo(e)) : wo(e)
    },
  }),
  Ro = e => Io(e, e.length >= 2),
  zo = /*#__PURE__*/ Ro(f),
  Bo = (...e) => F(() => Go(e.length === 1 ? e[0]() : e[1].call(e[0].self))),
  Vo = (e, ...t) => {
    let n =
      t.length === 0
        ? function () {
            return F(() => Go(e.apply(this, arguments)))
          }
        : function () {
            let n = F(() => Go(e.apply(this, arguments)))
            for (let e = 0; e < t.length; e++) n = t[e](n, ...arguments)
            return n
          }
    return Ho(e.length, n)
  },
  Ho = (e, t) =>
    Object.defineProperty(t, 'length', {
      value: e,
      configurable: !0,
    }),
  Uo = (e, ...t) =>
    Ho(
      e.length,
      t.length === 0
        ? function () {
            return Wo(() => e.apply(this, arguments))
          }
        : function () {
            let n = Wo(() => e.apply(this, arguments))
            for (let e of t) n = e(n)
            return n
          },
    ),
  Wo = e => {
    try {
      let t = e(),
        n
      for (;;) {
        let r = t.next(n)
        if (r.done) return N(r.value)
        let i = r.value
        if (i && i._tag === 'Success') {
          n = i.value
          continue
        } else if (i && i._tag === 'Failure') return r.value
        else {
          let n = !0
          return F(() =>
            n ? ((n = !1), I(r.value, e => Go(t, e))) : F(() => Go(e())),
          )
        }
      }
    } catch (e) {
      return Ao(e)
    }
  },
  Go = /*#__PURE__*/ Ht({
    op: 'Iterator',
    single: !1,
    [gt](e, t) {
      let n = this[T][0]
      for (;;) {
        let r = n.next(e)
        if (r.done) return N(r.value)
        if (!Qo(r.value)) return (t._stack.push(this), r.value)
        if (r.value._tag === 'Failure') return r.value
        e = r.value.value
      }
    },
    [ht](e) {
      return this[gt](this[T][1], e)
    },
  }),
  Ko = /*#__PURE__*/ o(2, (e, t) => {
    let n = N(t)
    return I(e, e => n)
  }),
  qo = e => ts(e, k),
  Jo = /*#__PURE__*/ o(2, (e, t) => I(e, e => (St(t) ? t : ut(() => t(e))))),
  Yo = /*#__PURE__*/ o(2, (e, t) =>
    I(e, e => Ko(St(t) ? t : ut(() => t(e)), e)),
  ),
  Xo = e => I(e, e => ls),
  I = /*#__PURE__*/ o(2, (e, t) => {
    let n = Object.create(Zo)
    return ((n[T] = e), (n[gt] = t.length === 1 ? t : e => t(e)), n)
  }),
  Zo = /*#__PURE__*/ Vt({
    op: 'OnSuccess',
    [ht](e) {
      return (e._stack.push(this), this[T])
    },
  }),
  Qo = e => ft in e,
  $o = /*#__PURE__*/ o(2, (e, t) =>
    Qo(e) ? (e._tag === 'Success' ? t(e.value) : e) : I(e, t),
  ),
  es = e => I(e, s),
  ts = /*#__PURE__*/ o(2, (e, t) => I(e, e => N(ut(() => t(e))))),
  ns = /*#__PURE__*/ o(2, (e, t) => (Qo(e) ? us(e, t) : ts(e, t))),
  rs = /*#__PURE__*/ o(2, (e, t) => (Qo(e) ? ds(e, t) : Ms(e, t))),
  is = e => Kt(Ua(e)),
  as = e => e._tag === 'Success',
  os = e => e._tag === 'Failure',
  ss = e => (e._tag === 'Failure' ? Bn(e.cause) : Vn(e)),
  cs = e => e._tag === 'Failure' && Ga(e.cause),
  ls = /*#__PURE__*/ E(void 0),
  us = /*#__PURE__*/ o(2, (e, t) => (e._tag === 'Success' ? E(t(e.value)) : e)),
  ds = /*#__PURE__*/ o(2, (e, t) => {
    if (e._tag === 'Success') return E(t.onSuccess(e.value))
    let n = Wa(e.cause)
    return Un(n) ? e : qt(t.onFailure(n.success))
  }),
  fs = /*#__PURE__*/ o(2, (e, t) => (as(e) ? E(t) : e)),
  ps = /*#__PURE__*/ o(2, (e, t) => (as(e) ? t : e)),
  ms = /*#__PURE__*/ o(2, (e, t) =>
    as(e) ? t.onSuccess(e.value) : t.onFailure(e.cause),
  ),
  hs = /*#__PURE__*/ fs(void 0),
  gs = e => {
    let t = []
    for (let n of e) n._tag === 'Failure' && t.push(...n.cause.reasons)
    return t.length === 0 ? ls : Kt(Mt(t))
  },
  _s = /*#__PURE__*/ o(2, (e, t) =>
    D(n => {
      let r = n.context,
        i = t(r)
      return r === i
        ? e
        : (n.setContext(i),
          lc(e, () => {
            n.setContext(r)
          }))
    }),
  ),
  vs = /*#__PURE__*/ o(3, (e, t, n) =>
    _s(e, e => {
      let r = wi(e, t),
        i = n(r)
      return r === i ? e : Si(e, t, i)
    }),
  ),
  ys = () => bs,
  bs = /*#__PURE__*/ D(e => N(e.context)),
  xs = e => D(t => e(t.context)),
  Ss = /*#__PURE__*/ o(2, (e, t) => (Qo(e) ? e : _s(e, ji(t)))),
  Cs = function () {
    return arguments.length === 1
      ? o(2, (e, t) => ws(e, arguments[0], t))
      : o(3, (e, t, n) => ws(e, t, n)).apply(this, arguments)
  },
  ws = (e, t, n) =>
    _s(e, e => (e.mapUnsafe.get(t.key) === n ? e : Si(e, t, n))),
  Ts = /*#__PURE__*/ o(2, (e, t) => I(t, t => (t ? qo(e) : Oo))),
  Es = /*#__PURE__*/ o(
    e => St(e[0]),
    (e, t) =>
      wc({
        while: l,
        body: c(t?.disableYield ? e : I(e, e => Eo)),
        step: f,
      }),
  ),
  Ds = /*#__PURE__*/ o(2, (e, t) => {
    let n = Object.create(Os)
    return ((n[T] = e), (n[_t] = t.length === 1 ? t : e => t(e)), n)
  }),
  Os = /*#__PURE__*/ Vt({
    op: 'OnFailure',
    [ht](e) {
      return (e._stack.push(this), this[T])
    },
  }),
  ks = /*#__PURE__*/ o(3, (e, t, n) =>
    Ds(e, e => {
      let r = t(e)
      return Un(r) ? wo(r.failure) : ut(() => n(r.success, e))
    }),
  ),
  As = /*#__PURE__*/ o(2, (e, t) => ks(e, Wa, e => t(e))),
  js = /*#__PURE__*/ o(2, (e, t) => As(e, e => jo(() => t(e)))),
  Ms = /*#__PURE__*/ o(2, (e, t) =>
    Rs(e, {
      onFailure: e => jo(() => t.onFailure(e)),
      onSuccess: e => P(() => t.onSuccess(e)),
    }),
  ),
  Ns = e => As(e, Ao),
  Ps = e =>
    F(() => {
      let t = e[Symbol.iterator](),
        n = t.next()
      if (n.done)
        return Ao(
          /* @__PURE__ */ Error('Received an empty collection of effects'),
        )
      function r(e) {
        let n = t.next()
        return n.done ? e.value : As(e.value, e => r(n))
      }
      return r(n)
    }),
  Fs = e =>
    Bs(e, {
      onFailure: Vn,
      onSuccess: Bn,
    }),
  Is = /*#__PURE__*/ o(2, (e, t) => {
    let n = Object.create(Ls)
    return (
      (n[T] = e),
      (n[gt] = t.onSuccess.length === 1 ? t.onSuccess : e => t.onSuccess(e)),
      (n[_t] = t.onFailure.length === 1 ? t.onFailure : e => t.onFailure(e)),
      n
    )
  }),
  Ls = /*#__PURE__*/ Vt({
    op: 'OnSuccessAndFailure',
    [ht](e) {
      return (e._stack.push(this), this[T])
    },
  }),
  Rs = /*#__PURE__*/ o(2, (e, t) =>
    Is(e, {
      onFailure: e => {
        let n = e.reasons.find(Lt)
        return n ? ut(() => t.onFailure(n.error)) : wo(e)
      },
      onSuccess: t.onSuccess,
    }),
  ),
  zs = /*#__PURE__*/ o(2, (e, t) =>
    Rs(e, {
      onFailure: e => P(() => t.onFailure(e)),
      onSuccess: e => P(() => t.onSuccess(e)),
    }),
  ),
  Bs = /*#__PURE__*/ o(2, (e, t) => {
    if (Qo(e)) {
      if (e._tag === 'Success') return E(t.onSuccess(e.value))
      let n = Wa(e.cause)
      return Un(n) ? e : E(t.onFailure(n.success))
    }
    return zs(e, t)
  }),
  Vs = e => (Qo(e) ? E(e) : Hs(e)),
  Hs = /*#__PURE__*/ Ht({
    op: 'Exit',
    [ht](e) {
      return (e._stack.push(this), this[T])
    },
    [gt](e, t, n) {
      return N(n ?? E(e))
    },
    [_t](e, t, n) {
      return N(n ?? Kt(e))
    },
  }),
  Us = '~effect/Scope',
  Ws = '~effect/Scope/Closeable',
  Gs = /*#__PURE__*/ di('effect/Scope'),
  Ks = (e, t) => F(() => qs(e, t) ?? Mo),
  qs = (e, t) => {
    if (e.state._tag === 'Closed') return
    let n = {
      _tag: 'Closed',
      exit: t,
    }
    if (e.state._tag === 'Empty') {
      e.state = n
      return
    }
    let { finalizers: r } = e.state
    if (((e.state = n), r.size !== 0))
      return r.size === 1 ? r.values().next().value(t) : Js(e, r, t)
  },
  Js = /*#__PURE__*/ Vo(function* (e, t, n) {
    let r = [],
      i = [],
      a = Array.from(t.values()),
      o = po()
    for (let t = a.length - 1; t >= 0; t--) {
      let s = a[t]
      e.strategy === 'sequential'
        ? r.push(yield* Vs(s(n)))
        : i.push(jc(o, s(n), !0, !0, 'inherit'))
    }
    return (i.length > 0 && (r = yield* yo(i)), yield* gs(r))
  }),
  Ys = (e, t) => {
    let n = ec(t)
    if (e.state._tag === 'Closed') return ((n.state = e.state), n)
    let r = {}
    return (Qs(e, r, e => Ks(n, e)), Qs(n, r, t => P(() => $s(e, r))), n)
  },
  Xs = (e, t) =>
    F(() => (e.state._tag === 'Closed' ? t(e.state.exit) : (Qs(e, {}, t), Mo))),
  Zs = (e, t) => Xs(e, c(t)),
  Qs = (e, t, n) => {
    e.state._tag === 'Empty'
      ? (e.state = {
          _tag: 'Open',
          finalizers: new Map([[t, n]]),
        })
      : e.state._tag === 'Open' && e.state.finalizers.set(t, n)
  },
  $s = (e, t) => {
    e.state._tag === 'Open' && e.state.finalizers.delete(t)
  },
  ec = (e = 'sequential') => ({
    [Ws]: Ws,
    [Us]: Us,
    strategy: e,
    state: tc,
  }),
  tc = { _tag: 'Empty' },
  nc = e => P(() => ec(e)),
  rc = Gs,
  ic = /*#__PURE__*/ Cs(Gs),
  ac = e =>
    D(t => {
      let n = t.context,
        r = ec()
      return (
        t.setContext(Si(t.context, Gs, r)),
        lc(e, e => (t.setContext(n), qs(r, e)))
      )
    }),
  oc = e =>
    F(() => {
      let t = ec()
      return uc(e(t), e => F(() => qs(t, e) ?? Mo))
    }),
  sc = (e, t, n) =>
    xs(r =>
      Sc(i =>
        I(rc, a =>
          Yo(n?.interruptible ? i(e) : e, e => Xs(a, n => Ss(t(e, n), r))),
        ),
      ),
    ),
  cc = e => I(rc, t => xs(n => Xs(t, t => Ss(e(t), n)))),
  lc = /*#__PURE__*/ Ht({
    op: 'OnExit',
    single: !1,
    [ht](e) {
      return (e._stack.push(this), this[T][0])
    },
    [vt](e) {
      e.interruptible &&
        this[T][2] !== !0 &&
        (e._stack.push(yc), (e.interruptible = !1))
    },
    [gt](e, t, n) {
      n ??= E(e)
      let r = this[T][1](n)
      return r ? I(r, e => n) : n
    },
    [_t](e, t, n) {
      n ??= Kt(e)
      let r = this[T][1](n)
      return r ? I(r, e => n) : n
    },
  }),
  uc = /*#__PURE__*/ o(2, lc),
  dc = /*#__PURE__*/ o(2, (e, t) => uc(e, e => t)),
  fc = /*#__PURE__*/ o(3, (e, t, n) =>
    uc(e, e => {
      let r = t(e)
      return Un(r) ? Mo : n(r.success, e)
    }),
  ),
  pc = /*#__PURE__*/ o(2, (e, t) => fc(e, ss, t)),
  mc = /*#__PURE__*/ o(3, (e, t, n) =>
    uc(e, e => {
      if (e._tag !== 'Failure') return Mo
      let r = t(e.cause)
      return Un(r) ? Mo : n(r.success, e.cause)
    }),
  ),
  hc = /*#__PURE__*/ o(2, (e, t) => mc(Ka, t)(e)),
  gc = /*#__PURE__*/ D(e => wo(Ua(e.id))),
  _c = e =>
    D(t =>
      t.interruptible ? ((t.interruptible = !1), t._stack.push(yc), e) : e,
    ),
  vc = /*#__PURE__*/ Ht({
    op: 'SetInterruptible',
    [vt](e) {
      if (((e.interruptible = this[T]), e._interruptedCause && e.interruptible))
        return () => wo(e._interruptedCause)
    },
  }),
  yc = /*#__PURE__*/ vc(!0),
  bc = /*#__PURE__*/ vc(!1),
  xc = e =>
    D(t =>
      t.interruptible
        ? e
        : ((t.interruptible = !0),
          t._stack.push(bc),
          t._interruptedCause ? wo(t._interruptedCause) : e),
    ),
  Sc = e =>
    D(t =>
      t.interruptible
        ? ((t.interruptible = !1), t._stack.push(yc), e(xc))
        : e(s),
    ),
  Cc = (e, t) =>
    me(e)
      ? t?.mode === 'result'
        ? Tc(e, Fs, t)
        : Tc(e, s, t)
      : t?.discard
        ? t.mode === 'result'
          ? Tc(Object.values(e), Fs, t)
          : Tc(Object.values(e), s, t)
        : F(() => {
            let n = {}
            return Ko(
              Tc(
                Object.entries(e),
                ([e, r]) =>
                  ts(t?.mode === 'result' ? Fs(r) : r, t => {
                    n[e] = t
                  }),
                {
                  discard: !0,
                  concurrency: t?.concurrency,
                },
              ),
              n,
            )
          }),
  wc = /*#__PURE__*/ Ht({
    op: 'While',
    [gt](e, t) {
      return (
        this[T].step(e),
        this[T].while() ? (t._stack.push(this), this[T].body()) : ls
      )
    },
    [ht](e) {
      return this[T].while() ? (e._stack.push(this), this[T].body()) : ls
    },
  }),
  Tc = /*#__PURE__*/ o(
    e => typeof e[1] == 'function',
    (e, t, n) =>
      D(r => {
        let i =
            n?.concurrency === 'inherit' ? r.getRef(Ma) : (n?.concurrency ?? 1),
          a = i === 'unbounded' ? Infinity : Math.max(1, i)
        if (a === 1) return Ec(e, t, n)
        let o = ar(e),
          s = o.length
        if (s === 0) return n?.discard ? Mo : N([])
        let c = n?.discard ? void 0 : Array(s),
          l = kc(
            {
              f: t,
              out: c,
            },
            o,
            { concurrency: a },
          )
        return l ? Ko(l, c) : N(c)
      }),
  ),
  Ec = (e, t, n) =>
    F(() => {
      let r = n?.discard ? void 0 : [],
        i = e[Symbol.iterator](),
        a = i.next(),
        o = 0
      return Ko(
        wc({
          while: () => !a.done,
          body: () => t(a.value, o++),
          step: e => {
            ;(r && r.push(e), (a = i.next()))
          },
        }),
        r,
      )
    }),
  Dc = e => {
    let t = e.onItem,
      n = e.step
    return (e, r, i) => {
      let a = i?.start ?? 0,
        o = i?.end ?? r.length,
        s = i?.concurrency ?? 1,
        c = !1,
        l,
        u,
        d,
        f = !1,
        p,
        m,
        h = () => {
          let i = !1
          for (; !p && a < o; a++) {
            let o = r[a],
              g = m ?? t(e, o, a)
            if (Qo(g)) {
              if (((p = n(e, o, g, a)), p)) break
            } else if (s === 1)
              return I(Vs(g), t => ((p = n(e, o, t, a)), a++, p ?? h() ?? Mo))
            else if (l) {
              m = void 0
              let t = jc(l, g, !0, !0, 'inherit')
              if (t._exit) {
                if (((p = n(e, o, t._exit, a)), p)) break
                continue
              }
              u ? u.add(t) : (u = new Set([t]))
              let r = a
              if (
                (t.addObserver(a => {
                  if ((u.delete(t), p)) {
                    if (!f && a._tag === 'Failure')
                      for (let e of a.cause.reasons)
                        if (e._tag === 'Interrupt') continue
                        else
                          p._tag === 'Failure'
                            ? p.cause.reasons.push(e)
                            : (p = Kt(Mt([e])))
                  } else {
                    let t = n(e, o, a, r)
                    t &&
                      ((p =
                        t._tag === 'Failure'
                          ? Kt(Mt(t.cause.reasons.slice()))
                          : t),
                      h())
                  }
                  if (i) {
                    let e = h()
                    e && d(e)
                  } else c && u.size === 0 && d(p ?? Mo)
                }),
                u.size < s)
              )
                continue
              ;((i = !0), a++)
              return
            } else
              return Ro(e => {
                ;((l = po()), (m = g), (d = e))
                let t = h()
                return t ? e(t) : F(() => ((p = ls), (f = !0), u ? Co(u) : Mo))
              })
          }
          if (((c = !0), p)) {
            if (u && u.size > 0) {
              let e = go(l)
              u.forEach(t => t.interruptUnsafe(l.id, e))
              return
            }
            if (d || p._tag === 'Failure') return p
          } else if (d)
            if (u) u.size === 0 && d(Mo)
            else return ls
        }
      return h()
    }
  },
  Oc = () => Dc,
  kc = /*#__PURE__*/ Dc({
    onItem(e, t, n) {
      return e.f(t, n)
    },
    step(e, t, n, r) {
      if (n._tag === 'Failure') return n
      e.out && (e.out[r] = n.value)
    },
  }),
  Ac = /*#__PURE__*/ o(
    e => St(e[0]),
    (e, t) =>
      D(
        n => (
          ml(),
          N(jc(n, e, t?.startImmediately, !1, t?.uninterruptible ?? !1))
        ),
      ),
  ),
  jc = (e, t, n = !1, r = !1, i = !1) => {
    let a = i === 'inherit' ? e.interruptible : !i,
      o = new mo(e.context, a)
    return (
      n
        ? o.evaluate(t)
        : e.currentDispatcher.scheduleTask(() => o.evaluate(t), 0),
      !r &&
        !o._exit &&
        (e.children().add(o), o.addObserver(() => e._children.delete(o))),
      o
    )
  },
  Mc = /*#__PURE__*/ o(
    e => St(e[0]),
    (e, t, n) =>
      D(r => {
        let i = jc(r, e, n?.startImmediately, !0, n?.uninterruptible)
        if (!i._exit)
          if (t.state._tag !== 'Closed') {
            let e = {}
            ;(Qs(t, e, () => Fo(e => (e === i.id ? Mo : xo(i)))),
              i.addObserver(() => $s(t, e)))
          } else i.interruptUnsafe(r.id, go(r))
        return N(i)
      }),
  ),
  Nc = /*#__PURE__*/ o(
    e => St(e[0]),
    (e, t) => I(rc, n => Mc(e, n, t)),
  ),
  Pc = e => (t, n) => {
    let r = new mo(
      n?.scheduler ? Si(e, ma, n.scheduler) : e,
      n?.uninterruptible !== !0,
    )
    if ((r.evaluate(t), r._exit)) return r
    if (n?.signal)
      if (n.signal.aborted) r.interruptUnsafe()
      else {
        let e = () => r.interruptUnsafe()
        ;(n.signal.addEventListener('abort', e, { once: !0 }),
          r.addObserver(() => n.signal.removeEventListener('abort', e)))
      }
    return (n?.onFiberStart && n.onFiberStart(r), r)
  },
  Fc = /*#__PURE__*/ o(2, (e, t) => {
    if (e._exit) return e
    if (t.state._tag === 'Closed') return (e.interruptUnsafe(e.id), e)
    let n = {}
    return (Qs(t, n, () => xo(e)), e.addObserver(() => $s(t, n)), e)
  }),
  Ic = /*#__PURE__*/ Pc(/*#__PURE__*/ yi()),
  Lc = e => {
    let t = Pc(e)
    return e => {
      if (Qo(e)) return e
      let n = t(e, { scheduler: new _a('sync') })
      return (n.currentDispatcher?.flush(), n._exit ?? Jt(new ll(n)))
    }
  },
  Rc = /*#__PURE__*/ Lc(/*#__PURE__*/ yi()),
  zc = /*#__PURE__*/ (e => {
    let t = Lc(e)
    return e => {
      let n = t(e)
      if (n._tag === 'Failure') throw Za(n.cause)
      return n.value
    }
  })(/*#__PURE__*/ yi()),
  Bc = /*#__PURE__*/ N(!0),
  Vc = /*#__PURE__*/ N(!1),
  Hc = class {
    waiters = []
    scheduled = !1
    _isOpen
    constructor(e) {
      this._isOpen = e
    }
    scheduleUnsafe(e) {
      return this.scheduled || this.waiters.length === 0
        ? Bc
        : ((this.scheduled = !0),
          e.currentDispatcher.scheduleTask(this.flushWaiters, 0),
          Bc)
    }
    flushWaiters = () => {
      this.scheduled = !1
      let e = this.waiters
      this.waiters = []
      for (let t = 0; t < e.length; t++) e[t](ls)
    }
    open = /*#__PURE__*/ D(e =>
      this._isOpen ? Vc : ((this._isOpen = !0), this.scheduleUnsafe(e)),
    )
    release = /*#__PURE__*/ D(e => (this._isOpen ? Vc : this.scheduleUnsafe(e)))
    openUnsafe() {
      return this._isOpen ? !1 : ((this._isOpen = !0), this.flushWaiters(), !0)
    }
    await = /*#__PURE__*/ Ro(e =>
      this._isOpen
        ? e(Mo)
        : (this.waiters.push(e),
          P(() => {
            let t = this.waiters.indexOf(e)
            t !== -1 && this.waiters.splice(t, 1)
          })),
    )
    closeUnsafe() {
      return this._isOpen ? ((this._isOpen = !1), !0) : !1
    }
    close = /*#__PURE__*/ P(() => this.closeUnsafe())
    whenOpen = e => I(this.await, () => e)
    isOpen() {
      return this._isOpen
    }
  },
  Uc = e => new Hc(e ?? !1),
  Wc = e => P(() => Uc(e)),
  Gc = /*#__PURE__*/ BigInt(0),
  Kc = {
    _tag: 'Span',
    spanId: 'noop',
    traceId: 'noop',
    sampled: !1,
    status: {
      _tag: 'Ended',
      startTime: Gc,
      endTime: Gc,
      exit: ls,
    },
    attributes: /*#__PURE__*/ new Map(),
    links: [],
    kind: 'internal',
    attribute() {},
    event() {},
    end() {},
    addLinks() {},
  },
  qc = e => Object.assign(Object.create(Kc), e),
  Jc = e =>
    e
      ? Ti(e.annotations, wa)
        ? e._tag === 'Span'
          ? Jc(Mn(e.parent))
          : O()
        : k(e)
      : O(),
  Yc = (e, t, n) => {
    let r = !e.getRef(Pa) || (n?.annotations && Ti(n.annotations, wa)),
      i =
        n?.parent === void 0
          ? n?.root
            ? O()
            : Jc(e.currentSpan)
          : k(n.parent),
      a
    if (r)
      a = qc({
        name: t,
        parent: i,
        annotations: Si(n?.annotations ?? yi(), wa, !0),
      })
    else {
      let r = e.getRef(Oa),
        o = e.getRef(tl),
        s = e.getRef(Fa),
        c = e.getRef(Ia),
        l = e.getRef(La),
        u = n?.level ?? e.getRef(Ta),
        d = n?.links === void 0 ? l.slice() : [...l, ...n.links]
      a = r.span({
        name: t,
        parent: i,
        annotations: n?.annotations ?? yi(),
        links: d,
        startTime: s ? o.currentTimeNanosUnsafe() : BigInt(0),
        kind: n?.kind ?? 'internal',
        root: n?.root ?? A(i),
        sampled:
          n?.sampled ??
          (j(i) && i.value.sampled === !1 ? !1 : !fl(e.getRef(Ea), u)),
      })
      for (let [e, t] of Object.entries(c)) a.attribute(e, t)
      if (n?.attributes !== void 0)
        for (let [e, t] of Object.entries(n.attributes)) a.attribute(e, t)
    }
    return a
  },
  Xc = (e, t) => (
    (t = typeof t == 'function' ? t : d),
    vs(Na, n => ({
      name: e,
      stack: t,
      parent: n,
    }))
  ),
  Zc = (e, ...t) => {
    let n = t.length === 1 ? void 0 : t[0],
      r = t[t.length - 1]
    return D(t => {
      let i = Yc(t, e, n),
        a = t.getRef(tl)
      return uc(
        ut(() => r(i)),
        e =>
          P(() => {
            i.status._tag !== 'Ended' && i.end(a.currentTimeNanosUnsafe(), e)
          }),
      )
    })
  },
  Qc = /*#__PURE__*/ Cs(Sa),
  $c = function () {
    let e = St(arguments[0]),
      t = e ? arguments[1] : arguments[0],
      n = e ? arguments[2] : arguments[1],
      r = s
    return (
      t._tag === 'Span' &&
        ((n = Ba(n)), (r = Xc(t.name, n?.captureStackTrace))),
      e ? Qc(r(arguments[0]), t) : e => Qc(r(e), t)
    )
  },
  el = function () {
    let e = typeof arguments[0] != 'string',
      t = e ? arguments[1] : arguments[0],
      n = Ba(arguments[2])
    if (e) {
      let e = arguments[0]
      return Zc(t, arguments[2], t => $c(e, t, n))
    }
    let r = typeof arguments[1] == 'function' ? arguments[1] : void 0,
      i = r ? void 0 : arguments[1]
    return (e, ...a) => Zc(t, r ? r(...a) : i, t => $c(e, t, n))
  },
  tl = /*#__PURE__*/ Pi('effect/Clock', { defaultValue: () => new rl() }),
  nl = 2 ** 31 - 1,
  rl = class {
    currentTimeMillisUnsafe() {
      return Date.now()
    }
    currentTimeMillis = /*#__PURE__*/ P(() => this.currentTimeMillisUnsafe())
    currentTimeNanosUnsafe() {
      return al()
    }
    currentTimeNanos = /*#__PURE__*/ P(() => this.currentTimeNanosUnsafe())
    sleep(e) {
      let t = sa(e)
      return t <= 0
        ? Eo
        : Ro(e => {
            if (t > nl) return
            let n = setTimeout(() => e(Mo), t)
            return P(() => clearTimeout(n))
          })
    }
  },
  il = /*#__PURE__*/ (function () {
    let e = /*#__PURE__*/ BigInt(1e6)
    if (typeof performance > 'u' || performance.now === void 0)
      return () => BigInt(Date.now()) * e
    let t
    return () => (
      (t ??=
        BigInt(Date.now()) * e - BigInt(Math.round(performance.now() * 1e6))),
      t + BigInt(Math.round(performance.now() * 1e6))
    )
  })(),
  al = /*#__PURE__*/ (function () {
    let e =
      typeof process == 'object' &&
      'hrtime' in process &&
      typeof process.hrtime.bigint == 'function'
        ? process.hrtime
        : void 0
    if (!e) return il
    let t =
      /*#__PURE__*/ BigInt(/*#__PURE__*/ Date.now()) *
        /*#__PURE__*/ BigInt(1e6) -
      /*#__PURE__*/ e.bigint()
    return () => t + e.bigint()
  })(),
  ol = e => D(t => e(t.getRef(tl))),
  sl = e => ol(t => t.sleep(Ui(e)))
;(Zt('TimeoutError'), Zt('IllegalArgumentError'), Zt('ExceededCapacityError'))
var cl = '~effect/Cause/AsyncFiberError',
  ll = class extends Zt('AsyncFiberError') {
    [cl] = cl
    constructor(e) {
      super({
        message: 'An asynchronous Effect was executed with Effect.runSync',
        fiber: e,
      })
    }
  },
  ul = '~effect/Cause/UnknownError',
  dl = class extends Zt('UnknownError') {
    [ul] = ul
    constructor(e, t) {
      super({
        message: t,
        cause: e,
      })
    }
  },
  fl = /*#__PURE__*/ Dn(
    /* @__PURE__ */ En(Tn, e => {
      switch (e) {
        case 'All':
          return -(2 ** 53 - 1)
        case 'Fatal':
          return 5e4
        case 'Error':
          return 4e4
        case 'Warn':
          return 3e4
        case 'Info':
          return 2e4
        case 'Debug':
          return 1e4
        case 'Trace':
          return 0
        case 'None':
          return 2 ** 53 - 1
      }
    }),
  ),
  pl = {
    bold: '1',
    red: '31',
    green: '32',
    yellow: '33',
    blue: '34',
    cyan: '36',
    white: '37',
    gray: '90',
    black: '30',
    bgBrightRed: '101',
  }
;(pl.gray, pl.blue, pl.green, pl.yellow, pl.red, pl.bgBrightRed, pl.black)
function ml() {
  ho.interruptChildren ??= _o
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/Cause.js
var hl = Lt,
  gl = Ft,
  _l = Ua,
  vl = qa,
  yl = Ya,
  bl = Za,
  xl = Wa,
  Sl = oo,
  Cl = $t,
  wl = rn
;(di()('effect/Cause/StackTrace'), di()('effect/Cause/InterruptorStackTrace'))
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/Exit.js
var Tl = E,
  El = Kt,
  Dl = qt,
  Ol = is,
  kl = ls,
  Al = as,
  jl = os,
  Ml = cs,
  Nl = ms,
  Pl = hs,
  Fl = {
    '~effect/Deferred': {
      _A: s,
      _E: s,
    },
    pipe() {
      return r(this, arguments)
    },
  },
  Il = () => {
    let e = Object.create(Fl)
    return ((e.resumes = void 0), (e.effect = void 0), e)
  },
  Ll = e =>
    Ro(t =>
      e.effect
        ? t(e.effect)
        : ((e.resumes ??= []),
          e.resumes.push(t),
          P(() => {
            let n = e.resumes.indexOf(t)
            e.resumes.splice(n, 1)
          })),
    ),
  Rl = /* @__PURE__ */ o(2, (e, t) => P(() => Vl(e, t))),
  zl = /*#__PURE__*/ o(2, (e, t) => Rl(e, Kt(t))),
  Bl = /*#__PURE__*/ o(2, (e, t) => zl(e, Ua(t))),
  Vl = (e, t) => {
    if (e.effect) return !1
    if (((e.effect = t), e.resumes)) {
      for (let n = 0; n < e.resumes.length; n++) e.resumes[n](t)
      e.resumes = void 0
    }
    return !0
  },
  Hl = Gs,
  Ul = nc,
  Wl = ec,
  Gl = ic,
  Kl = Xs,
  ql = Zs,
  Jl = Ys,
  Yl = Ks,
  Xl = '~effect/Layer',
  Zl = '~effect/Layer/MemoMap',
  Ql = (e, t) => (
    e.observers++,
    Jo(
      Xs(t, t => e.finalizer(t)),
      e.effect,
    )
  ),
  $l = {
    [Xl]: {
      _ROut: s,
      _E: s,
      _RIn: s,
    },
    pipe() {
      return r(this, arguments)
    },
  },
  eu = e => {
    let t = Object.create($l)
    return ((t.build = e), t)
  },
  tu = e =>
    eu((t, n) => {
      let r = Jl(n)
      return uc(e(t, r), e => (e._tag === 'Failure' ? Yl(r, e) : Mo))
    }),
  nu = (e, t, n, r) => {
    let i = Wl(),
      a = Il(),
      o = {
        observers: 1,
        effect: Ll(a),
        finalizer: n =>
          F(
            () => (
              o.observers--,
              o.observers === 0 ? (e.map.delete(t), Yl(i, n)) : Mo
            ),
          ),
      }
    return (
      e.map.set(t, o),
      Xs(n, o.finalizer).pipe(
        I(() => r(e, i)),
        uc(e => ((o.effect = e), Rl(a, e))),
      )
    )
  },
  ru = class {
    get [Zl]() {
      return Zl
    }
    parent
    constructor(e) {
      this.parent = e
    }
    map = /*#__PURE__*/ new Map()
    get(e, t) {
      let n = this.map.get(e)
      return n ? Ql(n, t) : this.parent?.get(e, t)
    }
    getOrElseMemoize(e, t, n) {
      return this.get(e, t) || nu(this, e, t, n)
    }
  },
  iu = () => new ru(),
  au = e => new ru(e),
  ou = class e extends di()('effect/Layer/CurrentMemoMap') {
    static forkOrCreate(t) {
      let n = Ci(t, e)
      return n ? au(n) : iu()
    }
  },
  su = /*#__PURE__*/ o(3, (e, t, n) => Cs(ts(e.build(t, n), Si(ou, t)), ou, t)),
  cu = /*#__PURE__*/ o(2, (e, t) =>
    D(n => su(e, ou.forkOrCreate(n.context), t)),
  ),
  lu = function () {
    return arguments.length === 1
      ? e => uu(xi(arguments[0], e))
      : uu(xi(arguments[0], arguments[1]))
  },
  uu = e => eu(c(N(e))),
  du = /*#__PURE__*/ uu(/*#__PURE__*/ yi()),
  fu = (e, t, n) => {
    let r = Jl(n, 'parallel')
    return Tc(e, e => e.build(t, Jl(r, 'sequential')), {
      concurrency: e.length,
    }).pipe(ts(e => Mi(...e)))
  },
  pu = (...e) => tu((t, n) => fu(e, t, n)),
  mu = /*#__PURE__*/ o(2, (e, t) => pu(e, ...(Array.isArray(t) ? t : [t]))),
  hu = () =>
    new Proxy(
      {},
      {
        get(e, t, n) {
          return t === '$is'
            ? pe
            : t === '$match'
              ? gu
              : e => ({
                  ...e,
                  _tag: t,
                })
        },
      },
    )
function gu() {
  if (arguments.length === 1) {
    let e = arguments[0]
    return function (t) {
      return e[t._tag](t)
    }
  }
  let e = arguments[0]
  return arguments[1][e._tag](e)
}
var _u = Zt,
  vu = '~effect/time/DateTime',
  yu = '~effect/time/DateTime/TimeZone',
  bu = {
    [vu]: vu,
    pipe() {
      return r(this, arguments)
    },
    [st]() {
      return this.toString()
    },
    toJSON() {
      return Su(this).toJSON()
    },
  }
;(({ ...bu }), { ...bu })
var xu = {
  [yu]: yu,
  [st]() {
    return this.toString()
  },
}
;(({ ...xu }), { ...xu })
var Su = e => new Date(e.epochMilliseconds)
globalThis.Number
var Cu = /*#__PURE__*/ On(Tn)
globalThis.String
var wu = (e, t) => n => n.slice(e, t),
  Tu = e => e.length === 0,
  Eu = e => e.length > 0,
  Du = /*#__PURE__*/ o(2, (e, t) => {
    let n = e.split(t)
    return qe(n) ? n : [e]
  }),
  Ou = (e, t) => n => n.startsWith(e, t),
  ku = e => t => Ln(k(t.lastIndexOf(e)), Cu(0)),
  Au = /*#__PURE__*/ o(2, (e, t) => ks(e, Pu, e => t(e))),
  ju = e => e.reasons.some(Mu),
  Mu = e => e._tag === 'Fail' && Cl(e.error),
  Nu = /*#__PURE__*/ pa(xl, e => (Cl(e) ? Bn(e) : Vn(e))),
  Pu = /*#__PURE__*/ pa(xl, e => (Cl(e) ? Bn(e.value) : Vn(e))),
  Fu = e => {
    let t = Nu(e)
    return Un(t) ? El(t.failure) : Tl(t.success.value)
  },
  Iu = (e, t, n) =>
    oc(r => I(n?.local ? su(t, iu(), r) : cu(t, r), t => Ss(e, t))),
  Lu = /*#__PURE__*/ o(
    e => St(e[0]),
    (e, t, n) => (_i(t) ? Ss(e, t) : Iu(e, Array.isArray(t) ? pu(...t) : t, n)),
  ),
  Ru = Cc,
  zu = Tc,
  Bu = wc,
  Vu = Po,
  L = N,
  Hu = Oo,
  Uu = Do,
  Wu = F,
  R = P,
  Gu = Mo,
  Ku = zo,
  z = Bo,
  B = To,
  qu = wo,
  Ju = ko,
  Yu = Ao,
  Xu = No,
  Zu = Eo,
  Qu = D,
  V = I,
  $u = es,
  ed = Jo,
  td = Yo,
  nd = Vs,
  H = ts,
  rd = Ko,
  id = Xo,
  ad = As,
  od = Ds,
  U = js,
  sd = Ns,
  cd = Ps,
  ld = sl,
  ud = Ts,
  dd = Is,
  fd = ys,
  pd = xs,
  md = Lu,
  hd = Ss,
  gd = Cs,
  _d = rc,
  vd = ac,
  yd = sc,
  bd = cc,
  xd = dc,
  Sd = pc,
  Cd = uc,
  wd = gc,
  Td = hc,
  Ed = _c,
  Dd = Es,
  Od = el,
  kd = Ac,
  Ad = Mc,
  jd = Nc,
  Md = Ic,
  Nd = Pc,
  Pd = zc,
  Fd = Rc,
  Id = Vo
di()('effect/Effect/Transaction')
var Ld = ns,
  Rd = rs,
  zd = $o,
  Bd = Uo
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/internal/record.js
function Vd(e, t, n) {
  return (
    t === '__proto__'
      ? Object.defineProperty(e, t, {
          value: n,
          writable: !0,
          enumerable: !0,
          configurable: !0,
        })
      : (e[t] = n),
    e
  )
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/internal/schema/annotations.js
function Hd(e) {
  return e.checks ? e.checks[e.checks.length - 1].annotations : e.annotations
}
function Ud(e) {
  return t => Hd(t)?.[e]
}
var Wd = /*#__PURE__*/ Ud('identifier'),
  Gd = /*#__PURE__*/ h(e => {
    let t = Wd(e)
    return typeof t == 'string' ? t : e.getExpected(Gd)
  }),
  Kd = '~effect/SchemaIssue/Issue'
function qd(e) {
  return y(e, Kd)
}
var Jd = class {
    [Kd] = Kd
    toString() {
      return hf(this)
    }
  },
  Yd = class extends Jd {
    _tag = 'Filter'
    actual
    filter
    issue
    constructor(e, t, n) {
      ;(super(), (this.actual = e), (this.filter = t), (this.issue = n))
    }
  },
  Xd = class extends Jd {
    _tag = 'Encoding'
    ast
    actual
    issue
    constructor(e, t, n) {
      ;(super(), (this.ast = e), (this.actual = t), (this.issue = n))
    }
  },
  Zd = class extends Jd {
    _tag = 'Pointer'
    path
    issue
    constructor(e, t) {
      ;(super(), (this.path = e), (this.issue = t))
    }
  },
  Qd = class extends Jd {
    _tag = 'MissingKey'
    annotations
    constructor(e) {
      ;(super(), (this.annotations = e))
    }
  },
  $d = class extends Jd {
    _tag = 'UnexpectedKey'
    ast
    actual
    constructor(e, t) {
      ;(super(), (this.ast = e), (this.actual = t))
    }
  },
  ef = class extends Jd {
    _tag = 'Composite'
    ast
    actual
    issues
    constructor(e, t, n) {
      ;(super(), (this.ast = e), (this.actual = t), (this.issues = n))
    }
  },
  tf = class extends Jd {
    _tag = 'InvalidType'
    ast
    actual
    constructor(e, t) {
      ;(super(), (this.ast = e), (this.actual = t))
    }
  },
  nf = class extends Jd {
    _tag = 'InvalidValue'
    actual
    annotations
    constructor(e, t) {
      ;(super(), (this.actual = e), (this.annotations = t))
    }
  },
  rf = class extends Jd {
    _tag = 'AnyOf'
    ast
    actual
    issues
    constructor(e, t, n) {
      ;(super(), (this.ast = e), (this.actual = t), (this.issues = n))
    }
  },
  af = class extends Jd {
    _tag = 'OneOf'
    ast
    actual
    successes
    constructor(e, t, n) {
      ;(super(), (this.ast = e), (this.actual = t), (this.successes = n))
    }
  }
function of(e, t) {
  if (qd(t)) return t
  if (typeof t == 'string') return new nf(k(e), { message: t })
  let n =
    typeof t.issue == 'string' ? new nf(k(e), { message: t.issue }) : t.issue
  return new Zd(t.path, n)
}
function sf(e, t) {
  if (t !== void 0)
    return typeof t == 'boolean' ? (t ? void 0 : new nf(k(e))) : of(e, t)
}
function cf(e, t, n) {
  return Array.isArray(n)
    ? mr(n)
      ? n.length === 1
        ? of(e, n[0])
        : new ef(
            t,
            k(e),
            Nr(n, t => of(e, t)),
          )
      : void 0
    : sf(e, n)
}
var lf = e => {
    let t = _f(e)
    if (t !== void 0) return t
    switch (e._tag) {
      case 'InvalidType':
        return df(Gd(e.ast), yf(e.actual))
      case 'InvalidValue':
        return `Invalid data ${yf(e.actual)}`
      case 'MissingKey':
        return 'Missing key'
      case 'UnexpectedKey':
        return `Unexpected key with value ${et(e.actual)}`
      case 'Forbidden':
        return 'Forbidden operation'
      case 'OneOf':
        return `Expected exactly one member to match the input ${et(e.actual)}`
    }
  },
  uf = e => _f(e.issue) ?? _f(e)
function df(e, t) {
  return `Expected ${e}, got ${t}`
}
function ff(e, t, n, r) {
  switch (e._tag) {
    case 'Filter': {
      let i = r(e)
      if (i !== void 0)
        return [
          {
            path: t,
            message: i,
          },
        ]
      switch (e.issue._tag) {
        case 'InvalidValue':
          return [
            {
              path: t,
              message: df(pf(e.filter), et(e.actual)),
            },
          ]
        default:
          return ff(e.issue, t, n, r)
      }
    }
    case 'Encoding':
      return ff(e.issue, t, n, r)
    case 'Pointer':
      return ff(e.issue, [...t, ...e.path], n, r)
    case 'Composite':
      return e.issues.flatMap(e => ff(e, t, n, r))
    case 'AnyOf': {
      let i = _f(e)
      return e.issues.length === 0
        ? i === void 0
          ? [
              {
                path: t,
                message: df(Gd(e.ast), et(e.actual)),
              },
            ]
          : [
              {
                path: t,
                message: i,
              },
            ]
        : e.issues.flatMap(e => ff(e, t, n, r))
    }
    default:
      return [
        {
          path: t,
          message: n(e),
        },
      ]
  }
}
function pf(e) {
  let t = e.annotations?.expected
  if (typeof t == 'string') return t
  switch (e._tag) {
    case 'Filter':
      return '<filter>'
    case 'FilterGroup':
      return e.checks.map(e => pf(e)).join(' & ')
  }
}
function mf() {
  return e => ff(e, [], lf, uf).map(gf).join('\n')
}
var hf = /*#__PURE__*/ mf()
function gf(e) {
  let t = e.message
  if (e.path && e.path.length > 0) {
    let n = rt(e.path)
    t += `\n  at ${n}`
  }
  return t
}
function _f(e) {
  switch (e._tag) {
    case 'InvalidType':
    case 'OneOf':
    case 'Composite':
    case 'AnyOf':
      return vf(e.ast.annotations)
    case 'InvalidValue':
    case 'Forbidden':
      return vf(e.annotations)
    case 'MissingKey':
      return vf(e.annotations, 'messageMissingKey')
    case 'UnexpectedKey':
      return vf(e.ast.annotations, 'messageUnexpectedKey')
    case 'Filter':
      return vf(e.filter.annotations)
    case 'Encoding':
      return _f(e.issue)
  }
}
function vf(e, t = 'message') {
  let n = e?.[t]
  if (typeof n == 'string') return n
}
function yf(e) {
  return A(e) ? 'no value provided' : et(e.value)
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/internal/schema/cause.js
function bf(e) {
  let t
  for (let n of e.reasons) {
    if (!hl(n) || !qd(n.error)) return
    t ??= n.error
  }
  return t
}
function xf(e, t) {
  let n = bf(e)
  if (n === void 0) throw Error(t, { cause: e })
  return n
}
;(di()('effect/DateTime/CurrentTimeZone'), _u('EncodingError'))
var Sf = class e extends a {
    run
    constructor(e) {
      ;(super(), (this.run = e))
    }
    map(t) {
      return new e((e, n) => this.run(e, n).pipe(Ld(Pn(t))))
    }
    compose(t) {
      return wf(this)
        ? t
        : wf(t)
          ? this
          : new e((e, n) => this.run(e, n).pipe(zd(e => t.run(e, n))))
    }
  },
  Cf = /*#__PURE__*/ new Sf(L)
function wf(e) {
  return e.run === Cf.run
}
function Tf() {
  return Cf
}
function Ef(e) {
  return new Sf((t, n) => (A(t) ? Hu : e(t.value, n)))
}
function Df(e) {
  return kf(Pn(e))
}
function Of(e) {
  return Ef((t, n) => e(t, n).pipe(Ld(k)))
}
function kf(e) {
  return new Sf(t => L(e(t)))
}
function Af() {
  return new Sf(() => Hu)
}
function jf(e) {
  return new Sf(t => {
    let n = Ln(t, oe)
    return j(n) ? L(n) : Ld(e, k)
  })
}
function Mf() {
  return Df(globalThis.String)
}
function Nf() {
  return Df(globalThis.Number)
}
function Pf(e) {
  return Ef(t =>
    Xu({
      try: () => k(JSON.parse(t, e?.reviver)),
      catch: e => new nf(k(t), { message: globalThis.String(e) }),
    }),
  )
}
function Ff(e) {
  return Ef(t =>
    Xu({
      try: () => k(JSON.stringify(t, e?.replacer, e?.space)),
      catch: e => new nf(k(t), { message: globalThis.String(e) }),
    }),
  )
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/SchemaTransformation.js
var If = '~effect/SchemaTransformation/Transformation',
  Lf = class e {
    [If] = If
    _tag = 'Transformation'
    decode
    encode
    constructor(e, t) {
      ;((this.decode = e), (this.encode = t))
    }
    flip() {
      return new e(this.encode, this.decode)
    }
    compose(t) {
      return new e(this.decode.compose(t.decode), t.encode.compose(this.encode))
    }
  }
function Rf(e) {
  return y(e, If)
}
var zf = e => (Rf(e) ? e : new Lf(e.decode, e.encode))
function Bf(e) {
  return new Lf(Of(e.decode), Of(e.encode))
}
function Vf(e) {
  return new Lf(Df(e.decode), Df(e.encode))
}
var Hf = /*#__PURE__*/ new Lf(/*#__PURE__*/ Tf(), /*#__PURE__*/ Tf())
function Uf() {
  return Hf
}
var Wf = /*#__PURE__*/ new Lf(/*#__PURE__*/ Nf(), /*#__PURE__*/ Mf()),
  Gf = /*#__PURE__*/ new Lf(/*#__PURE__*/ Pf(), /*#__PURE__*/ Ff())
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/SchemaAST.js
function Kf(e) {
  return t => t._tag === e
}
var qf = /*#__PURE__*/ Kf('Declaration'),
  Jf = /*#__PURE__*/ Kf('Never'),
  Yf = /*#__PURE__*/ Kf('Literal'),
  Xf = /*#__PURE__*/ Kf('UniqueSymbol'),
  Zf = /*#__PURE__*/ Kf('Arrays'),
  Qf = /*#__PURE__*/ Kf('Objects'),
  $f = class {
    to
    transformation
    constructor(e, t) {
      ;((this.to = e), (this.transformation = t))
    }
  },
  ep = {},
  tp = class {
    isOptional
    isMutable
    defaultValue
    annotations
    constructor(e, t, n = void 0, r = void 0) {
      ;((this.isOptional = e),
        (this.isMutable = t),
        (this.defaultValue = n),
        (this.annotations = r))
    }
  },
  np = '~effect/Schema',
  rp = class {
    [np] = np
    annotations
    checks
    encoding
    context
    constructor(e = void 0, t = void 0, n = void 0, r = void 0) {
      ;((this.annotations = e),
        (this.checks = t),
        (this.encoding = n),
        (this.context = r))
    }
    toString() {
      return `<${this._tag}>`
    }
  },
  ip = class e extends rp {
    _tag = 'Declaration'
    typeParameters
    run
    encodingChecks
    constructor(e, t, n, r, i, a, o) {
      ;(super(n, r, i, a),
        (this.typeParameters = e),
        (this.run = t),
        (this.encodingChecks = o))
    }
    getParser() {
      let e = this.run(this.typeParameters)
      return (t, n) => (A(t) ? Hu : Ld(e(t.value, this, n), k))
    }
    _rebuild(t, n, r) {
      let i = lm(this.typeParameters, t)
      return i === this.typeParameters &&
        n === this.checks &&
        r === this.encodingChecks
        ? this
        : new e(i, this.run, this.annotations, n, void 0, this.context, r)
    }
    recur(e) {
      return this._rebuild(e, this.checks, this.encodingChecks)
    }
    flip(e) {
      return this._rebuild(e, this.encodingChecks, this.checks)
    }
    getExpected() {
      let e = this.annotations?.expected
      return typeof e == 'string' ? e : '<Declaration>'
    }
  },
  ap = /*#__PURE__*/ new (class extends rp {
    _tag = 'Null'
    getParser() {
      return Cm(this, null)
    }
    getExpected() {
      return 'null'
    }
  })(),
  op = class extends rp {
    _tag = 'Undefined'
    getParser() {
      return Cm(this, void 0)
    }
    toCodecJson() {
      return em(this, [sp])
    }
    getExpected() {
      return 'undefined'
    }
  },
  sp = /*#__PURE__*/ new $f(
    ap,
    /*#__PURE__*/ new Lf(
      /*#__PURE__*/ Df(() => void 0),
      /*#__PURE__*/ Df(() => null),
    ),
  ),
  cp = /*#__PURE__*/ new op(),
  lp = /*#__PURE__*/ new (class extends rp {
    _tag = 'Unknown'
    getParser() {
      return wm(this, le)
    }
    getExpected() {
      return 'unknown'
    }
  })(),
  up = class extends rp {
    _tag = 'Literal'
    literal
    constructor(e, t, n, r, i) {
      if (
        (super(t, n, r, i),
        typeof e == 'number' && !globalThis.Number.isFinite(e))
      )
        throw Error(`A numeric literal must be finite, got ${et(e)}`)
      this.literal = e
    }
    getParser() {
      return Cm(this, this.literal)
    }
    matchPart(e, t) {
      return e === globalThis.String(this.literal) ? this.literal : void 0
    }
    toCodecJson() {
      return typeof this.literal == 'bigint' ? dp(this) : this
    }
    toCodecStringTree() {
      return typeof this.literal == 'string' ? this : dp(this)
    }
    getExpected() {
      return typeof this.literal == 'string'
        ? JSON.stringify(this.literal)
        : globalThis.String(this.literal)
    }
  }
function dp(e) {
  let t = globalThis.String(e.literal)
  return em(e, [
    new $f(
      new up(t),
      new Lf(
        Df(() => e.literal),
        Df(() => t),
      ),
    ),
  ])
}
var fp = /*#__PURE__*/ new (class extends rp {
    _tag = 'String'
    getParser() {
      return wm(this, v)
    }
    matchPart(e, t) {
      return Tm(this, e, t)
    }
    getExpected() {
      return 'string'
    }
  })(),
  pp = class extends rp {
    _tag = 'Number'
    getParser() {
      return wm(this, ee)
    }
    matchKey(e, t) {
      return this._match(km, e, t)
    }
    matchPart(e, t) {
      return this._match(Om, e, t)
    }
    _match(e, t, n) {
      return e.test(t) ? Tm(this, globalThis.Number(t), n) : void 0
    }
    toCodecJson() {
      return this.checks &&
        (mp(this.checks, 'isFinite') || mp(this.checks, 'isInt'))
        ? this
        : em(this, [Gp])
    }
    toCodecStringTree() {
      return this.checks &&
        (mp(this.checks, 'isFinite') || mp(this.checks, 'isInt'))
        ? em(this, [Mm])
        : em(this, [Nm])
    }
    getExpected() {
      return 'number'
    }
  }
function mp(e, t) {
  return e.some(e => {
    switch (e._tag) {
      case 'Filter':
        return e.annotations?.meta?._tag === t
      case 'FilterGroup':
        return mp(e.checks, t)
    }
  })
}
var hp = /*#__PURE__*/ new pp(),
  gp = /*#__PURE__*/ new (class extends rp {
    _tag = 'Boolean'
    getParser() {
      return wm(this, te)
    }
    getExpected() {
      return 'boolean'
    }
  })(),
  _p = class e extends rp {
    _tag = 'Arrays'
    isMutable
    elements
    rest
    encodingChecks
    constructor(e, t, n, r, i, a, o, s) {
      ;(super(r, i, a, o),
        (this.isMutable = e),
        (this.elements = t),
        (this.rest = n),
        (this.encodingChecks = s))
      let c = t.findIndex(_m)
      if (c !== -1 && (t.slice(c + 1).some(e => !_m(e)) || n.length > 1))
        throw Error(
          'A required element cannot follow an optional element. ts(1257)',
        )
      if (n.length > 1 && n.slice(1).some(_m))
        throw Error(
          'An optional element cannot follow a rest element. ts(1266)',
        )
    }
    getParser(e) {
      let t = this,
        n = t.elements.map(t => ({
          ast: t,
          parser: e(t),
        })),
        r = t.rest.map(t => ({
          ast: t,
          parser: e(t),
        })),
        i = n.length,
        [a, ...o] = r,
        s = o.length
      function c(e, t) {
        return t < i ? n[t] : t >= e ? o[t - e] : a
      }
      return Bd(function* (e, n) {
        if (e._tag === 'None') return e
        let r = e.value
        if (!Array.isArray(r)) return yield* B(new tf(t, e))
        let a = r.length,
          o = {
            ast: t,
            getParser: c,
            oinput: e,
            len: a,
            tailThreshold: yp(a, i, s),
            output: new globalThis.Array(a),
            issues: void 0,
            options: n,
          },
          l = vp(o, r, {
            concurrency: bp(n?.concurrency)?.concurrency,
            end: t.rest.length === 0 ? i : Math.max(a, i + s),
          })
        if ((l && (yield* l), t.rest.length === 0 && a > i))
          for (let s = i; s <= a - 1; s++) {
            let i = new Zd([s], new $d(t, r[s]))
            if (n.errors === 'all')
              o.issues ? o.issues.push(i) : (o.issues = [i])
            else return yield* B(new ef(t, e, [i]))
          }
        return o.issues ? yield* B(new ef(t, e, o.issues)) : k(o.output)
      })
    }
    _rebuild(t, n, r) {
      let i = lm(this.elements, t),
        a = lm(this.rest, t)
      return i === this.elements &&
        a === this.rest &&
        n === this.checks &&
        r === this.encodingChecks
        ? this
        : new e(
            this.isMutable,
            i,
            a,
            this.annotations,
            n,
            void 0,
            this.context,
            r,
          )
    }
    recur(e) {
      return this._rebuild(e, this.checks, this.encodingChecks)
    }
    flip(e) {
      return this._rebuild(e, this.encodingChecks, this.checks)
    }
    getExpected() {
      return 'array'
    }
  },
  vp = /*#__PURE__*/ Oc()({
    onItem(e, t, n) {
      let r = n < e.len ? k(t) : O()
      return e.getParser(e.tailThreshold, n).parser(r, e.options)
    },
    step(e, t, n, r) {
      if (n._tag === 'Failure') return xp(e, e.ast, r, n)
      if (n.value._tag === 'Some') e.output[r] = n.value.value
      else {
        let t = e.getParser(e.tailThreshold, r)
        if (_m(t.ast)) return
        let n = new Zd([r], new Qd(t.ast.context?.annotations))
        if (e.options.errors === 'all')
          e.issues ? e.issues.push(n) : (e.issues = [n])
        else return Dl(new ef(e.ast, e.oinput, [n]))
      }
    },
  })
function yp(e, t, n) {
  return Math.max(t, e - n)
}
var bp = e => (
    (e = e === 'unbounded' ? Infinity : (e ?? 1)),
    e > 1 ? { concurrency: e } : void 0
  ),
  xp = (e, t, n, r) => {
    if (r.cause.reasons.length === 0) return r
    let i = bf(r.cause)
    if (i === void 0)
      return El(yl(r.cause, r => new ef(t, e.oinput, [new Zd([n], r)])))
    let a = new Zd([n], i)
    if (e.options.errors === 'all')
      e.issues ? e.issues.push(a) : (e.issues = [a])
    else return Dl(new ef(t, e.oinput, [a]))
  },
  Sp = '[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?'
function Cp(e, t, n = ep) {
  let r, i
  function a(t) {
    switch (t._tag) {
      case 'String':
      case 'TemplateLiteral':
        return (r ??= Object.keys(e)).filter(e => t.matchPart(e, n) !== void 0)
      case 'Number':
        return (r ??= Object.keys(e)).filter(e => t.matchKey(e, n) !== void 0)
      case 'Symbol':
        return (i ??= Object.getOwnPropertySymbols(e)).filter(
          e => t.matchKey(e, n) !== void 0,
        )
      case 'Union':
        return [...new Set(t.types.flatMap(a))]
      default:
        return []
    }
  }
  return a(Em(ym(t)))
}
var wp = class {
    name
    type
    constructor(e, t) {
      ;((this.name = e), (this.type = t))
    }
  },
  Tp = class e {
    decode
    encode
    constructor(e, t) {
      ;((this.decode = e), (this.encode = t))
    }
    flip() {
      return new e(this.encode, this.decode)
    }
  }
function Ep(e) {
  switch (e._tag) {
    case 'String':
    case 'Number':
    case 'Symbol':
    case 'TemplateLiteral':
      return !0
    case 'Union':
      return e.types.every(Ep)
    default:
      return !1
  }
}
function Dp(e) {
  return Ep(e) && Ep(ym(e))
}
var Op = class {
    parameter
    type
    merge
    constructor(e, t, n) {
      if (!Dp(e)) throw Error(`Invalid index signature parameter ${e._tag}`)
      if (
        ((this.parameter = e),
        (this.type = t),
        (this.merge = n),
        _m(t) && !Sm(t))
      )
        throw Error(
          'Cannot use `Schema.optionalKey` with index signatures, use `Schema.optional` instead.',
        )
    }
  },
  kp = class e extends rp {
    _tag = 'Objects'
    propertySignatures
    indexSignatures
    encodingChecks
    constructor(e, t, n, r, i, a, o) {
      ;(super(n, r, i, a),
        (this.propertySignatures = e),
        (this.indexSignatures = t),
        (this.encodingChecks = o))
      let s = e.map(e => e.name).filter((e, t, n) => n.indexOf(e) !== t)
      if (s.length > 0)
        throw Error(`Duplicate identifiers: ${JSON.stringify(s)}. ts(2300)`)
    }
    getParser(e) {
      let t = this,
        n = [],
        r = /* @__PURE__ */ new Set(),
        i = []
      for (let a of t.propertySignatures)
        (n.push(a.name),
          r.add(a.name),
          i.push({
            ps: a,
            parser: e(a.type),
            name: a.name,
            type: a.type,
          }))
      let a = t.indexSignatures.length
      if (t.propertySignatures.length === 0 && t.indexSignatures.length === 0)
        return wm(t, ce)
      let o =
        a > 0
          ? Oc()({
              onItem: Bd(function* (n, [i, a]) {
                let o = e(Em(a.parameter))(k(i), n.options),
                  s = Qo(o) ? o : yield* nd(o)
                if (s._tag === 'Failure') {
                  let e = xp(n, t, i, s)
                  e && (yield* e)
                  return
                }
                let c = k(n.input[i]),
                  l = e(a.type)(c, n.options),
                  u = Qo(l) ? l : yield* nd(l)
                if (u._tag === 'Failure') {
                  let e = xp(n, t, i, u)
                  e && (yield* e)
                  return
                } else if (s.value._tag === 'Some' && u.value._tag === 'Some') {
                  let e = s.value.value
                  if (r.has(i) || r.has(e)) return
                  let t = u.value.value
                  if (a.merge && a.merge.decode && Object.hasOwn(n.out, e)) {
                    let [r, i] = a.merge.decode.combine([e, n.out[e]], [e, t])
                    Vd(n.out, r, i)
                  } else Vd(n.out, e, t)
                }
              }),
              step: (e, t, n) => (n._tag === 'Failure' ? n : void 0),
            })
          : void 0
      return Bd(function* (e, s) {
        if (e._tag === 'None') return e
        let c = e.value
        if (!(typeof c == 'object' && c && !Array.isArray(c)))
          return yield* B(new tf(t, e))
        let l = {},
          u = {
            ast: t,
            oinput: e,
            input: c,
            out: l,
            issues: void 0,
            options: s,
          },
          d = s.errors === 'all',
          f = s.onExcessProperty === 'error',
          p = s.onExcessProperty === 'preserve',
          m
        if (t.indexSignatures.length === 0 && (f || p)) {
          m = Reflect.ownKeys(c)
          for (let n = 0; n < m.length; n++) {
            let i = m[n]
            if (!r.has(i))
              if (f) {
                let n = new Zd([i], new $d(t, c[i]))
                if (d) {
                  u.issues ? u.issues.push(n) : (u.issues = [n])
                  continue
                } else return yield* B(new ef(t, e, [n]))
              } else Vd(l, i, c[i])
          }
        }
        let h = bp(s?.concurrency),
          g = Ap(u, i, h)
        if ((g && (yield* g), o)) {
          let e = jr()
          for (let n = 0; n < a; n++) {
            let r = t.indexSignatures[n],
              i = Cp(c, r.parameter, s)
            for (let t = 0; t < i.length; t++) {
              let n = i[t]
              e.push([n, r])
            }
          }
          let n = o(u, e, h)
          n && (yield* n)
        }
        if (u.issues) return yield* B(new ef(t, e, u.issues))
        if (s.propertyOrder === 'original') {
          let e = (m ?? Reflect.ownKeys(c)).concat(n),
            t = {}
          for (let n of e) Object.hasOwn(l, n) && Vd(t, n, l[n])
          return k(t)
        }
        return k(l)
      })
    }
    _rebuild(t, n, r, i, a) {
      let o = lm(this.propertySignatures, e => {
          let n = t(e.type)
          return n === e.type ? e : new wp(e.name, n)
        }),
        s = lm(this.indexSignatures, e => {
          let i = n(e.parameter),
            a = t(e.type),
            o = r ? e.merge?.flip() : e.merge
          return i === e.parameter && a === e.type && o === e.merge
            ? e
            : new Op(i, a, o)
        })
      return o === this.propertySignatures &&
        s === this.indexSignatures &&
        i === this.checks &&
        a === this.encodingChecks
        ? this
        : new e(o, s, this.annotations, i, void 0, this.context, a)
    }
    flip(e) {
      return this._rebuild(e, e, !0, this.encodingChecks, this.checks)
    }
    recur(e, t = e) {
      return this._rebuild(e, t, !1, this.checks, this.encodingChecks)
    }
    getExpected() {
      return this.propertySignatures.length === 0 &&
        this.indexSignatures.length === 0
        ? 'object | array'
        : 'object'
    }
  },
  Ap = /*#__PURE__*/ Oc()({
    onItem(e, t) {
      let n = Object.hasOwn(e.input, t.name) ? k(e.input[t.name]) : O()
      return t.parser(n, e.options)
    },
    step(e, t, n) {
      if (n._tag === 'Failure') return xp(e, e.ast, t.name, n)
      if (n.value._tag === 'Some') Vd(e.out, t.name, n.value.value)
      else if (!_m(t.type)) {
        let n = new Zd([t.name], new Qd(t.type.context?.annotations))
        if (e.options.errors === 'all') {
          e.issues ? e.issues.push(n) : (e.issues = [n])
          return
        } else return Dl(new ef(e.ast, e.oinput, [n]))
      }
    },
  })
function jp(e, t) {
  return e ? (t ? [...e, ...t] : e) : t
}
function Mp(e, t, n) {
  return new kp(
    Reflect.ownKeys(e).map(t => new wp(t, e[t].ast)),
    [],
    n,
    t,
  )
}
function Np(e) {
  return e.ast
}
function Pp(e, t = void 0) {
  return new _p(
    !1,
    e.map(e => e.ast),
    [],
    void 0,
    t,
  )
}
function Fp(e, t, n) {
  return new Hp(e.map(Np), t, void 0, n)
}
function Ip(e) {
  switch (e._tag) {
    case 'Null':
      return ['null']
    case 'Undefined':
      return ['undefined']
    case 'String':
    case 'TemplateLiteral':
      return ['string']
    case 'Number':
      return ['number']
    case 'Boolean':
      return ['boolean']
    case 'Symbol':
    case 'UniqueSymbol':
      return ['symbol']
    case 'BigInt':
      return ['bigint']
    case 'Arrays':
      return ['array']
    case 'ObjectKeyword':
      return ['object', 'array', 'function']
    case 'Objects':
      return e.propertySignatures.length || e.indexSignatures.length
        ? ['object']
        : ['object', 'array']
    case 'Enum':
      return Array.from(new Set(e.enums.map(([, e]) => typeof e)))
    case 'Literal':
      return [typeof e.literal]
    case 'Union':
      return Array.from(new Set(e.types.flatMap(Ip)))
    default:
      return [
        'null',
        'undefined',
        'string',
        'number',
        'boolean',
        'symbol',
        'bigint',
        'object',
        'array',
        'function',
      ]
  }
}
function Lp(e) {
  switch (e._tag) {
    default:
      return []
    case 'Declaration': {
      let t = e.annotations?.['~sentinels']
      return Array.isArray(t) ? t : []
    }
    case 'Objects':
      return e.propertySignatures.flatMap(e => {
        let t = e.type
        if (!_m(t)) {
          if (Yf(t))
            return [
              {
                key: e.name,
                literal: t.literal,
              },
            ]
          if (Xf(t))
            return [
              {
                key: e.name,
                literal: t.symbol,
              },
            ]
        }
        return []
      })
    case 'Arrays':
      return e.elements.flatMap((e, t) =>
        Yf(e) && !_m(e)
          ? [
              {
                key: t,
                literal: e.literal,
              },
            ]
          : [],
      )
    case 'Suspend':
      return Lp(e.thunk())
  }
}
var Rp = /*#__PURE__*/ new WeakMap()
function zp(e) {
  let t = Rp.get(e)
  if (t) return t
  t = {}
  for (let n of e) {
    let e = ym(n)
    if (Jf(e)) continue
    let r = Ip(e),
      i = Lp(e)
    t.byType ??= {}
    for (let e of r) (t.byType[e] ??= []).push(n)
    if (i.length > 0) {
      t.bySentinel ??= /* @__PURE__ */ new Map()
      for (let { key: e, literal: r } of i) {
        let i = t.bySentinel.get(e)
        i || t.bySentinel.set(e, (i = /* @__PURE__ */ new Map()))
        let a = i.get(r)
        ;(a || i.set(r, (a = [])), a.push(n))
      }
    } else {
      t.otherwise ??= {}
      for (let e of r) (t.otherwise[e] ??= []).push(n)
    }
  }
  return (Rp.set(e, t), t)
}
function Bp(e) {
  return t => {
    let n = ym(t)
    return n._tag === 'Literal'
      ? n.literal === e
      : n._tag === 'UniqueSymbol'
        ? n.symbol === e
        : !0
  }
}
function Vp(e, t) {
  let n = zp(t),
    r = e === null ? 'null' : Array.isArray(e) ? 'array' : typeof e
  if (n.bySentinel) {
    let t = n.otherwise?.[r] ?? []
    if (r === 'object' || r === 'array') {
      for (let [r, i] of n.bySentinel)
        if (Object.hasOwn(e, r)) {
          let n = i.get(e[r])
          if (n) return [...n, ...t].filter(Bp(e))
        }
    }
    return t
  }
  return (n.byType?.[r] ?? []).filter(Bp(e))
}
var Hp = class e extends rp {
    _tag = 'Union'
    types
    mode
    encodingChecks
    constructor(e, t, n, r, i, a, o) {
      ;(super(n, r, i, a),
        (this.types = e),
        (this.mode = t),
        (this.encodingChecks = o))
    }
    getParser(e) {
      let t = this
      return (n, r) => {
        if (n._tag === 'None') return L(n)
        let i = n.value,
          a = Vp(i, t.types),
          o = {
            ast: t,
            recur: e,
            oinput: n,
            input: i,
            out: void 0,
            successes: [],
            issues: void 0,
            options: r,
          },
          s = Up(o, a, bp(r?.concurrency))
        return s
          ? V(s, e => (o.out ? L(o.out) : B(new rf(t, i, o.issues ?? []))))
          : o.out
            ? L(o.out)
            : B(new rf(t, i, o.issues ?? []))
      }
    }
    _rebuild(t, n, r) {
      let i = lm(this.types, t)
      return i === this.types && n === this.checks && r === this.encodingChecks
        ? this
        : new e(i, this.mode, this.annotations, n, void 0, this.context, r)
    }
    recur(e) {
      return this._rebuild(e, this.checks, this.encodingChecks)
    }
    flip(e) {
      return this._rebuild(e, this.encodingChecks, this.checks)
    }
    matchPart(e, t) {
      for (let n of this.types) {
        let r = n.matchPart(e, t)
        if (r !== void 0) return r
      }
    }
    getExpected(e) {
      let t = this.annotations?.expected
      if (typeof t == 'string') return t
      if (this.types.length === 0) return 'never'
      let n = this.types.map(t => {
        let n = ym(t)
        switch (n._tag) {
          case 'Arrays': {
            let t = n.elements.filter(Yf)
            if (t.length > 0)
              return `${Kp(n.isMutable)}[ ${t.map(t => e(t) + qp(t.context?.isOptional)).join(', ')}, ... ]`
            break
          }
          case 'Objects': {
            let t = n.propertySignatures.filter(e => Yf(e.type))
            if (t.length > 0)
              return `{ ${t.map(t => `${Kp(t.type.context?.isMutable)}${nt(t.name)}${qp(t.type.context?.isOptional)}: ${e(t.type)}`).join(', ')}, ... }`
            break
          }
        }
        return e(n)
      })
      return Array.from(new Set(n)).join(' | ')
    }
  },
  Up = /*#__PURE__*/ Oc()({
    onItem(e, t) {
      return e.recur(t)(e.oinput, e.options)
    },
    step(e, t, n) {
      if (n._tag === 'Failure') {
        let t = bf(n.cause)
        if (t === void 0) return n
        e.issues ? e.issues.push(t) : (e.issues = [t])
      } else {
        if (e.out && e.ast.mode === 'oneOf')
          return (e.successes.push(t), Dl(new af(e.ast, e.input, e.successes)))
        if (((e.out = n.value), e.successes.push(t), e.ast.mode === 'anyOf'))
          return kl
      }
    },
  }),
  Wp = /*#__PURE__*/ new Hp(
    [
      /*#__PURE__*/ new up('Infinity'),
      /*#__PURE__*/ new up('-Infinity'),
      /*#__PURE__*/ new up('NaN'),
    ],
    'anyOf',
  ),
  Gp = /*#__PURE__*/ new $f(
    /*#__PURE__*/ new Hp([hp, Wp], 'anyOf'),
    /*#__PURE__*/ new Lf(
      /*#__PURE__*/ Nf(),
      /*#__PURE__*/ Df(e =>
        globalThis.Number.isFinite(e) ? e : globalThis.String(e),
      ),
    ),
  )
function Kp(e) {
  return e ? '' : 'readonly '
}
function qp(e) {
  return e ? '?' : ''
}
function Jp(e) {
  let t = !1,
    n
  return () => (t ? n : ((n = e()), (t = !0), n))
}
var Yp = class e extends a {
    _tag = 'Filter'
    run
    annotations
    aborted
    constructor(e, t = void 0, n = !1) {
      ;(super(), (this.run = e), (this.annotations = t), (this.aborted = n))
    }
    annotate(t) {
      return new e(
        this.run,
        {
          ...this.annotations,
          ...t,
        },
        this.aborted,
      )
    }
    abort() {
      return new e(this.run, this.annotations, !0)
    }
    and(e, t) {
      return new Xp([this, e], t)
    }
  },
  Xp = class e extends a {
    _tag = 'FilterGroup'
    checks
    annotations
    constructor(e, t = void 0) {
      ;(super(), (this.checks = e), (this.annotations = t))
    }
    annotate(t) {
      return new e(this.checks, {
        ...this.annotations,
        ...t,
      })
    }
    and(t, n) {
      return new e([this, t], n)
    }
  }
function Zp(e, t, n = !1) {
  return new Yp((t, n, r) => cf(t, n, e(t, n, r)), t, n)
}
function Qp(e, t) {
  let n = e.source
  return Zp(t => e.test(t), {
    expected: `a string matching the RegExp ${n}`,
    meta: {
      _tag: 'isPattern',
      regExp: e,
    },
    arbitrary: { constraint: { patterns: [e.source] } },
    ...t,
  })
}
function $p(e, t) {
  let n = Object.getOwnPropertyDescriptors(e)
  return (t(n), Object.create(Object.getPrototypeOf(e), n))
}
function em(e, t) {
  return e.encoding === t
    ? e
    : $p(e, e => {
        e.encoding.value = t
      })
}
function tm(e, t) {
  return e.context === t
    ? e
    : $p(e, e => {
        e.context.value = t
      })
}
function nm(e, t) {
  if (e.checks) {
    let n = e.checks[e.checks.length - 1]
    return rm(e, lr(e.checks.slice(0, -1), n.annotate(t)))
  }
  return $p(e, e => {
    e.annotations.value = {
      ...e.annotations.value,
      ...t,
    }
  })
}
function rm(e, t) {
  if (e._tag === 'Suspend' && t !== void 0)
    throw Error('Cannot add checks to Suspend')
  return e.checks === t
    ? e
    : $p(e, e => {
        e.checks.value = t
      })
}
function im(e, t) {
  return rm(e, jp(e.checks, t))
}
function am(e, t) {
  let n = e,
    r = n[n.length - 1],
    i = t(r.to)
  return i === r.to
    ? e
    : lr(e.slice(0, e.length - 1), new $f(i, r.transformation))
}
function om(e) {
  return t => (t.encoding ? em(t, am(t.encoding, e)) : t)
}
function sm(e) {
  function t(n) {
    return n.encoding ? em(n, am(n.encoding, t)) : e(n)
  }
  return h(t)
}
function cm(e, t, n) {
  let r = new $f(e, t)
  return em(n, n.encoding ? [...n.encoding, r] : [r])
}
function lm(e, t) {
  let n = !1,
    r = Array(e.length)
  for (let i = 0; i < e.length; i++) {
    let a = e[i],
      o = t(a)
    ;(o !== a && (n = !0), (r[i] = o))
  }
  return n ? r : e
}
function um(e, t) {
  return tm(
    e,
    e.context
      ? new tp(
          e.context.isOptional,
          e.context.isMutable,
          e.context.defaultValue,
          {
            ...e.context.annotations,
            ...t,
          },
        )
      : new tp(!1, !1, void 0, t),
  )
}
var dm = /*#__PURE__*/ om(fm)
function fm(e) {
  return dm(
    tm(
      e,
      e.context
        ? e.context.isOptional === !1
          ? new tp(
              !0,
              e.context.isMutable,
              e.context.defaultValue,
              e.context.annotations,
            )
          : e.context
        : new tp(!0, !1),
    ),
  )
}
function pm(e, t) {
  let n = [new $f(lp, new Lf(jf(t), Tf()))]
  return tm(
    e,
    e.context
      ? new tp(
          e.context.isOptional,
          e.context.isMutable,
          n,
          e.context.annotations,
        )
      : new tp(!1, !1, n),
  )
}
function mm(e, t, n) {
  return cm(e, n, t)
}
function hm(e) {
  let t = [],
    n = []
  function r(e) {
    switch (e._tag) {
      case 'Literal':
        re(e.literal) && t.push(e.literal)
        return
      case 'UniqueSymbol':
        t.push(e.symbol)
        return
      case 'Never':
        return
      case 'Union':
        for (let t = 0; t < e.types.length; t++) r(e.types[t])
        return
      default:
        n.push(e)
    }
  }
  return (
    r(e),
    {
      literals: t,
      parameters: n,
    }
  )
}
function gm(e, t, n) {
  let { literals: r, parameters: i } = hm(e)
  return new kp(
    r.map(e => new wp(e, t)),
    i.map(e => new Op(e, t, n)),
  )
}
function _m(e) {
  return e.context?.isOptional ?? !1
}
var vm = /*#__PURE__*/ h(e => {
    if (e.encoding) return vm(em(e, void 0))
    let t = e,
      n = t.recur?.(vm) ?? t,
      r = n.encodingChecks
    return r
      ? $p(n, t => {
          ;((t.encodingChecks.value = void 0),
            n === e && (t.checks.value = jp(n.checks, r)))
        })
      : n
  }),
  ym = /*#__PURE__*/ h(e => vm(xm(e)))
function bm(e, t) {
  let n = t,
    r = n.length,
    i = n[r - 1],
    a = [new $f(xm(em(e, void 0)), n[0].transformation.flip())]
  for (let e = 1; e < r; e++)
    a.unshift(new $f(xm(n[e - 1].to), n[e].transformation.flip()))
  let o = xm(i.to)
  return o.encoding ? em(o, [...o.encoding, ...a]) : em(o, a)
}
var xm = /*#__PURE__*/ h(e => {
  if (e.encoding) return bm(e, e.encoding)
  let t = e
  return t.flip?.(xm) ?? t.recur?.(xm) ?? t
})
function Sm(e) {
  switch (e._tag) {
    case 'Undefined':
      return !0
    case 'Union':
      return e.types.some(Sm)
    default:
      return !1
  }
}
function Cm(e, t) {
  let n = Uu(t)
  return r => (r._tag === 'None' ? Hu : r.value === t ? n : B(new tf(e, r)))
}
function wm(e, t) {
  return n => (n._tag === 'None' ? Hu : t(n.value) ? L(n) : B(new tf(e, n)))
}
function Tm(e, t, n) {
  if (n?.disableChecks || e.checks === void 0) return t
  let r = []
  return (Pm(e.checks, t, r, e, n), r.length === 0 ? t : void 0)
}
var Em = /*#__PURE__*/ sm(e => {
    switch (e._tag) {
      default:
        return e
      case 'Number':
        return e.toCodecStringTree()
      case 'Union':
        return e.recur(Em)
    }
  }),
  Dm = /*#__PURE__*/ sm(e => {
    switch (e._tag) {
      default:
        return e
      case 'Symbol':
      case 'UniqueSymbol':
        return e.toCodecStringTree()
      case 'Union':
        return e.recur(Dm)
    }
  }),
  Om = /*#__PURE__*/ new globalThis.RegExp(`^${Sp}$`),
  km = /*#__PURE__*/ new globalThis.RegExp(`(?:${Sp}|Infinity|-Infinity|NaN)`)
function Am(e) {
  return Qp(Om, {
    expected: 'a string representing a finite number',
    meta: {
      _tag: 'isStringFinite',
      regExp: Om,
    },
    ...e,
  })
}
var jm = /*#__PURE__*/ im(fp, [/*#__PURE__*/ Am()]),
  Mm = /*#__PURE__*/ new $f(jm, Wf),
  Nm = /*#__PURE__*/ new $f(/*#__PURE__*/ new Hp([jm, Wp], 'anyOf'), Wf)
function Pm(e, t, n, r, i) {
  for (let a = 0; a < e.length; a++) {
    let o = e[a]
    if (o._tag === 'FilterGroup') Pm(o.checks, t, n, r, i)
    else {
      let e = o.run(t, r, i)
      if (e && (n.push(new Yd(t, o, e)), o.aborted || i?.errors !== 'all'))
        return
    }
  }
}
var Fm = '~effect/Schema/Class',
  Im = '~structural',
  Lm = Wd
function Rm(e) {
  let t = /* @__PURE__ */ new Set(),
    n = /* @__PURE__ */ new Set()
  return r(e)
  function r(e) {
    if (e === null || typeof e == 'string' || typeof e == 'boolean') return !0
    if (typeof e == 'number') return globalThis.Number.isFinite(e)
    if (typeof e != 'object' || e === void 0 || t.has(e)) return !1
    if (n.has(e)) return !0
    t.add(e)
    let i = Array.isArray(e) ? e.every(r) : Object.keys(e).every(t => r(e[t]))
    return (t.delete(e), i && n.add(e), i)
  }
}
var zm = /*#__PURE__*/ new ip(
    [],
    () => (e, t) => (Rm(e) ? L(e) : B(new tf(t, k(e)))),
    {
      typeConstructor: { _tag: 'effect/Json' },
      generation: {
        runtime: 'Schema.Json',
        Type: 'Schema.Json',
      },
      expected: 'JSON value',
      toCodecJson: () => new $f(lp, Uf()),
      toArbitrary: () => e => e.jsonValue(),
    },
  ),
  Bm = /*#__PURE__*/ new $f(
    ap,
    /*#__PURE__*/ new Lf(
      /*#__PURE__*/ Tf(),
      /*#__PURE__*/ Df(() => null),
    ),
  ),
  Vm = /*#__PURE__*/ new $f(zm, /*#__PURE__*/ Uf()),
  Hm = vo,
  Um = bo,
  Wm = xo,
  Gm = Co,
  Km = Fc,
  qm = Uc,
  Jm = Wc,
  Ym = /*#__PURE__*/ Symbol.for('effect/MutableList/Empty'),
  Xm = () => ({
    head: void 0,
    tail: void 0,
    length: 0,
  }),
  Zm = () => ({
    array: [],
    mutable: !0,
    offset: 0,
    next: void 0,
  }),
  Qm = (e, t) => {
    ;(e.tail
      ? e.tail.mutable || ((e.tail.next = Zm()), (e.tail = e.tail.next))
      : (e.head = e.tail = Zm()),
      e.tail.array.push(t),
      e.length++)
  },
  $m = (e, t) => {
    ;((e.head = {
      array: [t],
      mutable: !0,
      offset: 0,
      next: e.head,
    }),
      e.length++)
  },
  eh = e => {
    ;((e.head = e.tail = void 0), (e.length = 0))
  },
  th = (e, t) => {
    if (t <= 0 || !e.head) return []
    if (
      ((t = Math.min(t, e.length)),
      t === e.length && e.head?.offset === 0 && !e.head.next)
    ) {
      let t = e.head.array
      return (eh(e), t)
    }
    let n = Array(t),
      r = 0,
      i = e.head
    for (; i; ) {
      for (; i.offset < i.array.length; )
        if (
          ((n[r++] = i.array[i.offset]),
          i.mutable && (i.array[i.offset] = void 0),
          i.offset++,
          r === t)
        )
          return ((e.head = i), (e.length -= t), e.length === 0 && eh(e), n)
      i = i.next
    }
    return (eh(e), n)
  },
  nh = e => th(e, e.length),
  rh = e => {
    if (!e.head) return Ym
    let t = e.head.array[e.head.offset]
    return (
      e.head.mutable && (e.head.array[e.head.offset] = void 0),
      e.head.offset++,
      e.length--,
      e.head.offset === e.head.array.length &&
        (e.head.next ? (e.head = e.head.next) : eh(e)),
      t
    )
  },
  ih = (e, t) => {
    let n = [],
      r = e.head
    for (; r; ) {
      for (let e = r.offset; e < r.array.length; e++)
        t(r.array[e], e) && n.push(r.array[e])
      r = r.next
    }
    ;((e.head = e.tail =
      {
        array: n,
        mutable: !0,
        offset: 0,
        next: void 0,
      }),
      (e.length = n.length))
  },
  ah = (e, t) => ih(e, e => e !== t),
  oh = '~effect/MutableRef',
  sh = {
    [oh]: oh,
    ...bt,
    toJSON() {
      return {
        _id: 'MutableRef',
        current: ct(this.current),
      }
    },
  },
  ch = e => {
    let t = Object.create(sh)
    return ((t.current = e), t)
  },
  lh = /*#__PURE__*/ o(2, (e, t) => ((e.current = t), e)),
  uh = '~effect/PubSub',
  dh = '~effect/PubSub/Subscription',
  fh = e =>
    R(() =>
      kh(
        e.atomicPubSub(),
        /* @__PURE__ */ new Map(),
        Wl(),
        qm(!1),
        ch(!1),
        e.strategy(),
      ),
    ),
  ph = e =>
    fh({
      atomicPubSub: () => mh(e),
      strategy: () => new Ah(),
    }),
  mh = e => new Th(e?.replay ? new Nh(e.replay) : void 0),
  hh = e =>
    Ed(
      Qu(
        t => (
          lh(e.shutdownFlag, !0),
          Yl(e.scope, Ol(t.id)).pipe(
            ed(e.strategy.shutdown),
            ud(e.shutdownHook.open),
            id,
          )
        ),
      ),
    ),
  gh = /*#__PURE__*/ o(2, (e, t) =>
    e.shutdownFlag.current
      ? !1
      : e.pubsub.publish(t)
        ? (e.strategy.completeSubscribersUnsafe(e.pubsub, e.subscribers), !0)
        : !1,
  ),
  _h = e =>
    Ed(
      pd(t => {
        let n = Ti(t, Hl),
          r = Jl(e.scope),
          i = wh(e.pubsub, e.subscribers, e.strategy)
        return ql(r, vh(i)).pipe(ed(Kl(n, e => Yl(r, e))), rd(i))
      }),
    ),
  vh = e =>
    Ed(
      Qu(
        t => (
          lh(e.shutdownFlag, !0),
          zu(nh(e.pollers), e => Bl(e, t.id), {
            discard: !0,
            concurrency: 'unbounded',
          }).pipe(
            td(() =>
              R(() => {
                ;(e.subscribers.delete(e.subscription),
                  e.subscription.unsubscribe(),
                  e.strategy.onPubSubEmptySpaceUnsafe(e.pubsub, e.subscribers))
              }),
            ),
            ud(e.shutdownHook.open),
            id,
          )
        ),
      ),
    ),
  yh = e =>
    Wu(function t(n) {
      if (e.shutdownFlag.current) return wd
      let r = e.pollers.length === 0 ? e.subscription.pollUpTo(Infinity) : []
      return (
        n && (r = n.concat(r)),
        e.strategy.onPubSubEmptySpaceUnsafe(e.pubsub, e.subscribers),
        e.replayWindow.remaining > 0
          ? L(e.replayWindow.takeAll().concat(r))
          : pr(r)
            ? L(r)
            : V(bh(e), e => t([e]))
      )
    }),
  bh = e => {
    let t = Il(),
      n = e.subscribers.get(e.subscription)
    return (
      n ||
        ((n = /* @__PURE__ */ new Set()), e.subscribers.set(e.subscription, n)),
      n.add(e.pollers),
      Qm(e.pollers, t),
      e.strategy.completePollersUnsafe(
        e.pubsub,
        e.subscribers,
        e.subscription,
        e.pollers,
      ),
      Td(Ll(t), () => (ah(e.pollers, t), Gu))
    )
  },
  xh = /*#__PURE__*/ Symbol.for('effect/PubSub/AbsentValue'),
  Sh = (e, t, n) => {
    ;(e.has(t) || e.set(t, /* @__PURE__ */ new Set()), e.get(t).add(n))
  },
  Ch = (e, t, n) => {
    if (!e.has(t)) return
    let r = e.get(t)
    ;(r.delete(n), r.size === 0 && e.delete(t))
  },
  wh = (e, t, n) =>
    new Dh(e, t, e.subscribe(), Xm(), qm(!1), ch(!1), n, e.replayWindow()),
  Th = class {
    publisherHead = {
      value: xh,
      subscribers: 0,
      next: null,
    }
    publisherTail = this.publisherHead
    publisherIndex = 0
    subscribersIndex = 0
    capacity = 2 ** 53 - 1
    replayBuffer
    constructor(e) {
      this.replayBuffer = e
    }
    replayWindow() {
      return this.replayBuffer ? new Ph(this.replayBuffer) : Fh
    }
    isEmpty() {
      return this.publisherHead === this.publisherTail
    }
    isFull() {
      return !1
    }
    size() {
      return this.publisherIndex - this.subscribersIndex
    }
    publish(e) {
      let t = this.publisherTail.subscribers
      return (
        t !== 0 &&
          ((this.publisherTail.next = {
            value: e,
            subscribers: t,
            next: null,
          }),
          (this.publisherTail = this.publisherTail.next),
          (this.publisherIndex += 1)),
        this.replayBuffer && this.replayBuffer.offer(e),
        !0
      )
    }
    publishAll(e) {
      if (this.publisherTail.subscribers !== 0) for (let t of e) this.publish(t)
      else this.replayBuffer && this.replayBuffer.offerAll(e)
      return []
    }
    slide() {
      ;(this.publisherHead !== this.publisherTail &&
        ((this.publisherHead = this.publisherHead.next),
        (this.publisherHead.value = xh),
        (this.subscribersIndex += 1)),
        this.replayBuffer && this.replayBuffer.slide())
    }
    subscribe() {
      return (
        (this.publisherTail.subscribers += 1),
        new Eh(this, this.publisherTail, this.publisherIndex, !1)
      )
    }
  },
  Eh = class {
    self
    subscriberHead
    subscriberIndex
    unsubscribed
    constructor(e, t, n, r) {
      ;((this.self = e),
        (this.subscriberHead = t),
        (this.subscriberIndex = n),
        (this.unsubscribed = r))
    }
    isEmpty() {
      if (this.unsubscribed) return !0
      let e = !0,
        t = !0
      for (; t; )
        this.subscriberHead === this.self.publisherTail
          ? (t = !1)
          : this.subscriberHead.next.value === xh
            ? ((this.subscriberHead = this.subscriberHead.next),
              (this.subscriberIndex += 1))
            : ((e = !1), (t = !1))
      return e
    }
    size() {
      return this.unsubscribed
        ? 0
        : this.self.publisherIndex -
            Math.max(this.subscriberIndex, this.self.subscribersIndex)
    }
    poll() {
      if (this.unsubscribed) return Ym
      let e = !0,
        t = Ym
      for (; e; )
        if (this.subscriberHead === this.self.publisherTail) e = !1
        else {
          let n = this.subscriberHead.next.value
          ;(n !== xh &&
            ((t = n),
            --this.subscriberHead.subscribers,
            this.subscriberHead.subscribers === 0 &&
              ((this.self.publisherHead = this.self.publisherHead.next),
              (this.self.publisherHead.value = xh),
              (this.self.subscribersIndex += 1)),
            (e = !1)),
            (this.subscriberHead = this.subscriberHead.next),
            (this.subscriberIndex += 1))
        }
      return t
    }
    pollUpTo(e) {
      let t = [],
        n = 0
      for (; n !== e; ) {
        let r = this.poll()
        r === Ym ? (n = e) : (t.push(r), (n += 1))
      }
      return t
    }
    unsubscribe() {
      if (!this.unsubscribed)
        for (
          this.unsubscribed = !0, --this.self.publisherTail.subscribers;
          this.subscriberHead !== this.self.publisherTail;
        )
          (this.subscriberHead.next.value !== xh &&
            (--this.subscriberHead.subscribers,
            this.subscriberHead.subscribers === 0 &&
              ((this.self.publisherHead = this.self.publisherHead.next),
              (this.self.publisherHead.value = xh),
              (this.self.subscribersIndex += 1))),
            (this.subscriberHead = this.subscriberHead.next))
    }
  },
  Dh = class {
    [dh] = { _A: s }
    pubsub
    subscribers
    subscription
    pollers
    shutdownHook
    shutdownFlag
    strategy
    replayWindow
    constructor(e, t, n, r, i, a, o, s) {
      ;((this.pubsub = e),
        (this.subscribers = t),
        (this.subscription = n),
        (this.pollers = r),
        (this.shutdownHook = i),
        (this.shutdownFlag = a),
        (this.strategy = o),
        (this.replayWindow = s))
    }
    pipe() {
      return r(this, arguments)
    }
  },
  Oh = class {
    [uh] = { _A: s }
    pubsub
    subscribers
    scope
    shutdownHook
    shutdownFlag
    strategy
    constructor(e, t, n, r, i, a) {
      ;((this.pubsub = e),
        (this.subscribers = t),
        (this.scope = n),
        (this.shutdownHook = r),
        (this.shutdownFlag = i),
        (this.strategy = a))
    }
    pipe() {
      return r(this, arguments)
    }
  },
  kh = (e, t, n, r, i, a) => new Oh(e, t, n, r, i, a),
  Ah = class {
    get shutdown() {
      return Gu
    }
    handleSurplus(e, t, n, r) {
      return L(!1)
    }
    onPubSubEmptySpaceUnsafe(e, t) {}
    completePollersUnsafe(e, t, n, r) {
      return jh(this, e, t, n, r)
    }
    completeSubscribersUnsafe(e, t) {
      return Mh(this, e, t)
    }
  },
  jh = (e, t, n, r, i) => {
    let a = !0
    for (; a && !r.isEmpty(); ) {
      let o = rh(i)
      if (o === Ym) (Ch(n, r, i), i.length === 0 ? (a = !1) : Sh(n, r, i))
      else {
        let a = r.poll()
        a === Ym ? $m(i, o) : (Vl(o, Tl(a)), e.onPubSubEmptySpaceUnsafe(t, n))
      }
    }
  },
  Mh = (e, t, n) => {
    for (let [r, i] of n) for (let a of i) e.completePollersUnsafe(t, n, r, a)
  },
  Nh = class {
    capacity
    head = {
      value: xh,
      next: null,
    }
    tail = this.head
    size = 0
    index = 0
    constructor(e) {
      this.capacity = e
    }
    slide() {
      this.index++
    }
    offer(e) {
      ;((this.tail.value = e),
        (this.tail.next = {
          value: xh,
          next: null,
        }),
        (this.tail = this.tail.next),
        this.size === this.capacity
          ? (this.head = this.head.next)
          : (this.size += 1))
    }
    offerAll(e) {
      for (let t of e) this.offer(t)
    }
  },
  Ph = class {
    head
    index
    remaining
    buffer
    constructor(e) {
      ;((this.buffer = e),
        (this.index = e.index),
        (this.remaining = e.size),
        (this.head = e.head))
    }
    fastForward() {
      for (; this.index < this.buffer.index; )
        ((this.head = this.head.next), this.index++)
    }
    take() {
      if (this.remaining === 0) return
      ;(this.index < this.buffer.index && this.fastForward(), this.remaining--)
      let e = this.head.value
      return ((this.head = this.head.next), e)
    }
    takeN(e) {
      if (this.remaining === 0) return []
      this.index < this.buffer.index && this.fastForward()
      let t = Math.min(e, this.remaining),
        n = Array(t)
      for (let e = 0; e < t; e++) {
        let t = this.head.value
        ;((this.head = this.head.next), (n[e] = t))
      }
      return ((this.remaining -= t), n)
    }
    takeAll() {
      return this.takeN(this.remaining)
    }
  },
  Fh = {
    remaining: 0,
    take: () => void 0,
    takeN: () => [],
    takeAll: () => [],
  },
  Ih = '~effect/Queue',
  Lh = '~effect/Queue/Enqueue',
  Rh = '~effect/Queue/Dequeue',
  zh = {
    _A: s,
    _E: s,
  },
  Bh = {
    [Ih]: zh,
    [Lh]: zh,
    [Rh]: zh,
    ...bt,
    toJSON() {
      return {
        _id: 'effect/Queue',
        state: this.state._tag,
        size: $h(this),
      }
    },
  },
  Vh = e =>
    D(t => {
      let n = Object.create(Bh)
      return (
        (n.dispatcher = t.currentDispatcher),
        (n.capacity = e?.capacity ?? Infinity),
        (n.strategy = e?.strategy ?? 'suspend'),
        (n.messages = Xm()),
        (n.scheduleRunning = !1),
        (n.state = {
          _tag: 'Open',
          takers: /* @__PURE__ */ new Set(),
          offers: /* @__PURE__ */ new Set(),
          awaiters: /* @__PURE__ */ new Set(),
        }),
        N(n)
      )
    }),
  Hh = e => Vh({ capacity: e }),
  Uh = () => Vh(),
  Wh = (e, t) =>
    F(() => {
      if (e.state._tag !== 'Open') return eg
      if (e.messages.length >= e.capacity)
        switch (e.strategy) {
          case 'dropping':
            return eg
          case 'suspend':
            return e.capacity <= 0 && e.state.takers.size > 0
              ? (Qm(e.messages, t), ig(e), tg)
              : sg(e, t)
          case 'sliding':
            return (rh(e.messages), Qm(e.messages, t), tg)
        }
      return (Qm(e.messages, t), ag(e), tg)
    }),
  Gh = (e, t) =>
    e.state._tag === 'Open'
      ? e.messages.length >= e.capacity
        ? e.strategy === 'sliding'
          ? (rh(e.messages), Qm(e.messages, t), !0)
          : e.capacity <= 0 && e.state.takers.size > 0
            ? (Qm(e.messages, t), ig(e), !0)
            : !1
        : (Qm(e.messages, t), ag(e), !0)
      : !1,
  Kh = /*#__PURE__*/ o(2, (e, t) => P(() => qh(e, t))),
  qh = (e, t) => {
    if (e.state._tag !== 'Open') return !1
    let n = ps(Kt(t), ng)
    return e.state.offers.size === 0 && e.messages.length === 0
      ? (ug(e, n), !0)
      : ((e.state = {
          ...e.state,
          _tag: 'Closing',
          exit: n,
        }),
        !0)
  },
  Jh = e =>
    P(() => {
      if (e.state._tag === 'Done') return !0
      eh(e.messages)
      let t = e.state.offers
      if ((ug(e, e.state._tag === 'Open' ? rg : e.state.exit), t.size > 0)) {
        for (let e of t)
          e._tag === 'Single'
            ? e.resume(eg)
            : e.resume(E(e.remaining.slice(e.offset)))
        t.clear()
      }
      return !0
    }),
  Yh = e => Xh(e, 1, Infinity),
  Xh = (e, t, n) => F(() => og(e, t, n) ?? Jo(lg(e), Xh(e, 1, n))),
  Zh = e => F(() => Qh(e) ?? Jo(lg(e), Zh(e))),
  Qh = e => {
    if (e.state._tag === 'Done') return e.state.exit
    if (e.messages.length > 0) {
      let t = rh(e.messages)
      return (cg(e), E(t))
    } else if (e.capacity <= 0 && e.state.offers.size > 0) {
      ;((e.capacity = 1), cg(e), (e.capacity = 0))
      let t = rh(e.messages)
      return (cg(e), E(t))
    }
  },
  $h = e => (e.state._tag === 'Done' ? 0 : e.messages.length),
  eg = /*#__PURE__*/ E(!1),
  tg = /*#__PURE__*/ E(!0),
  ng = /*#__PURE__*/ qt(/*#__PURE__*/ tn()),
  rg = /*#__PURE__*/ is(),
  ig = e => {
    if (
      ((e.scheduleRunning = !1),
      !(e.state._tag === 'Done' || e.state.takers.size === 0))
    ) {
      for (let t of e.state.takers)
        if ((e.state.takers.delete(t), t(ls), e.messages.length === 0)) break
    }
  },
  ag = e => {
    e.scheduleRunning ||
      e.state._tag === 'Done' ||
      e.state.takers.size === 0 ||
      ((e.scheduleRunning = !0), e.dispatcher.scheduleTask(() => ig(e), 0))
  },
  og = (e, t, n) => {
    if (e.state._tag === 'Done') return e.state.exit
    if (n <= 0 || t <= 0) return E([])
    if (e.capacity <= 0 && e.state.offers.size > 0) {
      ;((e.capacity = 1), cg(e), (e.capacity = 0))
      let t = [rh(e.messages)]
      return (cg(e), E(t))
    }
    if (((t = Math.min(t, e.capacity || 1)), t <= e.messages.length)) {
      let t = th(e.messages, n)
      return (cg(e), E(t))
    }
  },
  sg = (e, t) =>
    Ro(n => {
      if (e.state._tag !== 'Open') return n(eg)
      let r = {
        _tag: 'Single',
        message: t,
        resume: n,
      }
      return (
        e.state.offers.add(r),
        P(() => {
          e.state._tag === 'Open' && e.state.offers.delete(r)
        })
      )
    }),
  cg = e => {
    if (e.state._tag === 'Done') return ju(e.state.exit.cause)
    if (e.state.offers.size === 0)
      return e.state._tag === 'Closing' && e.messages.length === 0
        ? (ug(e, e.state.exit), ju(e.state.exit.cause))
        : !1
    let t = e.capacity - e.messages.length
    for (let n of e.state.offers)
      if (t === 0) break
      else if (n._tag === 'Single')
        (Qm(e.messages, n.message), t--, n.resume(tg), e.state.offers.delete(n))
      else {
        for (; n.offset < n.remaining.length; n.offset++) {
          if (t === 0) return !1
          ;(Qm(e.messages, n.remaining[n.offset]), t--)
        }
        ;(n.resume(E([])), e.state.offers.delete(n))
      }
    return !1
  },
  lg = e =>
    Ro(t =>
      e.state._tag === 'Done'
        ? t(e.state.exit)
        : (e.state.takers.add(t),
          P(() => {
            e.state._tag !== 'Done' && e.state.takers.delete(t)
          })),
    ),
  ug = (e, t) => {
    if (e.state._tag === 'Done') return
    let n = e.state
    e.state = {
      _tag: 'Done',
      exit: t,
    }
    for (let e of n.takers) e(t)
    n.takers.clear()
    for (let e of n.awaiters) e(t)
    n.awaiters.clear()
  },
  dg = e => new fg(e),
  fg = class {
    waiters = /*#__PURE__*/ new Set()
    taken = 0
    permits
    constructor(e) {
      this.permits = e
    }
    get free() {
      return this.permits - this.taken
    }
    take(e) {
      let t = F(() =>
        this.free < e
          ? Ro(n => {
              if (this.free >= e) return n(t)
              let r = () => {
                this.free < e || (this.waiters.delete(r), n(t))
              }
              return (
                this.waiters.add(r),
                P(() => {
                  this.waiters.delete(r)
                })
              )
            })
          : ((this.taken += e), N(e)),
      )
      return t
    }
    updateTakenUnsafe(e, t) {
      return (
        (this.taken = t(this.taken)),
        this.waiters.size > 0 &&
          e.currentDispatcher.scheduleTask(() => {
            let e = this.waiters.values(),
              t = e.next()
            for (; t.done === !1 && this.free > 0; ) (t.value(), (t = e.next()))
          }, 0),
        this.free
      )
    }
    updateTaken(e) {
      return D(t => N(this.updateTakenUnsafe(t, e)))
    }
    resize(e) {
      return D(
        t => (
          (this.permits = e),
          this.free < 0 || this.updateTakenUnsafe(t, e => e),
          Mo
        ),
      )
    }
    release(e) {
      return this.updateTaken(t => t - e)
    }
    get releaseAll() {
      return this.updateTaken(e => 0)
    }
    withPermits(e) {
      return t =>
        Sc(n =>
          I(n(this.take(e)), e =>
            lc(
              n(t),
              () => {
                this.updateTakenUnsafe(po(), t => t - e)
              },
              !0,
            ),
          ),
        )
    }
    withPermit = /*#__PURE__*/ this.withPermits(1)
    withPermitsIfAvailable(e) {
      return t =>
        Sc(n =>
          this.free < e
            ? Oo
            : ((this.taken += e),
              lc(
                n(qo(t)),
                () => {
                  this.updateTakenUnsafe(po(), t => t - e)
                },
                !0,
              )),
        )
    }
  },
  pg = '~effect/Channel',
  mg = e => y(e, pg),
  hg = {
    [pg]: {
      _Env: s,
      _InErr: s,
      _InElem: s,
      _OutErr: s,
      _OutElem: s,
    },
    pipe() {
      return r(this, arguments)
    },
  },
  gg = e => {
    let t = Object.create(hg)
    return ((t.transform = (t, n) => od(e(t, n), e => L(qu(e)))), t)
  },
  _g = (e, t) => gg((n, r) => V(bg(e)(n, r), e => t(e, r))),
  vg = e => gg((t, n) => e),
  yg = e =>
    gg(
      Id(function* (t, n) {
        let r = Jl(n),
          i = e => Yl(r, Fu(e))
        return Sd(yield* Sd(e(t, n, r), i), i)
      }),
    ),
  bg = e => e.transform,
  xg = (e, t, n) =>
    Vh({
      capacity: n?.bufferSize,
      strategy: n?.strategy,
    }).pipe(
      td(t => ql(e, Jh(t))),
      td(n => Ad(Gl(t(n), e), e)),
    ),
  Sg = (e, t) => gg((n, r) => H(xg(r, e, t), Yh)),
  Cg = e => gg((t, n) => Wu(() => bg(e())(t, n))),
  wg = e => Og(L(e)),
  Tg = /*#__PURE__*/ vg(/*#__PURE__*/ L(/*#__PURE__*/ wl())),
  Eg = /*#__PURE__*/ vg(/*#__PURE__*/ L(Ku)),
  Dg = e => vg(qu(e)),
  Og = e =>
    vg(
      R(() => {
        let t = !1
        return Wu(() => (t ? wl() : ((t = !0), e)))
      }),
    ),
  kg = e => vg(L(Yh(e))),
  Ag = e => vg(L(Td(yh(e), () => wl()))),
  jg = e => Kg(H(_h(e), Ag)),
  Mg = /*#__PURE__*/ o(2, (e, t) =>
    _g(e, e =>
      R(() => {
        let n = 0
        return H(e, e => t(e, n++))
      }),
    ),
  ),
  Ng = e => e === void 0 || (e !== 'unbounded' && e <= 1),
  Pg = /*#__PURE__*/ o(
    e => mg(e[0]),
    (e, t, n) => (Ng(n?.concurrency) ? Fg(e, t) : Ig(e, t, n)),
  ),
  Fg = (e, t) =>
    gg((n, r) => {
      let i = 0
      return H(
        bg(e)(n, r),
        V(e => t(e, i++)),
      )
    }),
  Ig = (e, t, n) =>
    yg(
      Id(function* (r, i, a) {
        let o = 0,
          s = yield* bg(e)(r, i),
          l = n.concurrency === 'unbounded' ? 2 ** 53 - 1 : n.concurrency,
          u = yield* Hh(0)
        yield* ql(a, Jh(u))
        let d = Nd(yield* fd()),
          f = Km(a)
        if (n.unordered) {
          let e = dg(l),
            n = c(e.release(1)),
            r = dd({
              onFailure: e => V(Kh(u, e), n),
              onSuccess: e => V(Wh(u, e), n),
            })
          yield* e.take(1).pipe(
            V(() => s),
            V(e => (f(d(r(t(e, o++)))), Gu)),
            Dd({ disableYield: !0 }),
            od(t => e.withPermits(l - 1)(Kh(u, t))),
            Ad(a),
          )
        } else {
          let e = yield* Hh(l - 2)
          ;(yield* ql(a, Jh(u)),
            yield* Zh(e).pipe(
              $u,
              V(e => Wh(u, e)),
              Dd({ disableYield: !0 }),
              od(e => Kh(u, e)),
              Ad(a),
            ))
          let n,
            r = e => {
              e._tag !== 'Success' && ((n = e.cause), qh(u, e.cause))
            }
          yield* s.pipe(
            V(i => {
              if (n) return qu(n)
              let a = d(t(i, o++))
              return (f(a), a.addObserver(r), Wh(e, Um(a)))
            }),
            Dd({ disableYield: !0 }),
            od(t => Wh(e, El(t)).pipe(ed(Kh(e, t)))),
            Ad(a),
          )
        }
        return Zh(u)
      }),
    ),
  Lg = /*#__PURE__*/ o(
    e => mg(e[0]),
    (e, t, n) => (Ng(n?.concurrency) ? Rg(e, t) : zg(e, t, n)),
  ),
  Rg = (e, t) =>
    gg((n, r) =>
      H(bg(e)(n, r), e => {
        let i,
          a,
          o = V(
            e,
            e => ((a ??= Jl(r)), zd(bg(t(e))(n, a), e => ((i = s(e)), i))),
          ),
          s = Au(e => {
            if (
              ((i = void 0),
              a.state._tag === 'Open' && a.state.finalizers.size === 1)
            )
              return o
            let t = Yl(a, kl)
            return ((a = void 0), V(t, () => o))
          })
        return Wu(() => i ?? o)
      }),
    ),
  zg = (e, t, n) => e.pipe(Mg(t), Gg(n)),
  Bg = e =>
    _g(e, e => {
      let t,
        n = 0
      return L(
        Wu(function r() {
          if (t === void 0)
            return V(e, e => {
              switch (e.length) {
                case 0:
                  return r()
                case 1:
                  return L(e[0])
                default:
                  return ((t = e), L(e[n++]))
              }
            })
          let i = t[n++]
          return (n >= t.length && ((t = void 0), (n = 0)), L(i))
        }),
      )
    }),
  Vg = /*#__PURE__*/ o(2, (e, t) =>
    gg((n, r) => {
      let i = Jl(r)
      return H(bg(e)(n, i), e => {
        let a = e.pipe(
          od(e => {
            if (ju(e)) return qu(e)
            let o = i
            return (
              (i = Jl(r)),
              Yl(o, El(e)).pipe(
                ed(bg(t(e))(n, i)),
                V(e => ((a = e), e)),
              )
            )
          }),
        )
        return Wu(() => a)
      })
    }),
  ),
  Hg = /*#__PURE__*/ o(3, (e, t, n) =>
    Vg(e, e => {
      let r = t(e)
      return Un(r) ? Dg(r.failure) : n(r.success, e)
    }),
  ),
  Ug = /*#__PURE__*/ o(2, (e, t) => Hg(e, xl, e => t(e))),
  Wg = /*#__PURE__*/ o(
    e => mg(e[0]),
    (e, t, n) =>
      e.pipe(
        Mg(t),
        Gg({
          ...n,
          concurrency: n?.concurrency ?? 1,
          switch: !0,
        }),
      ),
  ),
  Gg = /*#__PURE__*/ o(
    2,
    (e, { bufferSize: t = 16, concurrency: n, switch: r = !1 }) =>
      yg(
        Id(function* (i, a, o) {
          let s = n === 'unbounded' ? 2 ** 53 - 1 : Math.max(1, n),
            c = r ? void 0 : dg(s),
            l = yield* Jm(!0),
            u = /* @__PURE__ */ new Set(),
            d = yield* Hh(t)
          yield* ql(o, Jh(d))
          let f = yield* bg(e)(i, a)
          return (
            yield* z(function* () {
              for (;;) {
                c && (yield* c.take(1))
                let e = yield* f,
                  t = Jl(o),
                  n = yield* bg(e)(i, t)
                for (; u.size >= s; ) {
                  let e = Gn(u)
                  ;(u.delete(e), u.size === 0 && (yield* l.open), yield* Wm(e))
                }
                let r = yield* n.pipe(
                  td(() => Zu),
                  V(e => Wh(d, e)),
                  Dd({ disableYield: !0 }),
                  Sd(
                    Id(function* (e) {
                      let n = Nu(e)
                      if (
                        (yield* nd(
                          Yl(t, Un(n) ? El(n.failure) : Tl(n.success.value)),
                        ),
                        u.has(r) &&
                          (u.delete(r),
                          c && (yield* c.release(1)),
                          u.size === 0 && (yield* l.open),
                          !Wn(n)))
                      )
                        return yield* Kh(d, e)
                    }),
                  ),
                  kd,
                )
                ;(l.closeUnsafe(), u.add(r))
              }
            }).pipe(
              od(e => l.whenOpen(Kh(d, e))),
              Ad(o),
            ),
            Zh(d)
          )
        }),
      ),
  ),
  Kg = e =>
    gg((t, n) => {
      let r
      return L(
        Wu(
          () =>
            r ||
            e.pipe(
              Gl(n),
              V(e => bg(e)(t, n)),
              V(e => (r = e)),
            ),
        ),
      )
    }),
  qg = e => yg((t, n, r) => H(Gl(bg(e)(t, n), r), Gl(r))),
  Jg = /*#__PURE__*/ o(2, (e, t) => Yg(e, e => (jl(e) ? t(e.cause) : Gu))),
  Yg = /*#__PURE__*/ o(2, (e, t) =>
    yg((n, r, i) => Kl(i, t).pipe(ed(bg(e)(n, r)))),
  ),
  Xg = /*#__PURE__*/ o(2, (e, t) => Kg(rd(t, e))),
  Zg = /*#__PURE__*/ o(2, (e, t) => Yg(e, e => t)),
  Qg = (e, t, n) =>
    Wu(() => {
      let r = Wl()
      return Au(V(bg(e)(wl(), r), t), n || L).pipe(Cd(e => Yl(r, e)))
    }),
  $g = /*#__PURE__*/ o(2, (e, t) =>
    Qg(e, e => Dd(V(e, t), { disableYield: !0 })),
  ),
  e_ = (e, t) => bg(e)(wl(), t),
  t_ = '~effect/collections/HashMap',
  n_ = 5,
  r_ = 1 << n_,
  i_ = r_ / 4,
  a_ = r_ / 2,
  o_ = r_ - 1,
  s_ = e => (
    (e -= (e >>> 1) & 1431655765),
    (e = (e & 858993459) + ((e >>> 2) & 858993459)),
    (((e + (e >>> 4)) & 252645135) * 16843009) >>> 24
  ),
  c_ = (e, t) => (e >>> t) & o_,
  l_ = (e, t) => 1 << c_(e, t),
  u_ = (e, t) => s_(e & (t - 1))
function d_(e, t, n, r, i, a) {
  if (t > 32) throw Error('HashMap: max depth exceeded')
  let o = l_(n, t),
    s = l_(i, t)
  return o === s
    ? new g_(e, o, [d_(e, t + n_, n, r, i, a)])
    : new g_(e, o | s, o >>> 0 < s >>> 0 ? [r, a] : [a, r])
}
var f_ = class {
    canEdit(e) {
      return this.edit === e
    }
  },
  p_ = class extends f_ {
    _tag = 'EmptyNode'
    edit = 0
    get size() {
      return 0
    }
    get(e, t, n) {
      return O()
    }
    has(e, t, n) {
      return !1
    }
    set(e, t, n, r, i, a) {
      return ((a.value = !0), new m_(e, n, r, i))
    }
    remove(e, t, n, r, i) {
      return this
    }
    iterator() {
      return [][Symbol.iterator]()
    }
    [Symbol.iterator]() {
      return this.iterator()
    }
    canEdit(e) {
      return !1
    }
  },
  m_ = class e extends f_ {
    _tag = 'LeafNode'
    edit
    hash
    key
    value
    constructor(e, t, n, r) {
      ;(super(),
        (this.edit = e),
        (this.hash = t),
        (this.key = n),
        (this.value = r))
    }
    get size() {
      return 1
    }
    get(e, t, n) {
      return this.hash === t && w(this.key, n) ? k(this.value) : O()
    }
    has(e, t, n) {
      return this.hash === t && w(this.key, n)
    }
    set(t, n, r, i, a, o) {
      if (this.hash === r && w(this.key, i))
        return w(this.value, a)
          ? this
          : this.canEdit(t)
            ? ((this.value = a), this)
            : new e(t, r, i, a)
      if (((o.value = !0), this.hash === r))
        return new h_(t, r, [
          [this.key, this.value],
          [i, a],
        ])
      let s = l_(r, n),
        c = l_(this.hash, n)
      return s === c
        ? new g_(t, s, [this.set(t, n + n_, r, i, a, o)])
        : new g_(
            t,
            s | c,
            s >>> 0 < c >>> 0
              ? [new e(t, r, i, a), this]
              : [this, new e(t, r, i, a)],
          )
    }
    remove(e, t, n, r, i) {
      if (this.hash === n && w(this.key, r)) {
        i.value = !0
        return
      }
      return this
    }
    iterator() {
      return [[this.key, this.value]][Symbol.iterator]()
    }
    [Symbol.iterator]() {
      return this.iterator()
    }
  },
  h_ = class e extends f_ {
    _tag = 'CollisionNode'
    edit
    hash
    entries
    constructor(e, t, n) {
      ;(super(), (this.edit = e), (this.hash = t), (this.entries = n))
    }
    get size() {
      return this.entries.length
    }
    get(e, t, n) {
      if (this.hash !== t) return O()
      for (let [e, t] of this.entries) if (w(e, n)) return k(t)
      return O()
    }
    has(e, t, n) {
      if (this.hash !== t) return !1
      for (let [e] of this.entries) if (w(e, n)) return !0
      return !1
    }
    set(t, n, r, i, a, o) {
      if (this.hash !== r)
        return (
          (o.value = !0),
          d_(t, n, this.hash, this, r, new m_(t, r, i, a))
        )
      for (let n = 0; n < this.entries.length; n++)
        if (w(this.entries[n][0], i)) {
          if (w(this.entries[n][1], a)) return this
          if (this.canEdit(t)) return ((this.entries[n] = [i, a]), this)
          let r = [...this.entries]
          return ((r[n] = [i, a]), new e(t, this.hash, r))
        }
      return (
        (o.value = !0),
        this.canEdit(t)
          ? (this.entries.push([i, a]), this)
          : new e(t, this.hash, [...this.entries, [i, a]])
      )
    }
    remove(t, n, r, i, a) {
      if (this.hash !== r) return this
      let o = this.entries.findIndex(([e]) => w(e, i))
      if (o === -1) return this
      if (((a.value = !0), this.entries.length === 1)) return
      if (this.entries.length === 2) {
        let e = this.entries[+(o === 0)]
        return new m_(t, this.hash, e[0], e[1])
      }
      if (this.canEdit(t)) return (this.entries.splice(o, 1), this)
      let s = [...this.entries]
      return (s.splice(o, 1), new e(t, this.hash, s))
    }
    iterator() {
      return this.entries[Symbol.iterator]()
    }
    [Symbol.iterator]() {
      return this.iterator()
    }
  },
  g_ = class e extends f_ {
    _tag = 'IndexedNode'
    edit
    _size
    bitmap
    children
    constructor(e, t, n) {
      ;(super(), (this.edit = e), (this.bitmap = t), (this.children = n))
    }
    get size() {
      return (
        this._size === void 0 &&
          (this._size = this.children.reduce((e, t) => e + t.size, 0)),
        this._size
      )
    }
    get(e, t, n) {
      let r = l_(t, e)
      if ((this.bitmap & r) === 0) return O()
      let i = u_(this.bitmap, r)
      return this.children[i].get(e + n_, t, n)
    }
    has(e, t, n) {
      let r = l_(t, e)
      if ((this.bitmap & r) === 0) return !1
      let i = u_(this.bitmap, r)
      return this.children[i].has(e + n_, t, n)
    }
    set(t, n, r, i, a, o) {
      let s = l_(r, n),
        c = u_(this.bitmap, s)
      if ((this.bitmap & s) !== 0) {
        let s = this.children[c],
          l = s.set(t, n + n_, r, i, a, o)
        if (s === l) return this
        if (this.canEdit(t)) return ((this.children[c] = l), this)
        let u = [...this.children]
        return ((u[c] = l), new e(t, this.bitmap, u))
      } else {
        o.value = !0
        let n = new m_(t, r, i, a),
          l = this.bitmap | s
        if (this.canEdit(t))
          return (
            this.children.splice(c, 0, n),
            (this.bitmap = l),
            (this._size = void 0),
            this.children.length > a_ ? this.expand(t, l, this.children) : this
          )
        let u = [...this.children]
        return (
          u.splice(c, 0, n),
          u.length > a_ ? this.expand(t, l, u) : new e(t, l, u)
        )
      }
    }
    remove(t, n, r, i, a) {
      let o = l_(r, n)
      if ((this.bitmap & o) === 0) return this
      let s = u_(this.bitmap, o),
        c = this.children[s],
        l = c.remove(t, n + n_, r, i, a)
      if (!a.value) return this
      if (l === void 0) {
        let n = this.bitmap ^ o
        if (n === 0) return
        if (this.children.length === 2) {
          let e = this.children[+(s === 0)]
          if (e._tag === 'LeafNode') return e
        }
        if (this.canEdit(t))
          return (
            this.children.splice(s, 1),
            (this.bitmap = n),
            (this._size = void 0),
            this
          )
        let r = [...this.children]
        return (r.splice(s, 1), new e(t, n, r))
      }
      if (c === l) return this
      if (this.canEdit(t)) return ((this.children[s] = l), this)
      let u = [...this.children]
      return ((u[s] = l), new e(t, this.bitmap, u))
    }
    expand(e, t, n) {
      let r = new globalThis.Array(r_),
        i = 0
      for (let e = 0; e < r_; e++) t & (1 << e) && (r[e] = n[i++])
      return new __(e, n.length, r)
    }
    iterator() {
      let e = 0,
        t
      return {
        next: () => {
          for (; e < this.children.length; ) {
            t ||= this.children[e].iterator()
            let n = t.next()
            if (!n.done) return n
            ;((t = void 0), e++)
          }
          return {
            done: !0,
            value: void 0,
          }
        },
      }
    }
    [Symbol.iterator]() {
      return this.iterator()
    }
  },
  __ = class e extends f_ {
    _tag = 'ArrayNode'
    edit
    _size
    count
    children
    constructor(e, t, n) {
      ;(super(), (this.edit = e), (this.count = t), (this.children = n))
    }
    get size() {
      return (
        this._size === void 0 &&
          (this._size = this.children.reduce((e, t) => e + (t?.size ?? 0), 0)),
        this._size
      )
    }
    get(e, t, n) {
      let r = c_(t, e),
        i = this.children[r]
      return i ? i.get(e + n_, t, n) : O()
    }
    has(e, t, n) {
      let r = c_(t, e),
        i = this.children[r]
      return i ? i.has(e + n_, t, n) : !1
    }
    set(t, n, r, i, a, o) {
      let s = c_(r, n),
        c = this.children[s]
      if (c) {
        let l = c.set(t, n + n_, r, i, a, o)
        if (c === l) return this
        if (this.canEdit(t)) return ((this.children[s] = l), this)
        let u = [...this.children]
        return ((u[s] = l), new e(t, this.count, u))
      } else {
        o.value = !0
        let n = new m_(t, r, i, a)
        if (this.canEdit(t))
          return (
            (this.children[s] = n),
            this.count++,
            (this._size = void 0),
            this
          )
        let c = [...this.children]
        return ((c[s] = n), new e(t, this.count + 1, c))
      }
    }
    remove(t, n, r, i, a) {
      let o = c_(r, n),
        s = this.children[o]
      if (!s) return this
      let c = s.remove(t, n + n_, r, i, a)
      if (!a.value) return this
      let l = this.count - +!c
      if (l < i_) return this.pack(t, o, c)
      if (s === c) return this
      if (this.canEdit(t))
        return (
          (this.children[o] = c),
          c || (this.count = l),
          (this._size = void 0),
          this
        )
      let u = [...this.children]
      return ((u[o] = c), new e(t, l, u))
    }
    pack(e, t, n) {
      let r = [],
        i = 0,
        a = 1
      for (let e = 0; e < this.children.length; e++) {
        let o = e === t ? n : this.children[e]
        ;(o && (r.push(o), (i |= a)), (a <<= 1))
      }
      return new g_(e, i, r)
    }
    iterator() {
      let e = 0,
        t
      return {
        next: () => {
          for (; e < this.children.length; ) {
            let n = this.children[e]
            if (!n) {
              e++
              continue
            }
            t ||= n.iterator()
            let r = t.next()
            if (!r.done) return r
            ;((t = void 0), e++)
          }
          return {
            done: !0,
            value: void 0,
          }
        },
      }
    }
    [Symbol.iterator]() {
      return this.iterator()
    }
  },
  v_ = class {
    [t_] = t_
    _editable
    _edit
    _root
    _size
    constructor(e, t, n, r) {
      ;((this._editable = e),
        (this._edit = t),
        (this._root = n),
        (this._size = r))
    }
    get size() {
      return this._size
    }
    [Symbol.iterator]() {
      return this._root.iterator()
    }
    [C](e) {
      if (b_(e)) {
        let t = e
        if (this.size !== t.size) return !1
        for (let [t, n] of this) {
          let r = p(e, w_(t))
          if (A(r) || !w(n, r.value)) return !1
        }
        return !0
      }
      return !1
    }
    [b]() {
      let e = S('HashMap')
      for (let [t, n] of this) e ^= x(t) + x(n)
      return e
    }
    [st]() {
      return ct(this)
    }
    toString() {
      return `HashMap(${et(Array.from(this))})`
    }
    toJSON() {
      return {
        _id: 'HashMap',
        values: Array.from(this).map(([e, t]) => [ct(e), ct(t)]),
      }
    }
    pipe() {
      return r(this, arguments)
    }
  },
  y_ = /*#__PURE__*/ new p_(),
  b_ = e => y(e, t_),
  x_ = () => new v_(!1, 0, y_, 0),
  S_ = (...e) => C_(e),
  C_ = e => {
    let t = y_,
      n = 0,
      r = { value: !1 }
    for (let [i, a] of e) {
      let e = x(i)
      ;((r.value = !1), (t = t.set(NaN, 0, e, i, a, r)), r.value && n++)
    }
    return new v_(!1, 0, t, n)
  },
  w_ = /*#__PURE__*/ o(2, (e, t) => e._root.get(0, x(t), t)),
  T_ = /*#__PURE__*/ o(2, (e, t) => e._root.has(0, x(t), t)),
  E_ = /*#__PURE__*/ o(3, (e, t, n) => {
    let r = e,
      i = x(t),
      a = { value: !1 },
      o = r._editable ? r._edit : NaN,
      s = r._root.set(o, 0, i, t, n, a)
    return r._editable
      ? ((r._root = s), a.value && r._size++, e)
      : r._root === s
        ? e
        : new v_(!1, r._edit, s, r._size + +!!a.value)
  }),
  D_ = e => {
    let t = e[Symbol.iterator]()
    return {
      [Symbol.iterator]() {
        return this
      },
      next() {
        let e = t.next()
        return e.done
          ? {
              done: !0,
              value: void 0,
            }
          : {
              done: !1,
              value: e.value[0],
            }
      },
    }
  },
  O_ = e => e.size,
  k_ = S_,
  A_ = w_,
  j_ = E_,
  M_ = '~effect/collections/HashSet',
  N_ = {
    [b]() {
      return x(M_)
    },
    [C](e) {
      return F_(e) && B_(this) === B_(e) && V_(this, t => z_(e, t))
    },
    [Symbol.iterator]() {
      return D_(I_(this))
    },
    toString() {
      return `HashSet(${et(Array.from(this))})`
    },
    toJSON() {
      return {
        _id: 'HashSet',
        values: ct(Array.from(this)),
      }
    },
    [st]() {
      return this.toJSON()
    },
    pipe() {
      return r(this, arguments)
    },
  },
  P_ = e => {
    let t = Object.create(N_)
    return ((t[M_] = M_), (t.keyMap = e), t)
  },
  F_ = e => y(e, M_),
  I_ = e => e.keyMap,
  L_ = () => P_(x_()),
  R_ = e => {
    let t = x_()
    for (let n of e) t = E_(t, n, !0)
    return P_(t)
  },
  z_ = (e, t) => T_(I_(e), t),
  B_ = e => O_(I_(e)),
  V_ = (e, t) => {
    for (let n of e) if (!t(n)) return !1
    return !0
  },
  H_ = L_,
  U_ = R_,
  W_ = /*#__PURE__*/ o(2, (e, t) =>
    K_(e, (e, n) => [e, Object.hasOwn(t, e) ? t[e](n) : n]),
  ),
  G_ = e => e
function K_(e, t) {
  let n = {}
  for (let r of Reflect.ownKeys(e)) {
    if (!Object.prototype.propertyIsEnumerable.call(e, r)) continue
    let i = t(r, e[r])
    if (i) {
      let [e, t] = i
      n[e] = t
    }
  }
  return n
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/internal/errors.js
function q_(e, t) {
  return (t.length > 0 && (e += `\n  at ${rt(t)}`), Error(e))
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/SchemaParser.js
var J_ = /*#__PURE__*/ h(e => {
  switch (e._tag) {
    case 'Declaration': {
      let t = e.annotations?.[Fm]
      if (ie(t)) {
        let n = t(e.typeParameters),
          r = J_(n.to)
        return em(e, r === n.to ? [n] : [new $f(r, n.transformation)])
      }
      return e
    }
    case 'Objects':
    case 'Arrays':
      return e.recur(e => {
        let t = e.context?.defaultValue
        return t ? em(J_(e), t) : J_(e)
      })
    case 'Suspend':
      return e.recur(J_)
    default:
      return e
  }
})
function Y_(e) {
  let t = iv(J_(vm(e.ast)))
  return (e, n) =>
    t(
      e,
      n?.disableChecks
        ? n?.parseOptions
          ? {
              ...n.parseOptions,
              disableChecks: !0,
            }
          : { disableChecks: !0 }
        : n?.parseOptions,
    )
}
function X_(e) {
  let t = Y_(e)
  return (e, n) => {
    let r = Fd(t(e, n))
    return Al(r)
      ? k(r.value)
      : (xf(r.cause, 'Option adapter can only return none for schema issues'),
        O())
  }
}
function Z_(e) {
  let t = Y_(e)
  return (e, n) => {
    let r = Fd(t(e, n))
    if (Al(r)) return r.value
    let i = xf(r.cause, 'Constructor adapter can only throw schema issues')
    throw Error(i.toString(), { cause: i })
  }
}
function Q_(e) {
  let t = av(iv(vm(e)))
  return e => {
    let n = t(e, ep)
    return Al(n)
      ? !0
      : (xf(
          n.cause,
          'Type guard adapter can only return false for schema issues',
        ),
        !1)
  }
}
function $_(e, t) {
  let n = iv(e.ast)
  return t === void 0 ? n : (e, r) => n(e, rv(t, r))
}
function ev(e, t) {
  return av($_(e, t))
}
function tv(e, t) {
  return ov($_(e, t))
}
function nv(e, t) {
  let n = iv(xm(e.ast))
  return t === void 0 ? n : (e, r) => n(e, rv(t, r))
}
var rv = (e, t) =>
  t === void 0
    ? e
    : {
        ...e,
        ...t,
      }
function iv(e) {
  let t = cv(e)
  return (e, n) =>
    zd(t(k(e), n ?? ep), e => (e._tag === 'None' ? B(new nf(e)) : L(e.value)))
}
function av(e) {
  return (t, n) => Fd(e(t, n))
}
function ov(e) {
  let t = av(e)
  return (e, n) => {
    let r = t(e, n)
    return Al(r)
      ? k(r.value)
      : (xf(r.cause, 'Option adapter can only return none for schema issues'),
        O())
  }
}
function sv(e, t) {
  return od(e, e => Ju(() => yl(e, t)))
}
var cv = /*#__PURE__*/ h(e => {
    let t,
      n = e.checks,
      r = e.encoding,
      i = r,
      a = i?.length ?? 0,
      o = e.encodingChecks,
      s = (n ? n[n.length - 1].annotations : e.annotations)?.parseOptions
    if (!e.context && !r && !n && !o)
      return (n, r) => (
        (t ??= e.getParser(cv)),
        s &&
          (r = {
            ...r,
            ...s,
          }),
        t(n, r)
      )
    let c = Zf(e) || Qf(e) || (qf(e) && e.typeParameters.length > 0),
      l = n && c ? n.filter(e => e.annotations?.[Im]) : void 0
    return (r, c) => {
      s &&
        (c = {
          ...c,
          ...s,
        })
      let u
      if (i) {
        for (let e = a - 1; e >= 0; e--) {
          let t = i[e],
            n = t.to,
            a = cv(n)
          if (
            ((u = u ? zd(u, e => a(e, c)) : a(r, c)),
            t.transformation._tag === 'Transformation')
          ) {
            let e = t.transformation.decode
            u = zd(u, t => e.run(t, c))
          } else u = t.transformation.decode(u, c)
        }
        u = sv(u, t => new Xd(e, r, t))
      }
      t ??= e.getParser(cv)
      let d = r => {
        let i = t(r, c)
        return (
          o &&
            !c?.disableChecks &&
            (i = zd(i, t => {
              if (j(r) && j(t)) {
                let t = []
                if ((Pm(o, r.value, t, e, c), pr(t))) return B(new ef(e, r, t))
              }
              return L(t)
            })),
          n &&
            !c?.disableChecks &&
            (c?.errors === 'all' &&
              l &&
              l.length > 0 &&
              j(r) &&
              (i = sv(i, t => {
                let n = []
                return (
                  Pm(l, r.value, n, e, c),
                  pr(n)
                    ? t._tag === 'Composite' && t.ast === e
                      ? new ef(e, t.actual, [...t.issues, ...n])
                      : new ef(e, r, [t, ...n])
                    : t
                )
              })),
            (i = zd(i, t => {
              if (j(t)) {
                let r = t.value,
                  i = []
                if ((Pm(n, r, i, e, c), pr(i))) return B(new ef(e, t, i))
              }
              return L(t)
            }))),
          i
        )
      }
      return u ? zd(u, d) : d(r)
    }
  }),
  lv = /*#__PURE__*/ h(e => uv(e, []))
function uv(e, t) {
  let n = Hd(e)?.toEquivalence
  if (n) return n(qf(e) ? e.typeParameters.map(e => uv(e, t)) : [])
  switch (e._tag) {
    case 'Never':
      throw q_(`Unsupported AST ${e._tag}`, t)
    case 'Declaration':
    case 'Null':
    case 'Undefined':
    case 'Void':
    case 'Unknown':
    case 'Any':
    case 'String':
    case 'Number':
    case 'Boolean':
    case 'BigInt':
    case 'Symbol':
    case 'Literal':
    case 'UniqueSymbol':
    case 'ObjectKeyword':
    case 'Enum':
    case 'TemplateLiteral':
      return w
    case 'Arrays': {
      let n = e.elements.map((e, n) => uv(e, [...t, n])),
        r = e.elements.length,
        i = e.rest.map((e, n) => uv(e, [...t, r + n]))
      return Ke((t, r) => {
        if (!Array.isArray(t) || !Array.isArray(r)) return !1
        let a = t.length
        if (a !== r.length) return !1
        let o = 0
        for (; o < Math.min(a, e.elements.length); o++)
          if (!n[o](t[o], r[o])) return !1
        if (i.length > 0) {
          let [e, ...n] = i
          for (; o < a - n.length; o++) if (!e(t[o], r[o])) return !1
          for (let e = 0; e < n.length; e++)
            if (((o += e), !n[e](t[o], r[o]))) return !1
        }
        return !0
      })
    }
    case 'Objects': {
      if (e.propertySignatures.length === 0 && e.indexSignatures.length === 0)
        return w
      let n = e.propertySignatures.map(e => uv(e.type, [...t, e.name])),
        r = e.indexSignatures.map(e => uv(e.type, t))
      return Ke((t, i) => {
        if (!de(t) || !de(i)) return !1
        for (let r = 0; r < n.length; r++) {
          let a = e.propertySignatures[r],
            o = a.name,
            s = Object.hasOwn(t, o),
            c = Object.hasOwn(i, o)
          if ((_m(a.type) && s !== c) || (s && c && !n[r](t[o], i[o])))
            return !1
        }
        for (let n = 0; n < r.length; n++) {
          let a = e.indexSignatures[n],
            o = Cp(t, a.parameter),
            s = Cp(i, a.parameter)
          if (o.length !== s.length) return !1
          for (let e = 0; e < o.length; e++) {
            let a = o[e]
            if (!Object.hasOwn(i, a) || !r[n](t[a], i[a])) return !1
          }
        }
        return !0
      })
    }
    case 'Union':
      return Ke((n, r) => {
        let i = Vp(n, e.types),
          a = i.map(Q_)
        for (let e = 0; e < i.length; e++) {
          let o = a[e]
          if (o(n) && o(r)) return uv(i[e], t)(n, r)
        }
        return !1
      })
    case 'Suspend': {
      let n = Jp(() => uv(e.thunk(), t))
      return Ke((e, t) => n()(e, t))
    }
  }
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/internal/schema/schema.js
var dv = '~effect/Schema/Schema',
  fv = {
    [dv]: dv,
    pipe() {
      return r(this, arguments)
    },
    annotate(e) {
      return this.rebuild(nm(this.ast, e))
    },
    annotateKey(e) {
      return this.rebuild(um(this.ast, e))
    },
    check(...e) {
      return this.rebuild(im(this.ast, e))
    },
  }
function pv(e, t) {
  let n = Object.create(fv)
  return (
    t && Object.assign(n, t),
    (n.ast = e),
    (n.rebuild = e => pv(e, t)),
    (n.makeEffect = (e, t) => gv(Y_(n)(e, t))),
    (n.make = Z_(n)),
    (n.makeOption = X_(n)),
    n
  )
}
var mv = '~effect/Schema/SchemaError',
  hv = class extends _u('SchemaError') {
    [mv] = mv
    constructor(e) {
      super({ issue: e })
    }
    get message() {
      return this.issue.toString()
    }
    toString() {
      return `SchemaError(${this.message})`
    }
  }
function gv(e) {
  return od(e, e => Ju(() => yl(e, e => new hv(e))))
}
function _v(e) {
  return od(e, e => Ju(() => yl(e, e => e.issue)))
}
function vv(e) {
  return Al(e) ? Tl(e.value) : El(yl(e.cause, e => new hv(e)))
}
var yv = /*#__PURE__*/ xv(bv)
function bv(e) {
  switch (e._tag) {
    case 'BigInt':
    case 'Symbol':
    case 'UniqueSymbol':
      return 0
    default:
      return 1
  }
}
function xv(e) {
  return t => {
    let n = /* @__PURE__ */ new Map()
    for (let e = 0; e < t.length; e++) n.set(ym(t[e]), e)
    let r = [...t].sort((t, r) => {
      ;((t = ym(t)), (r = ym(r)))
      let i = e(t),
        a = e(r)
      return i === a ? n.get(t) - n.get(r) : i - a
    })
    return r.some((e, n) => e !== t[n]) ? r : t
  }
}
//#endregion
//#region ../../node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/Schema.js
var Sv = dv
function Cv() {
  return (e, t, n) => W(new ip(e.map(Np), e => t(e.map(e => W(e))), n))
}
function wv(e) {
  return y(e, mv)
}
function Tv(e, t) {
  let n = $_(e, t)
  return (e, t) => gv(n(e, t))
}
function Ev(e, t) {
  let n
  for (let r of e.reasons) {
    if (!hl(r) || !wv(r.error)) throw new globalThis.Error(t, { cause: e })
    n ??= r.error
  }
  if (n === void 0) throw new globalThis.Error(t, { cause: e })
  return n
}
function Dv(e) {
  let t = Fd(e)
  if (Al(t)) return t.value
  throw Ev(t.cause, 'Sync adapter can only throw schema errors')
}
function Ov(e, t) {
  let n = ev(e, t)
  return (e, t) => vv(n(e, t))
}
var kv = tv
function Av(e, t) {
  let n = Tv(e, t)
  return (e, t) => Dv(n(e, t))
}
function jv(e, t) {
  let n = nv(e, t)
  return (e, t) => gv(n(e, t))
}
var Mv = jv
function Nv(e, t) {
  let n = jv(e, t)
  return (e, t) => Dv(n(e, t))
}
var W = pv
function Pv(e) {
  return y(e, Sv) && e[Sv] === Sv
}
var Fv = /*#__PURE__*/ G_(e => W(fm(e.ast), { schema: e })),
  Iv = /*#__PURE__*/ G_(e => Fv(Zv(e))),
  Lv = /*#__PURE__*/ G_(e => W(vm(e.ast), { schema: e })),
  Rv = /*#__PURE__*/ G_(e => W(ym(e.ast), { schema: e }))
function zv(e) {
  let t = W(new up(e), {
    literal: e,
    transform(n) {
      return t.pipe(
        Qv(zv(n), {
          decode: Df(() => n),
          encode: Df(() => e),
        }),
      )
    },
  })
  return t
}
var Bv = /*#__PURE__*/ W(lp),
  Vv = /*#__PURE__*/ W(cp),
  G = /*#__PURE__*/ W(fp),
  Hv = /*#__PURE__*/ W(hp),
  Uv = /*#__PURE__*/ W(gp)
function Wv(e, t) {
  return W(e, {
    fields: t,
    mapFields(e, t) {
      let n = e(this.fields)
      return Wv(Mp(n, t?.unsafePreserveChecks ? this.ast.checks : void 0), n)
    },
  })
}
function K(e) {
  return Wv(Mp(e, void 0), e)
}
function Gv(e, t, n) {
  let r =
    n?.keyValueCombiner?.decode || n?.keyValueCombiner?.encode
      ? new Tp(n.keyValueCombiner.decode, n.keyValueCombiner.encode)
      : void 0
  return W(gm(e.ast, t.ast, r), {
    key: e,
    value: t,
  })
}
function Kv(e, t) {
  return W(e, {
    elements: t,
    mapElements(e, t) {
      let n = e(this.elements)
      return Kv(Pp(n, t?.unsafePreserveChecks ? this.ast.checks : void 0), n)
    },
  })
}
var qv = /*#__PURE__*/ G_(e => W(new _p(!1, [], [e.ast]), { value: e }))
function Jv(e, t) {
  return W(e, {
    members: t,
    mapMembers(e, t) {
      let n = e(this.members)
      return Jv(
        Fp(
          n,
          this.ast.mode,
          t?.unsafePreserveChecks ? this.ast.checks : void 0,
        ),
        n,
      )
    },
  })
}
function Yv(e, t) {
  return Jv(Fp(e, t?.mode ?? 'anyOf', void 0), e)
}
function Xv(e) {
  let t = e.map(zv)
  return W(Fp(t, 'anyOf', void 0), {
    literals: e,
    members: t,
    mapMembers(e) {
      return Yv(e(this.members))
    },
    pick(e) {
      return Xv(e)
    },
    transform(e) {
      return Yv(t.map((t, n) => t.transform(e[n])))
    },
  })
}
var Zv = /*#__PURE__*/ G_(e => Yv([e, Vv]))
function Qv(e, t) {
  return n =>
    W(mm(n.ast, e.ast, t ? zf(t) : Uf()), {
      from: n,
      to: e,
    })
}
function $v(e) {
  return t => W(pm(t.ast, _v(e)), { schema: t })
}
function ey(e, t) {
  let n = t?.encodingStrategy === 'omit' ? Af() : Tf()
  return t =>
    Fv(Rv(t)).pipe(
      Qv(t, {
        decode: jf(_v(e)),
        encode: n,
      }),
    )
}
function ty(e) {
  return zv(e).pipe($v(L(e)))
}
function q(e, t) {
  return K({
    _tag: ty(e),
    ...t,
  })
}
function ny() {
  return (e, t) => new $f(e.ast, zf(t))
}
var ry = Zp,
  iy = Qp,
  ay = e =>
    e
      ? new globalThis.RegExp(
          `^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${e}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`,
        )
      : /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$/
function oy(e, t) {
  let n = ay(e)
  return iy(n, {
    expected: e ? `a UUID v${e}` : 'a UUID',
    meta: {
      _tag: 'isUUID',
      regExp: n,
      version: e,
    },
    ...t,
  })
}
function sy(e) {
  return ry(e => globalThis.Number.isFinite(e), {
    expected: 'a finite number',
    meta: { _tag: 'isFinite' },
    arbitrary: {
      constraint: {
        noInfinity: !0,
        noNaN: !0,
      },
    },
    ...e,
  })
}
function cy(e) {
  let t = On(e.order),
    n = e.formatter ?? et
  return (r, i) =>
    ry(e => t(e, r), {
      expected: `a value greater than or equal to ${n(r)}`,
      arbitrary: {
        constraint: {
          ordered: {
            order: e.order,
            minimum: r,
          },
        },
      },
      ...e.annotate?.(r),
      ...i,
    })
}
var ly = /*#__PURE__*/ cy({
  order: Tn,
  annotate: e => ({
    meta: {
      _tag: 'isGreaterThanOrEqualTo',
      minimum: e,
    },
  }),
})
function uy(e) {
  return ry(e => globalThis.Number.isSafeInteger(e), {
    expected: 'an integer',
    meta: { _tag: 'isInt' },
    arbitrary: { constraint: { integer: !0 } },
    ...e,
  })
}
function dy(e, t) {
  return (
    (e = Math.max(0, Math.floor(e))),
    ry(t => t.length >= e, {
      expected: `a value with a length of at least ${e}`,
      meta: {
        _tag: 'isMinLength',
        minLength: e,
      },
      [Im]: !0,
      arbitrary: { constraint: { minLength: e } },
      ...t,
    })
  )
}
function fy(e) {
  return dy(1, e)
}
function py(e) {
  return W(
    Cv()(
      [e],
      ([e]) =>
        (t, n, r) =>
          kn(t)
            ? A(t)
              ? Hu
              : Rd($_(e)(t.value, r), {
                  onSuccess: k,
                  onFailure: e => new ef(n, k(t), [new Zd(['value'], e)]),
                })
            : B(new tf(n, k(t))),
      {
        typeConstructor: { _tag: 'effect/Option' },
        generation: {
          runtime: 'Schema.Option(?)',
          Type: 'Option.Option<?>',
          importDeclaration: 'import * as Option from "effect/Option"',
        },
        expected: 'Option',
        toCodec: ([e]) =>
          ny()(
            Yv([
              K({
                _tag: zv('Some'),
                value: e,
              }),
              K({ _tag: zv('None') }),
            ]),
            Vf({
              decode: e => (e._tag === 'None' ? O() : k(e.value)),
              encode: e =>
                j(e)
                  ? {
                      _tag: 'Some',
                      value: e.value,
                    }
                  : { _tag: 'None' },
            }),
          ),
        toArbitrary:
          ([e]) =>
          (t, n) => {
            let r = t.constant(O())
            return my(t, n, r, t.oneof(r, e.arbitrary.map(k)))
          },
        toEquivalence: ([e]) => Rn(e),
        toFormatter: ([e]) =>
          M({
            onNone: () => 'none()',
            onSome: t => `some(${e(t)})`,
          }),
      },
    ).ast,
    { value: e },
  )
}
function my(e, t, n, r) {
  return {
    arbitrary:
      n === void 0 || t.recursion === void 0 ? r : e.oneof(t.recursion, n, r),
    terminal: n,
  }
}
;(globalThis.RegExp, globalThis.URL)
function hy(e) {
  let t = Lm(e.ast)
  return G.annotate({
    identifier: t === void 0 ? void 0 : `${t}JsonString`,
    expected: 'a string that will be decoded as JSON',
    contentMediaType: 'application/json',
    contentSchema: ym(e.ast),
  }).pipe(Qv(e, Gf))
}
;(globalThis.File, globalThis.FormData, globalThis.URLSearchParams)
var gy = /*#__PURE__*/ Hv.check(/*#__PURE__*/ sy()),
  J = /*#__PURE__*/ Hv.check(/*#__PURE__*/ uy())
globalThis.Uint8Array
function _y(e) {
  return lv(e.ast)
}
function vy(e) {
  return W(yy(e.ast), { schema: e })
}
var yy = /*#__PURE__*/ sm(e => {
  let t = by(e, yy)
  return t !== e && _m(e) ? dm(t) : t
})
function by(e, t) {
  switch (e._tag) {
    case 'Declaration': {
      let n = e.annotations?.toCodecJson ?? e.annotations?.toCodec
      if (ie(n)) {
        let r = n(qf(e) ? e.typeParameters.map(e => pv(ym(e))) : []),
          i = t(r.to)
        return em(e, i === r.to ? [r] : [new $f(i, r.transformation)])
      }
      return em(e, [Bm])
    }
    case 'Unknown':
    case 'ObjectKeyword':
      return em(e, [Vm])
    case 'Undefined':
    case 'Void':
    case 'Literal':
    case 'Number':
      return e.toCodecJson()
    case 'UniqueSymbol':
    case 'Symbol':
    case 'BigInt':
      return e.toCodecStringTree()
    case 'Objects':
      if (e.propertySignatures.some(e => typeof e.name != 'string'))
        throw new globalThis.Error('Objects property names must be strings', {
          cause: e,
        })
      return e.recur(t, Dm)
    case 'Union': {
      let n = yv(e.types)
      return n === e.types
        ? e.recur(t)
        : new Hp(
            n,
            e.mode,
            e.annotations,
            e.checks,
            e.encoding,
            e.context,
            e.encodingChecks,
          ).recur(t)
    }
    case 'Arrays':
    case 'Suspend':
      return e.recur(t)
  }
  return e
}
var xy = /*#__PURE__*/ W(zm),
  Sy = '~effect/Stream',
  Cy = {
    _R: s,
    _E: s,
    _A: s,
  },
  wy = {
    [Sy]: Cy,
    pipe() {
      return r(this, arguments)
    },
  },
  Ty = e => {
    let t = Object.create(wy)
    return ((t.channel = e), t)
  },
  Ey = '~effect/Stream',
  Dy = e => y(e, Ey),
  Oy = Ty,
  ky = e => Oy(Og(H(e, Mr))),
  Ay = (e, t) => Oy(gg((n, r) => V(e_(e.channel, r), e => t(e, r)))),
  jy = e => e.channel,
  My = (e, t) => Oy(Sg(e, t)),
  Ny = /*#__PURE__*/ Oy(Tg),
  Py = e => Oy(wg(Mr(e))),
  Fy = (...e) => Ly(e),
  Iy = e => Oy(Cg(() => e().channel)),
  Ly = e => (mr(e) ? Oy(wg(e)) : Ny),
  Ry = e => Oy(kg(e)),
  zy = e => Oy(jg(e)),
  By = /*#__PURE__*/ Oy(Eg),
  Vy = e => Oy(Kg(H(e, jy))),
  Hy = e => Oy(qg(e.channel)),
  Uy = /*#__PURE__*/ o(2, (e, t) =>
    Iy(() => {
      let n = 0
      return Oy(
        Mg(
          e.channel,
          Nr(e => t(e, n++)),
        ),
      )
    }),
  ),
  Wy = /*#__PURE__*/ o(
    e => Dy(e[0]),
    (e, t, n) => e.channel.pipe(Bg, Pg(t, n), Mg(Mr), Oy),
  ),
  Gy = /*#__PURE__*/ o(
    e => Dy(e[0]),
    (e, t, n) =>
      e.channel.pipe(
        Bg,
        Lg(e => t(e).channel, n),
        Oy,
      ),
  ),
  Ky = /*#__PURE__*/ o(
    e => Dy(e[0]),
    (e, t, n) =>
      e.channel.pipe(
        Bg,
        Wg(e => t(e).channel, n),
        Oy,
      ),
  ),
  qy = /*#__PURE__*/ o(
    e => Dy(e[0]),
    (e, t) => Gy(e, s, t),
  ),
  Jy = /*#__PURE__*/ o(2, (e, t) => qy(Ly([e, t]))),
  Yy = /*#__PURE__*/ o(2, (e, t) => Oy(Ug(e.channel, e => t(e).channel))),
  Xy = /*#__PURE__*/ o(2, (e, t) =>
    Ay(e, (e, n) =>
      R(() => {
        let n = !0,
          r
        return V(e, function i(a) {
          let o = [],
            s = 0
          for (
            n && ((n = !1), (r = a[0]), (s = 1), o.push(r));
            s < a.length;
            s++
          ) {
            let e = a[s]
            t(e, r) || ((r = e), o.push(e))
          }
          return pr(o) ? L(o) : V(e, i)
        })
      }),
    ),
  ),
  Zy = /*#__PURE__*/ o(2, (e, t) => Oy(Jg(e.channel, t))),
  Qy = /*#__PURE__*/ o(2, (e, t) => Oy(Xg(e.channel, t))),
  $y = /*#__PURE__*/ o(2, (e, t) => Oy(Zg(e.channel, t))),
  eb = /*#__PURE__*/ o(2, (e, t) =>
    $g(e.channel, e => {
      let n = 0
      return Bu({
        while: () => n < e.length,
        body: () => t(e[n++]),
        step: f,
      })
    }),
  ),
  tb = {
    '~effect/match/Match/Matcher': {
      _input: s,
      _filters: s,
      _result: s,
      _return: s,
    },
    _tag: 'ValueMatcher',
    add(e) {
      return Wn(this.value)
        ? this
        : (e._tag === 'When' && e.guard(this.provided) === !0) ||
            (e._tag === 'Not' && e.guard(this.provided) === !1)
          ? nb(this.provided, Bn(e.evaluate(this.provided)))
          : this
    },
    pipe() {
      return r(this, arguments)
    },
  }
function nb(e, t) {
  let n = Object.create(tb)
  return ((n.provided = e), (n.value = t), n)
}
var rb = (e, t) => ({
    _tag: 'When',
    guard: e,
    evaluate: t,
  }),
  ib = e => {
    if (typeof e == 'function') return e
    if (Array.isArray(e)) {
      let t = e.map(ib),
        n = t.length
      return e => {
        if (!Array.isArray(e)) return !1
        for (let r = 0; r < n; r++) if (t[r](e[r]) === !1) return !1
        return !0
      }
    } else if (typeof e == 'object' && e) {
      let t = Object.entries(e).map(([e, t]) => [e, ib(t)]),
        n = t.length
      return e => {
        if (typeof e != 'object' || !e) return !1
        for (let r = 0; r < n; r++) {
          let [n, i] = t[r]
          if (!(n in e) || i(e[n]) === !1) return !1
        }
        return !0
      }
    }
    return t => t === e
  },
  ab = e => nb(e, Vn(e)),
  ob = () => e => e,
  sb = (e, t) => n => n.add(rb(ib(e), t)),
  cb = e => t => {
    let n = rb(
      n => n != null && n[e] in t,
      n => t[n[e]](n),
    )
    return e => e.add(n)
  },
  lb = /*#__PURE__*/ (e => t => {
    let n = cb(e)(t)
    return e => pb(n(e))
  })('_tag'),
  ub = e => t => {
    let n = db(t)
    return Hn(n)
      ? n._tag === 'Success'
        ? n.success
        : e(n.failure)
      : t => {
          let r = n(t)
          return Wn(r) ? r.success : e(r.failure)
        }
  },
  db = e => {
    if (e._tag === 'ValueMatcher') return e.value
    let t = e.cases.length
    if (t === 1) {
      let t = e.cases[0]
      return e =>
        (t._tag === 'When' && t.guard(e) === !0) ||
        (t._tag === 'Not' && t.guard(e) === !1)
          ? Bn(t.evaluate(e))
          : Vn(e)
    }
    return n => {
      for (let r = 0; r < t; r++) {
        let t = e.cases[r]
        if (
          (t._tag === 'When' && t.guard(n) === !0) ||
          (t._tag === 'Not' && t.guard(n) === !1)
        )
          return Bn(t.evaluate(n))
      }
      return Vn(n)
    }
  },
  fb = 'effect/match/Match/exhaustive: absurd',
  pb = e => {
    let t = db(e)
    if (Hn(t)) {
      if (Wn(t)) return t.success
      throw Error(fb)
    }
    return e => {
      let n = t(e)
      if (Wn(n)) return n.success
      throw Error(fb)
    }
  },
  mb = ab,
  hb = ob,
  gb = sb,
  _b = lb,
  vb = ub,
  yb = pb,
  bb = {
    '~effect/Ref': { _A: s },
    ...bt,
    toJSON() {
      return {
        _id: 'Ref',
        ref: this.ref,
      }
    },
  },
  xb = e => {
    let t = Object.create(bb)
    return ((t.ref = ch(e)), t)
  },
  Sb = e => R(() => xb(e)),
  Cb = e => R(() => e.ref.current),
  wb = /*#__PURE__*/ o(2, (e, t) => R(() => lh(e.ref, t))),
  Tb = /*#__PURE__*/ o(2, (e, t) =>
    R(() => {
      let n = e.ref.current
      return ((e.ref.current = t), n)
    }),
  ),
  Eb = e => e.ref.current,
  Db = '~effect/SubscriptionRef',
  Ob = {
    ...bt,
    [Db]: { _A: s },
    toJSON() {
      return {
        _id: 'SubscriptionRef',
        value: this.value,
      }
    },
  },
  kb = e =>
    H(ph({ replay: 1 }), t => {
      let n = Object.create(Ob)
      return (
        (n.semaphore = dg(1)),
        (n.value = e),
        (n.pubsub = t),
        gh(n.pubsub, e),
        n
      )
    }),
  Ab = e => e.value,
  jb = e => R(() => e.value),
  Mb = (e, t) => {
    ;((e.value = t), gh(e.pubsub, t))
  },
  Nb = /*#__PURE__*/ o(2, (e, t) =>
    e.semaphore.withPermit(R(() => Mb(e, t(e.value)))),
  ),
  Pb = e =>
    new Proxy(function () {}, {
      apply(t, n, r) {
        return e.make(r[0] ?? {})
      },
      get(t, n, r) {
        return Reflect.get(e, n, r)
      },
      has(t, n) {
        return Reflect.has(e, n)
      },
      getPrototypeOf() {
        return Reflect.getPrototypeOf(e)
      },
    })
function Fb(e, t = {}) {
  return Pb(q(e, t))
}
function Ib(e, t = {}) {
  return Pb(q(e, t))
}
//#endregion
//#region ../../packages/foldkit/src/mount/index.ts
var Lb = class extends di()('@foldkit/MountTracker') {}
o(2, (e, t) => ({
  ...e,
  f: n => e.f(n).pipe(Uy(t)),
}))
//#endregion
//#region ../../packages/foldkit/src/snabbdom/vnode.ts
var Rb = Symbol('foldkit/vnode-data-mask'),
  zb = {
    Attrs: 1,
    Class: 2,
    Dataset: 4,
    On: 8,
    Props: 16,
    Style: 32,
  }
function Bb(e, t, n, r, i) {
  return {
    sel: e,
    data: t,
    children: n,
    text: r,
    elm: i,
    key: t === void 0 ? void 0 : t.key,
  }
}
//#endregion
//#region ../../packages/foldkit/src/snabbdom/attributes.ts
var Vb = 'http://www.w3.org/1999/xlink',
  Hb = 'http://www.w3.org/2000/xmlns/',
  Ub = 'http://www.w3.org/XML/1998/namespace',
  Wb = 58,
  Gb = 120,
  Kb = 109
function qb(e, t) {
  let n,
    r = t.elm,
    i = e.data.attrs,
    a = t.data.attrs
  if (!(!i && !a) && i !== a) {
    for (n in ((i ||= {}), (a ||= {}), a)) {
      let e = a[n]
      i[n] !== e &&
        (e === !0
          ? r.setAttribute(n, '')
          : e === !1
            ? r.removeAttribute(n)
            : n.charCodeAt(0) === Gb
              ? n.charCodeAt(3) === Wb
                ? r.setAttributeNS(Ub, n, e)
                : n.charCodeAt(5) === Wb
                  ? n.charCodeAt(1) === Kb
                    ? r.setAttributeNS(Hb, n, e)
                    : r.setAttributeNS(Vb, n, e)
                  : r.setAttribute(n, e)
              : r.setAttribute(n, e))
    }
    for (n in i) n in a || r.removeAttribute(n)
  }
}
var Jb = {
  dataMask: zb.Attrs,
  create: qb,
  update: qb,
}
//#endregion
//#region ../../packages/foldkit/src/snabbdom/class.ts
function Yb(e, t) {
  let n,
    r,
    i = t.elm,
    a = e.data.class,
    o = t.data.class
  if (!(!a && !o) && a !== o) {
    for (r in ((a ||= {}), (o ||= {}), a))
      a[r] &&
        !Object.prototype.hasOwnProperty.call(o, r) &&
        i.classList.remove(r)
    for (r in o)
      ((n = o[r]), n !== a[r] && i.classList[n ? 'add' : 'remove'](r))
  }
}
var Xb = {
    dataMask: zb.Class,
    create: Yb,
    update: Yb,
  },
  Zb = /[A-Z]/g
function Qb(e, t) {
  let n = t.elm,
    r = e.data.dataset,
    i = t.data.dataset,
    a
  if ((!r && !i) || r === i) return
  ;((r ||= {}), (i ||= {}))
  let o = n.dataset
  for (a in r)
    a in i ||
      (o
        ? a in o && delete o[a]
        : n.removeAttribute('data-' + a.replace(Zb, '-$&').toLowerCase()))
  for (a in i)
    r[a] !== i[a] &&
      (o
        ? (o[a] = i[a])
        : n.setAttribute('data-' + a.replace(Zb, '-$&').toLowerCase(), i[a]))
}
var $b = {
  dataMask: zb.Dataset,
  create: Qb,
  update: Qb,
}
//#endregion
//#region ../../packages/foldkit/src/snabbdom/eventlisteners.ts
function ex(e, t, n) {
  if (typeof e == 'function') e.call(t, n, t)
  else if (typeof e == 'object')
    for (let r = 0; r < e.length; r++) ex(e[r], t, n)
}
function tx(e, t) {
  let n = e.type,
    r = t.data.on
  r && r[n] && ex(r[n], t, e)
}
function nx() {
  return function e(t) {
    tx(t, e.vnode)
  }
}
function rx(e, t) {
  let n = e.data.on,
    r = e.listener,
    i = e.elm,
    a = t && t.data.on,
    o = t && t.elm,
    s
  if (n !== a) {
    if (n && r)
      if (a) for (s in n) a[s] || i.removeEventListener(s, r, !1)
      else for (s in n) i.removeEventListener(s, r, !1)
    if (a) {
      let r = (t.listener = e.listener || nx())
      if (((r.vnode = t), n)) for (s in a) n[s] || o.addEventListener(s, r, !1)
      else for (s in a) o.addEventListener(s, r, !1)
    }
  }
}
var ix = {
    dataMask: zb.On,
    create: rx,
    update: rx,
    destroy: rx,
  },
  ax = Array.isArray
function ox(e) {
  return (
    typeof e == 'string' ||
    typeof e == 'number' ||
    e instanceof String ||
    e instanceof Number
  )
}
//#endregion
//#region ../../packages/foldkit/src/snabbdom/h.ts
function sx(e, t, n) {
  if (
    ((e.ns = 'http://www.w3.org/2000/svg'),
    n !== 'foreignObject' && t !== void 0)
  )
    for (let e = 0; e < t.length; ++e) {
      let n = t[e]
      if (typeof n == 'string') continue
      let r = n.data
      r !== void 0 && sx(r, n.children, n.sel)
    }
}
function cx(e, t, n) {
  let r = {},
    i,
    a,
    o
  if (
    (n === void 0
      ? t != null &&
        (ax(t)
          ? (i = t)
          : ox(t)
            ? (a = t.toString())
            : t && t.sel
              ? (i = [t])
              : (r = t))
      : (t !== null && (r = t),
        ax(n) ? (i = n) : ox(n) ? (a = n.toString()) : n && n.sel && (i = [n])),
    i !== void 0)
  )
    for (o = 0; o < i.length; ++o)
      ox(i[o]) && (i[o] = Bb(void 0, void 0, void 0, i[o], void 0))
  return (
    e.startsWith('svg') &&
      (e.length === 3 || e[3] === '.' || e[3] === '#') &&
      sx(r, i, e),
    Bb(e, r, i, a, void 0)
  )
}
//#endregion
//#region ../../packages/foldkit/src/snabbdom/htmldomapi.ts
function lx(e, t) {
  return document.createElement(e, t)
}
function ux(e, t, n) {
  return document.createElementNS(e, t, n)
}
function dx() {
  return Ex(document.createDocumentFragment())
}
function fx(e) {
  return document.createTextNode(e)
}
function px(e) {
  return document.createComment(e)
}
function mx(e, t, n) {
  if (Tx(e)) {
    let t = e
    for (; t && Tx(t); ) t = Ex(t).parent
    e = t ?? e
  }
  ;(Tx(t) && (t = Ex(t, e)),
    n && Tx(n) && (n = Ex(n).firstChildNode),
    e.insertBefore(t, n))
}
function hx(e, t) {
  e.removeChild(t)
}
function gx(e, t) {
  ;(Tx(t) && (t = Ex(t, e)), e.appendChild(t))
}
function _x(e) {
  if (Tx(e)) {
    for (; e && Tx(e); ) e = Ex(e).parent
    return e ?? null
  }
  return e.parentNode
}
function vx(e) {
  if (Tx(e)) {
    let t = Ex(e),
      n = _x(t)
    if (n && t.lastChildNode) {
      let e = Array.from(n.childNodes)
      return e[e.indexOf(t.lastChildNode) + 1] ?? null
    }
    return null
  }
  return e.nextSibling
}
function yx(e) {
  return e.tagName
}
function bx(e, t) {
  e.textContent = t
}
function xx(e) {
  return e.textContent
}
function Sx(e) {
  return e.nodeType === 1
}
function Cx(e) {
  return e.nodeType === 3
}
function wx(e) {
  return e.nodeType === 8
}
function Tx(e) {
  return e.nodeType === 11
}
function Ex(e, t) {
  let n = e
  return (
    (n.parent ??= t ?? null),
    (n.firstChildNode ??= e.firstChild),
    (n.lastChildNode ??= e.lastChild),
    n
  )
}
var Dx = {
    createElement: lx,
    createElementNS: ux,
    createTextNode: fx,
    createDocumentFragment: dx,
    createComment: px,
    insertBefore: mx,
    removeChild: hx,
    appendChild: gx,
    parentNode: _x,
    nextSibling: vx,
    tagName: yx,
    setTextContent: bx,
    getTextContent: xx,
    isElement: Sx,
    isText: Cx,
    isComment: wx,
    isDocumentFragment: Tx,
  },
  Ox = Bb('', {}, [], void 0, void 0)
function kx(e, t) {
  return e === t
    ? !0
    : e.sel !== t.sel ||
        e.key !== t.key ||
        e.identity !== t.identity ||
        e.data?.is !== t.data?.is
      ? !1
      : e.sel !== void 0 || typeof e.text == typeof t.text
}
function Ax() {
  throw Error('The document fragment is not supported on this platform.')
}
function jx(e, t) {
  return e.isElement(t)
}
function Mx(e, t) {
  return e.isDocumentFragment?.(t) ?? !1
}
function Nx(e, t, n) {
  let r = /* @__PURE__ */ new Map()
  for (let i = t; i <= n; ++i) {
    let t = e[i]?.key
    t !== void 0 && r.set(t, i)
  }
  return r
}
var Px = ['create', 'update', 'remove', 'destroy', 'pre', 'post'],
  Fx = void 0,
  Ix = () => Fx ?? !1
function Lx(e, t, n) {
  let r = {
      create: [],
      update: [],
      remove: [],
      destroy: [],
      pre: [],
      post: [],
    },
    i = {
      create: [],
      update: [],
      destroy: [],
    },
    a = t === void 0 ? Dx : t,
    o = !1
  for (let t of Px)
    for (let n of e) {
      let e = n[t]
      e !== void 0 &&
        (r[t].push(e),
        (t === 'create' || t === 'update' || t === 'destroy') &&
          i[t].push(n.dataMask))
    }
  function s(e) {
    let t = e.id ? '#' + e.id : '',
      n = e.getAttribute('class'),
      r = n ? '.' + n.split(' ').join('.') : ''
    return Bb(a.tagName(e).toLowerCase() + t + r, {}, [], void 0, e)
  }
  function c(e) {
    return Bb(void 0, {}, [], void 0, e)
  }
  function l(e, t) {
    return function () {
      if (--t === 0) {
        let t = a.parentNode(e)
        t !== null && a.removeChild(t, e)
      }
    }
  }
  function u(e, t) {
    let o = e.data,
      s = o?.hook
    s?.init?.(e)
    let c = e.children,
      l = e.sel
    if (l === '!') ((e.text ??= ''), (e.elm = a.createComment(e.text)))
    else if (l === '') e.elm = a.createTextNode(e.text)
    else if (l !== void 0) {
      let n = l.indexOf('#'),
        d = l.indexOf('.', n),
        f = n > 0 ? n : l.length,
        p = d > 0 ? d : l.length,
        m = n !== -1 || d !== -1 ? l.slice(0, Math.min(f, p)) : l,
        h = o?.ns,
        g = h === void 0 ? a.createElement(m, o) : a.createElementNS(h, m, o)
      ;((e.elm = g),
        f < p && g.setAttribute('id', l.slice(f + 1, p)),
        d > 0 && g.setAttribute('class', l.slice(p + 1).replace(/\./g, ' ')))
      let _ = o?.[Rb]
      for (let t = 0; t < r.create.length; ++t) {
        let n = i.create[t]
        ;(n === void 0 || _ === void 0 || (_ & n) !== 0) && r.create[t](Ox, e)
      }
      if (
        (ox(e.text) &&
          (!ax(c) || c.length === 0) &&
          a.appendChild(g, a.createTextNode(e.text)),
        ax(c))
      )
        for (let e = 0; e < c.length; ++e) {
          let n = c[e]
          n != null && a.appendChild(g, u(n, t))
        }
      s !== void 0 && (s.create?.(Ox, e), s.insert !== void 0 && t.push(e))
    } else if (n?.experimental?.fragments && e.children) {
      e.elm = (a.createDocumentFragment ?? Ax)()
      let n = o?.[Rb]
      for (let t = 0; t < r.create.length; ++t) {
        let a = i.create[t]
        ;(a === void 0 || n === void 0 || (n & a) !== 0) && r.create[t](Ox, e)
      }
      for (let n = 0; n < e.children.length; ++n) {
        let r = e.children[n]
        r != null && a.appendChild(e.elm, u(r, t))
      }
    } else e.elm = a.createTextNode(e.text)
    return e.elm
  }
  function d(e, t, n, r, i, o) {
    for (; r <= i; ++r) {
      let i = n[r]
      i != null && a.insertBefore(e, u(i, o), t)
    }
  }
  function f(e) {
    let t = e.data
    if (t !== void 0) {
      t?.hook?.destroy?.(e)
      let n = t[Rb]
      for (let t = 0; t < r.destroy.length; ++t) {
        let a = i.destroy[t]
        ;(a === void 0 || n === void 0 || (n & a) !== 0) && r.destroy[t](e)
      }
      if (e.children !== void 0)
        for (let t = 0; t < e.children.length; ++t) {
          let n = e.children[t]
          n != null && typeof n != 'string' && f(n)
        }
    }
  }
  function p(e, t, n, i) {
    for (; n <= i; ++n) {
      let i,
        o = t[n]
      if (o != null)
        if (o.sel !== void 0) {
          ;(f(o), (i = r.remove.length + 1))
          let e = l(o.elm, i)
          for (let t = 0; t < r.remove.length; ++t) r.remove[t](o, e)
          let t = o.data?.hook?.remove
          t === void 0 ? e() : t(o, e)
        } else
          o.children
            ? (f(o), p(e, o.children, 0, o.children.length - 1))
            : a.removeChild(e, o.elm)
    }
  }
  function m(e, t, n, r) {
    if (!Ix() || o) return
    let i = /* @__PURE__ */ new Set()
    for (let s = t; s <= n; ++s) {
      let t = e[s]?.key
      if (t !== void 0) {
        if (i.has(t)) {
          o = !0
          let e = a.isElement(r)
            ? a.tagName(r).toLowerCase()
            : String(r.nodeName).toLowerCase()
          console.warn(
            `[foldkit] Duplicate key "${String(t)}" among children of <${e}>. Keys must be unique among siblings; duplicates make sibling matching ambiguous and can patch the wrong element.`,
          )
          return
        }
        i.add(t)
      }
    }
  }
  function h(e, t, n, r) {
    if (t.length === 0 && n.length === 0) return
    m(n, 0, n.length - 1, e)
    let i = 0,
      o = 0,
      s = t.length - 1,
      c = n.length - 1
    for (; i <= s && o <= c && t[i] === n[o]; ) ((i += 1), (o += 1))
    for (; i <= s && o <= c && t[s] === n[c]; ) (--s, --c)
    let l = t[i],
      f = t[s],
      h = n[o],
      _ = n[c],
      v,
      ee,
      te,
      ne
    for (; i <= s && o <= c; )
      if (l == null) l = t[++i]
      else if (f == null) f = t[--s]
      else if (h == null) h = n[++o]
      else if (_ == null) _ = n[--c]
      else if (kx(l, h)) (g(l, h, r), (l = t[++i]), (h = n[++o]))
      else if (kx(f, _)) (g(f, _, r), (f = t[--s]), (_ = n[--c]))
      else if (kx(l, _))
        (g(l, _, r),
          a.insertBefore(e, l.elm, a.nextSibling(f.elm)),
          (l = t[++i]),
          (_ = n[--c]))
      else if (kx(f, h))
        (g(f, h, r),
          a.insertBefore(e, f.elm, l.elm),
          (f = t[--s]),
          (h = n[++o]))
      else {
        v === void 0 && ((v = Nx(t, i, s)), m(t, i, s, e))
        let d = h.key
        ;((ee = d === void 0 ? void 0 : v.get(d)),
          ee === void 0
            ? (a.insertBefore(e, u(h, r), l.elm), (h = n[++o]))
            : _.key === void 0 || v.get(_.key) === void 0
              ? (a.insertBefore(e, u(_, r), a.nextSibling(f.elm)), (_ = n[--c]))
              : ((te = t[ee]),
                kx(te, h)
                  ? (g(te, h, r),
                    (t[ee] = void 0),
                    a.insertBefore(e, te.elm, l.elm))
                  : a.insertBefore(e, u(h, r), l.elm),
                (h = n[++o])))
      }
    ;(o <= c &&
      ((ne = n[c + 1] == null ? null : n[c + 1].elm), d(e, ne, n, o, c, r)),
      i <= s && p(e, t, i, s))
  }
  function g(e, t, n) {
    if (e === t) return
    let o = t.data?.hook
    o?.prepatch?.(e, t)
    let s = (t.elm = e.elm)
    if (t.data !== void 0 || (t.text !== void 0 && t.text !== e.text)) {
      ;((t.data ??= {}), (e.data ??= {}))
      let n = e.data[Rb],
        a = t.data[Rb]
      for (let o = 0; o < r.update.length; ++o) {
        let s = i.update[o]
        ;(s === void 0 ||
          n === void 0 ||
          a === void 0 ||
          ((n | a) & s) !== 0) &&
          r.update[o](e, t)
      }
      t.data?.hook?.update?.(e, t)
    }
    let c = e.children,
      l = t.children
    ;(t.text === void 0
      ? c !== void 0 && l !== void 0
        ? c !== l && h(s, c, l, n)
        : l === void 0
          ? c === void 0
            ? e.text !== void 0 && a.setTextContent(s, '')
            : p(s, c, 0, c.length - 1)
          : (e.text !== void 0 && a.setTextContent(s, ''),
            d(s, null, l, 0, l.length - 1, n))
      : e.text !== t.text &&
        (c !== void 0 && p(s, c, 0, c.length - 1), a.setTextContent(s, t.text)),
      o?.postpatch?.(e, t))
  }
  return function (e, t) {
    let n = []
    o = !1
    for (let e = 0; e < r.pre.length; ++e) r.pre[e]()
    if ((jx(a, e) ? (e = s(e)) : Mx(a, e) && (e = c(e)), kx(e, t))) g(e, t, n)
    else {
      let r = e.elm,
        i = a.parentNode(r)
      ;(u(t, n),
        i !== null &&
          (a.insertBefore(i, t.elm, a.nextSibling(r)), p(i, [e], 0, 0)))
    }
    for (let e = 0; e < n.length; ++e) n[e].data.hook.insert(n[e])
    for (let e = 0; e < r.post.length; ++e) r.post[e]()
    return t
  }
}
//#endregion
//#region ../../packages/foldkit/src/snabbdom/style.ts
var Rx =
    typeof window < 'u' && typeof window.requestAnimationFrame == 'function'
      ? window.requestAnimationFrame.bind(window)
      : setTimeout,
  zx = function (e) {
    Rx(function () {
      Rx(e)
    })
  },
  Bx = !1
function Vx(e, t, n) {
  zx(function () {
    e[t] = n
  })
}
function Hx(e, t) {
  let n,
    r,
    i = t.elm,
    a = e.data.style,
    o = t.data.style
  if ((!a && !o) || a === o) return
  ;((a ||= {}), (o ||= {}))
  let s = 'delayed' in a
  for (r in a)
    r in o ||
      (r[0] === '-' && r[1] === '-'
        ? i.style.removeProperty(r)
        : (i.style[r] = ''))
  for (r in o)
    if (((n = o[r]), r === 'delayed' && o.delayed))
      for (let e in o.delayed)
        ((n = o.delayed[e]), (!s || n !== a.delayed[e]) && Vx(i.style, e, n))
    else
      r !== 'remove' &&
        n !== a[r] &&
        (r[0] === '-' && r[1] === '-'
          ? i.style.setProperty(r, n)
          : (i.style[r] = n))
}
function Ux(e) {
  let t,
    n,
    r = e.elm,
    i = e.data.style
  if (!(!i || !(t = i.destroy))) for (n in t) r.style[n] = t[n]
}
function Wx(e, t) {
  let n = e.data.style
  if (!n || !n.remove) {
    t()
    return
  }
  Bx ||= (e.elm.offsetLeft, !0)
  let r,
    i = e.elm,
    a = 0,
    o = n.remove,
    s = 0,
    c = []
  for (r in o) (c.push(r), (i.style[r] = o[r]))
  let l = getComputedStyle(i)['transition-property'].split(', ')
  for (; a < l.length; ++a) c.indexOf(l[a]) !== -1 && s++
  i.addEventListener('transitionend', function (e) {
    ;(e.target === i && --s, s === 0 && t())
  })
}
function Gx() {
  Bx = !1
}
var Kx = {
  dataMask: zb.Style,
  pre: Gx,
  create: Hx,
  update: Hx,
  destroy: Ux,
  remove: Wx,
}
//#endregion
//#region ../../packages/foldkit/src/snabbdom/tovnode.ts
function qx(e) {
  return e.slice(5).replace(/-([a-z])/g, (e, t) => t.toUpperCase())
}
function Jx(e, t) {
  let n = t === void 0 ? Dx : t,
    r
  if (n.isElement(e)) {
    let r = e.id ? '#' + e.id : '',
      i = e.getAttribute('class')?.match(/[^\t\r\n\f ]+/g),
      a = i ? '.' + i.join('.') : '',
      o = n.tagName(e).toLowerCase() + r + a,
      s = {},
      c = {},
      l = {},
      u = [],
      d,
      f,
      p,
      m = e.attributes,
      h = e.childNodes
    for (f = 0, p = m.length; f < p; f++)
      ((d = m[f].name),
        d.startsWith('data-')
          ? (c[qx(d)] = m[f].value || '')
          : d !== 'id' && d !== 'class' && (s[d] = m[f].value))
    for (f = 0, p = h.length; f < p; f++) u.push(Jx(h[f], t))
    return (
      Object.keys(s).length > 0 && (l.attrs = s),
      Object.keys(c).length > 0 && (l.dataset = c),
      o.startsWith('svg') &&
        (o.length === 3 || o[3] === '.' || o[3] === '#') &&
        sx(l, u, o),
      Bb(o, l, u, void 0, e)
    )
  } else if (n.isText(e))
    return ((r = n.getTextContent(e)), Bb(void 0, void 0, void 0, r, e))
  else if (n.isComment(e))
    return ((r = n.getTextContent(e)), Bb('!', {}, [], r, e))
  else return Bb('', {}, [], void 0, e)
}
//#endregion
//#region ../../packages/foldkit/src/html/boundary.ts
var Yx = '|',
  Xx = (e, t) => {
    if (t.includes(Yx))
      throw Error(
        `Foldkit: h.submodel slotId cannot contain the boundary separator "${Yx}". Got ${JSON.stringify(t)}.`,
      )
    return e === '' ? t : `${e}${Yx}${t}`
  },
  Zx = e => (e === '' ? [] : e.split(Yx)),
  Qx = () => ({
    wraps: /* @__PURE__ */ new Map(),
    boundaryDispatches: /* @__PURE__ */ new WeakMap(),
    seenThisRender: /* @__PURE__ */ new Map(),
    lazyTrackingStack: [],
    dedupeSeen: /* @__PURE__ */ new Set(),
  }),
  $x = () => {
    let e = /* @__PURE__ */ (Error().stack ?? '').split('\n')
    for (let t of e) {
      let e = t.trim()
      if (
        !(
          e.length === 0 ||
          e.startsWith('Error') ||
          e.includes('captureCallSite') ||
          e.includes('registerBoundaryWrap') ||
          e.includes('at submodel')
        )
      )
        return e
    }
    return '(call site unavailable)'
  },
  eS = (e, t, n) => {
    let r = e.seenThisRender.get(t)
    if (r !== void 0) {
      let e = t.includes(Yx) ? t.slice(t.lastIndexOf(Yx) + 1) : t,
        n = $x()
      throw Error(
        `Foldkit: duplicate h.submodel slotId "${e}" at boundary "${t}".\n  First registration: ${r}\n  Second registration: ${n}\nEach h.submodel call inside the same parent boundary must use a unique \`slotId\`. The slotId is DOM-slot identity, not model identity. If the same model is rendered in two locations (desktop + mobile, master + detail), each slot needs its own id (e.g. "desktop-foo", "mobile-foo"). For lists, use a stable per-item identifier.`,
      )
    }
    let i = $x()
    ;(e.wraps.set(t, n), e.seenThisRender.set(t, i))
    for (let n of e.lazyTrackingStack) n.set(t, i)
  },
  tS = (e, t) => {
    e.wraps.delete(t)
  },
  nS = (e, t, n, r, i) => {
    let a = r,
      o = Zx(n)
    for (let t = o.length; t > 0; t--) {
      let r = o.slice(0, t).join(Yx),
        i = e.wraps.get(r)
      if (i === void 0)
        throw Error(
          `Foldkit: dispatchAcrossBoundary missing wrap for ancestor "${r}" of boundary "${n}". The Submodel's wrap was absent from the registry at dispatch time. A known cause: a slot callback (an h.submodel \`viewInputs\` function value) was invoked from a deferred context (setTimeout, Promise.then, a stored callback) after the parent Submodel unmounted. Slot callbacks must be invoked synchronously inside the render that created them. It can also mean foldkit was loaded as more than one instance (a bundler split foldkit and @foldkit/ui), so the wrap was registered in one copy and read from another.`,
        )
      a = i.toParentMessage(a)
    }
    t(a, i)
  },
  rS = (e, t, n, r) => {
    if (n === '') return () => t(r)
    let i = r,
      a = Zx(n)
    for (let t = a.length; t > 0; t--) {
      let r = a.slice(0, t).join(Yx),
        o = e.wraps.get(r)
      if (o === void 0)
        throw Error(
          `Foldkit: resolveBoundaryDispatchThunk missing wrap for ancestor "${r}" of boundary "${n}" while resolving an OnUnmount message. The Submodel's wrap was absent from the registry at resolve time, which should not happen during a live render.`,
        )
      i = o.toParentMessage(i)
    }
    let o = i
    return () => t(o)
  },
  iS = (e, t) => {
    let n = Zx(t),
      r = []
    for (let i = n.length; i > 0; i--) {
      let a = n.slice(0, i).join(Yx),
        o = e.wraps.get(a)
      if (o === void 0)
        throw Error(
          `Foldkit: boundaryMappers missing wrap for ancestor "${a}" of boundary "${t}" while snapshotting an OnMount lift. The Submodel's wrap was absent from the registry during render, which should not happen for a live boundary.`,
        )
      r.push(o.toParentMessage)
    }
    return r
  },
  aS = (e, t, n) => {
    if (n === '') return t
    let r = e.boundaryDispatches.get(t)
    r === void 0 &&
      ((r = /* @__PURE__ */ new Map()), e.boundaryDispatches.set(t, r))
    let i = r.get(n)
    if (i !== void 0) return i
    let a = (r, i) => {
      nS(e, t, n, r, i)
    }
    return (r.set(n, a), a)
  },
  oS = e => {
    ;(e.seenThisRender.clear(), e.dedupeSeen.clear())
  },
  sS = [],
  cS = (e, t, n = Qx()) => {
    sS.push({
      outerDispatch: e,
      runtimeContext: t,
      boundaryRegistry: n,
      boundaryId: '',
    })
  },
  lS = e => {
    let t = sS[sS.length - 1]
    if (t === void 0)
      throw Error(
        'Foldkit: pushBoundary called without an active runtime frame',
      )
    sS.push({
      outerDispatch: t.outerDispatch,
      runtimeContext: t.runtimeContext,
      boundaryRegistry: t.boundaryRegistry,
      boundaryId: e,
    })
  },
  uS = e => {
    sS.push(e)
  },
  dS = () => {
    if (sS.length === 0)
      throw Error(
        'Foldkit: clearRuntime called on an empty runtime stack. This means a `pushBoundary` or `setRuntime` was not paired with `clearRuntime` (or vice versa) upstream. Likely a bug in a custom Submodel integration or view-time helper.',
      )
    sS.pop()
  },
  fS = () => {
    let e = sS[sS.length - 1]
    if (e === void 0)
      throw Error(
        'Foldkit: html element constructors must be called inside a runtime-driven render. The element was built outside a view, or foldkit was loaded as more than one instance (a bundler split foldkit and @foldkit/ui into separate copies).',
      )
    return aS(e.boundaryRegistry, e.outerDispatch, e.boundaryId)
  },
  pS = () => {
    let e = sS[sS.length - 1]
    if (e === void 0)
      throw Error(
        'Foldkit: html element constructors must be called inside a runtime-driven render. The element was built outside a view, or foldkit was loaded as more than one instance (a bundler split foldkit and @foldkit/ui into separate copies).',
      )
    return t => rS(e.boundaryRegistry, e.outerDispatch, e.boundaryId, t)
  },
  mS = () => {
    let e = sS[sS.length - 1]
    return e === void 0 ? [] : iS(e.boundaryRegistry, e.boundaryId)
  },
  hS = () => {
    let e = sS[sS.length - 1]
    if (e === void 0)
      throw Error(
        'Foldkit: html element constructors must be called inside a runtime-driven render. The element was built outside a view, or foldkit was loaded as more than one instance (a bundler split foldkit and @foldkit/ui into separate copies).',
      )
    return e.runtimeContext
  },
  gS = () => {
    let e = sS[sS.length - 1]
    if (e === void 0)
      throw Error(
        'Foldkit: getCurrentFrame called without an active runtime frame',
      )
    return e
  },
  _S = '__childAttribute',
  vS = e => typeof e == 'object' && !!e && _S in e,
  yS = /* @__PURE__ */ new WeakMap(),
  bS = e => {
    let t = yS.get(e)
    if (t !== void 0) return t
    let n = {
      targets: /* @__PURE__ */ new Set(),
      pendingEmptyCheck: !1,
    }
    return (yS.set(e, n), n)
  },
  xS = (e, t) => {
    for (let n of t) (!(n instanceof Node) || !e.contains(n)) && t.delete(n)
  },
  SS = (e, t, n) => {
    xS(t, e.targets)
    let r = e.targets.size > 0 || e.pendingEmptyCheck
    return (e.targets.add(n ?? t), !r)
  },
  CS = (e, t, n) => (
    e.targets.delete(n ?? t),
    xS(t, e.targets),
    e.targets.size > 0 || e.pendingEmptyCheck
      ? 'done'
      : ((e.pendingEmptyCheck = !0), 'schedule')
  ),
  wS = e => ((e.pendingEmptyCheck = !1), e.targets.size === 0),
  TS = e => {
    let t = yS.get(e)
    t !== void 0 && (t.targets.clear(), (t.pendingEmptyCheck = !1))
  }
//#endregion
//#region ../../packages/foldkit/src/propsModule.ts
function ES(e, t) {
  let n = t.elm,
    r = e.data?.props,
    i = t.data?.props
  if (!(!r && !i) && r !== i) {
    ;((r ??= {}), (i ??= {}))
    for (let e in i) {
      let t = i[e]
      r[e] !== t && (e !== 'value' || n[e] !== t) && (n[e] = t)
    }
    for (let e in r)
      if (!(e in i)) {
        let t = r[e]
        typeof t == 'boolean'
          ? (n[e] = !1)
          : typeof t == 'string'
            ? (n[e] = '')
            : typeof t == 'number' && (n[e] = 0)
      }
  }
}
//#endregion
//#region ../../packages/foldkit/src/vdom.ts
var DS = Lx([
    Jb,
    Xb,
    $b,
    ix,
    {
      dataMask: zb.Props,
      create: ES,
      update: ES,
    },
    Kx,
  ]),
  OS = /* @__PURE__ */ new WeakSet(),
  kS = (e, t) => {
    let n
    for (let r = 0; r < e.length; r++) {
      let i = e[r],
        a = typeof i == 'string' ? i : AS(i, t)
      a !== i && (n === void 0 && (n = e.slice()), (n[r] = a))
    }
    return n
  },
  AS = (e, t) => {
    let n = t.has(e)
    if (!n && OS.has(e)) return (t.add(e), e)
    let r =
      n || e.elm != null
        ? {
            ...e,
            elm: void 0,
          }
        : e
    if ((t.add(e), r.children === void 0)) return r
    let i = kS(r.children, t)
    return i === void 0
      ? r
      : r === e
        ? {
            ...e,
            children: i,
          }
        : ((r.children = i), r)
  },
  jS = (e, t = /* @__PURE__ */ new Set()) => AS(e, t),
  MS = (e, t, n, r) => {
    let i = se(t) ? jS(t, r) : cx('!')
    return M(e, {
      onNone: () => DS(Jx(n), i),
      onSome: e => DS(e, i),
    })
  },
  NS = e => typeof e == 'object' && !!e && !Array.isArray(e),
  PS = e => {
    for (let t of Object.keys(e)) {
      let n = e[t]
      FS(n) || ((NS(n) || Array.isArray(n)) && IS(n, [t]))
    }
  },
  FS = e => vS(e),
  IS = (e, t) => {
    let n = (e, n) => {
      let r = [...t, n]
      if (typeof e == 'function')
        throw Error(
          `Foldkit: h.submodel \`viewInputs\` may only contain functions at the top level. Found a function at \`viewInputs.${r.join('.')}\`. Lift it to the top level of \`viewInputs\` so it can be auto-scoped to the parent boundary, or pass the value as primitive data.`,
        )
      FS(e) || ((NS(e) || Array.isArray(e)) && IS(e, r))
    }
    if (Array.isArray(e)) e.forEach((e, t) => n(e, `[${t}]`))
    else if (NS(e)) for (let t of Object.keys(e)) n(e[t], t)
  },
  LS = (e, t) => {
    if (!NS(e)) return e
    PS(e)
    let n = {}
    for (let r of Object.keys(e)) {
      let i = e[r]
      typeof i == 'function'
        ? (n[r] = (...e) => {
            uS(t)
            try {
              return i(...e)
            } finally {
              dS()
            }
          })
        : (n[r] = i)
    }
    return n
  },
  RS = (e, t, n) => {
    let r = e.data ?? {},
      i = r.hook ?? {},
      a = i.destroy,
      o = e => {
        ;(t.seenThisRender.has(n) || tS(t, n), a !== void 0 && a(e))
      },
      s = {
        ...e,
        data: {
          ...r,
          hook: {
            ...i,
            destroy: o,
          },
        },
      }
    return (OS.has(e) && OS.add(s), s)
  },
  zS = e => {
    let t = gS(),
      n = t.boundaryRegistry,
      r = Xx(t.boundaryId, e.slotId)
    eS(n, r, { toParentMessage: e.toParentMessage })
    let i
    lS(r)
    try {
      try {
        if (ae(e.viewInputs)) {
          let t = e.view
          i = t(e.model)
        } else {
          let n = LS(e.viewInputs, t),
            r = e.view
          i = r(e.model, n)
        }
      } catch (e) {
        throw (tS(n, r), e)
      }
    } finally {
      dS()
    }
    return i === null ? (tS(n, r), null) : RS(i, n, r)
  },
  BS = cS,
  VS = dS,
  HS = Symbol.for('foldkit/html/fileHandler'),
  US = (e, t) => ((e[HS] = t), e),
  WS = e => ({
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
  }),
  GS = /* @__PURE__ */ new WeakMap(),
  KS = !1,
  qS = () => {
    KS = !0
  },
  JS = () => {
    KS = !1
  },
  YS = 'foldkitMount',
  {
    Key: XS,
    Class: ZS,
    Id: QS,
    Title: $S,
    Lang: eC,
    Dir: tC,
    Tabindex: nC,
    Hidden: rC,
    Contenteditable: iC,
    Draggable: aC,
    Accesskey: oC,
    Translate: sC,
    Inert: cC,
    Popover: lC,
    Popovertarget: uC,
    Popovertargetaction: dC,
    OnClick: fC,
    OnClickFocus: pC,
    OnDoubleClick: mC,
    OnMouseDown: hC,
    OnMouseUp: gC,
    OnMouseEnter: _C,
    OnMouseLeave: vC,
    OnMouseOver: yC,
    OnMouseOut: bC,
    OnMouseMove: xC,
    OnPointerMove: SC,
    OnPointerLeave: CC,
    OnPointerDown: wC,
    OnPointerUp: TC,
    OnKeyDown: EC,
    OnKeyDownPreventDefault: DC,
    OnKeyDownFocus: OC,
    OnKeyUp: kC,
    OnKeyUpPreventDefault: AC,
    OnKeyPress: jC,
    OnFocus: MC,
    OnBlur: NC,
    OnInput: PC,
    OnChange: FC,
    OnFileChange: IC,
    OnSubmit: LC,
    OnReset: RC,
    OnScroll: zC,
    OnWheel: BC,
    OnCopy: VC,
    OnCut: HC,
    OnPaste: UC,
    OnPastePreventDefault: WC,
    OnCopyText: GC,
    OnCutText: KC,
    OnCancel: qC,
    OnToggle: JC,
    OnContextMenu: YC,
    OnDragStart: XC,
    OnDrag: ZC,
    OnDragEnd: QC,
    OnDragEnter: $C,
    OnDragLeave: ew,
    OnDragOver: tw,
    AllowDrop: nw,
    OnDrop: rw,
    OnDropFiles: iw,
    OnTouchStart: aw,
    OnTouchEnd: ow,
    OnTouchMove: sw,
    OnTouchCancel: cw,
    OnAnimationStart: lw,
    OnAnimationEnd: uw,
    OnAnimationIteration: dw,
    OnTransitionEnd: fw,
    OnLoad: pw,
    OnError: mw,
    OnPlay: hw,
    OnPause: gw,
    OnEnded: _w,
    OnTimeUpdate: vw,
    OnVolumeChange: yw,
    OnSelect: bw,
    Value: xw,
    Checked: Sw,
    Selected: Cw,
    Open: ww,
    Placeholder: Tw,
    Name: Ew,
    Disabled: Dw,
    Readonly: Ow,
    Required: kw,
    Autofocus: Aw,
    Spellcheck: jw,
    Autocorrect: Mw,
    Autocapitalize: Nw,
    InputMode: Pw,
    EnterKeyHint: Fw,
    Multiple: Iw,
    Type: Lw,
    Accept: Rw,
    Autocomplete: zw,
    Pattern: Bw,
    Maxlength: Vw,
    Minlength: Hw,
    Size: Uw,
    Cols: Ww,
    Rows: Gw,
    Max: Kw,
    Min: qw,
    Step: Jw,
    For: Yw,
    Href: Xw,
    Src: Zw,
    Alt: Qw,
    Target: $w,
    Rel: eT,
    Download: tT,
    Action: nT,
    Method: rT,
    Enctype: iT,
    Novalidate: aT,
    Formaction: oT,
    Formmethod: sT,
    Formnovalidate: cT,
    Formtarget: lT,
    Formenctype: uT,
    Colspan: dT,
    Rowspan: fT,
    Scope: pT,
    Headers: mT,
    Span: hT,
    Start: gT,
    Reversed: _T,
    CiteAttr: vT,
    Datetime: yT,
    Wrap: bT,
    List: xT,
    FormAttr: ST,
    LabelAttr: CT,
    ContentAttr: wT,
    Charset: TT,
    HttpEquiv: ET,
    Srcset: DT,
    Sizes: OT,
    Loading: kT,
    Decoding: AT,
    Fetchpriority: jT,
    Crossorigin: MT,
    Referrerpolicy: NT,
    Integrity: PT,
    Hreflang: FT,
    Ping: IT,
    Sandbox: LT,
    Allow: RT,
    Srcdoc: zT,
    Autoplay: BT,
    Controls: VT,
    Loop: HT,
    Muted: UT,
    Poster: WT,
    Preload: GT,
    Playsinline: KT,
    High: qT,
    Low: JT,
    Optimum: YT,
    Usemap: XT,
    Ismap: ZT,
    Role: QT,
    AriaLabel: $T,
    AriaLabelledBy: eE,
    AriaDescribedBy: tE,
    AriaHidden: nE,
    AriaExpanded: rE,
    AriaSelected: iE,
    AriaChecked: aE,
    AriaDisabled: oE,
    AriaRequired: sE,
    AriaInvalid: cE,
    AriaLive: lE,
    AriaControls: uE,
    AriaCurrent: dE,
    AriaOrientation: fE,
    AriaPressed: pE,
    AriaHasPopup: mE,
    AriaActiveDescendant: hE,
    AriaSort: gE,
    AriaMultiSelectable: _E,
    AriaModal: vE,
    AriaBusy: yE,
    AriaErrorMessage: bE,
    AriaRoleDescription: xE,
    AriaAtomic: SE,
    AriaAutocomplete: CE,
    AriaColcount: wE,
    AriaColindex: TE,
    AriaColspan: EE,
    AriaDescription: DE,
    AriaDetails: OE,
    AriaFlowto: kE,
    AriaKeyshortcuts: AE,
    AriaLevel: jE,
    AriaOwns: ME,
    AriaPlaceholder: NE,
    AriaPosinset: PE,
    AriaReadonly: FE,
    AriaRelevant: IE,
    AriaRowcount: LE,
    AriaRowindex: RE,
    AriaRowspan: zE,
    AriaSetsize: BE,
    AriaValuemax: VE,
    AriaValuemin: HE,
    AriaValuenow: UE,
    AriaValuetext: WE,
    Attribute: GE,
    DataAttribute: KE,
    Style: qE,
    InnerHTML: JE,
    ViewBox: YE,
    Xmlns: XE,
    Fill: ZE,
    FillRule: QE,
    ClipRule: $E,
    Stroke: eD,
    StrokeWidth: tD,
    StrokeLinecap: nD,
    StrokeLinejoin: rD,
    D: iD,
    Cx: aD,
    Cy: oD,
    R: sD,
    X: cD,
    Y: lD,
    Width: uD,
    Height: dD,
    X1: fD,
    Y1: pD,
    X2: mD,
    Y2: hD,
    Points: gD,
    Transform: _D,
    Opacity: vD,
    StrokeDasharray: yD,
    StrokeDashoffset: bD,
    Dx: xD,
    Dy: SD,
    Rotate: CD,
    TextAnchor: wD,
    DominantBaseline: TD,
    AlignmentBaseline: ED,
    BaselineShift: DD,
    TextLength: OD,
    LengthAdjust: kD,
    FontFamily: AD,
    FontSize: jD,
    FontWeight: MD,
    FontStyle: ND,
    LetterSpacing: PD,
    WordSpacing: FD,
    TextDecoration: ID,
    WritingMode: LD,
    Rx: RD,
    Ry: zD,
    PathLength: BD,
    FillOpacity: VD,
    StrokeOpacity: HD,
    StrokeMiterlimit: UD,
    PaintOrder: WD,
    VectorEffect: GD,
    Color: KD,
    Visibility: qD,
    Display: JD,
    Overflow: YD,
    PointerEvents: XD,
    Cursor: ZD,
    ShapeRendering: QD,
    TextRendering: $D,
    ImageRendering: eO,
    ClipPath: tO,
    Mask: nO,
    Filter: rO,
    ClipPathUnits: iO,
    MaskUnits: aO,
    MaskContentUnits: oO,
    FilterUnits: sO,
    PrimitiveUnits: cO,
    Offset: lO,
    StopColor: uO,
    StopOpacity: dO,
    GradientUnits: fO,
    GradientTransform: pO,
    SpreadMethod: mO,
    Fx: hO,
    Fy: gO,
    Fr: _O,
    PatternUnits: vO,
    PatternContentUnits: yO,
    PatternTransform: bO,
    MarkerStart: xO,
    MarkerMid: SO,
    MarkerEnd: CO,
    MarkerWidth: wO,
    MarkerHeight: TO,
    MarkerUnits: EO,
    RefX: DO,
    RefY: OO,
    Orient: kO,
    PreserveAspectRatio: AO,
    Prop: jO,
    OnCustomEvent: MO,
    OnMount: NO,
    OnUnmount: PO,
  } = hu(),
  FO = (e, t, n) => {
    e.data[t] = n
  },
  IO = (e, t) => {
    e.data[Rb] = (e.data[Rb] ?? 0) | t
  },
  LO = (e, t, n, r) => {
    ;((e.data[t] = n), IO(e, r))
  },
  Y = (e, t, n) => {
    let r = (e.data.props ??= {})
    ;((r[t] = n), IO(e, zb.Props))
  },
  X = (e, t, n) => {
    let r = (e.data.attrs ??= {})
    ;((r[t] = n), IO(e, zb.Attrs))
  },
  Z = (e, t, n) => {
    let r = (e.data.on ??= {})
    IO(e, zb.On)
    let i = r[t]
    if (i === void 0) r[t] = n
    else {
      let e = i
      r[t] = (...t) => {
        ;(e(...t), n(...t))
      }
    }
  },
  Q = (e, t) => {
    if ((IO(e, zb.On), e.data.on === void 0)) {
      e.data.on = t
      return
    }
    let n = e.data.on
    for (let e of Object.keys(t)) {
      let r = n[e],
        i = t[e]
      r === void 0
        ? (n[e] = i)
        : (n[e] = (...e) => {
            ;(r(...e), i(...e))
          })
    }
  },
  RO = (e, t, n) => {
    ;(Y(e, t, n),
      e.getPostpatchProps().push({
        propName: t,
        value: n,
      }))
  },
  zO = 1e4,
  BO = /* @__PURE__ */ new Map(),
  VO = e => {
    let t = BO.get(e)
    if (t !== void 0) return t
    let n = {}
    for (let t of e.split(/\s+/)) t !== '' && (n[t] = !0)
    return (BO.size >= zO && BO.clear(), BO.set(e, n), n)
  },
  HO = {
    Key: ({ value: e }, t) => FO(t, 'key', e),
    Class: ({ value: e }, t) => LO(t, 'class', VO(e), zb.Class),
    Id: ({ value: e }, t) => Y(t, 'id', e),
    Title: ({ value: e }, t) => Y(t, 'title', e),
    Lang: ({ value: e }, t) => Y(t, 'lang', e),
    Dir: ({ value: e }, t) => Y(t, 'dir', e),
    Tabindex: ({ value: e }, t) => Y(t, 'tabIndex', e),
    Hidden: ({ value: e }, t) => Y(t, 'hidden', e),
    Contenteditable: ({ value: e }, t) => X(t, 'contenteditable', e),
    Draggable: ({ value: e }, t) => Y(t, 'draggable', e),
    Accesskey: ({ value: e }, t) => X(t, 'accesskey', e),
    Translate: ({ value: e }, t) => X(t, 'translate', e),
    Inert: ({ value: e }, t) => Y(t, 'inert', e),
    Popover: ({ value: e }, t) => X(t, 'popover', e),
    Popovertarget: ({ value: e }, t) => X(t, 'popovertarget', e),
    Popovertargetaction: ({ value: e }, t) => X(t, 'popovertargetaction', e),
    OnClick: ({ message: e }, t) => Z(t, 'click', () => t.dispatch(e)),
    OnClickFocus: ({ focusSelector: e, message: t }, n) =>
      Q(n, {
        click: () => {
          let r = document.querySelector(e)
          ;(r instanceof HTMLElement && r.focus(), n.dispatch(t))
        },
      }),
    OnDoubleClick: ({ message: e }, t) => Z(t, 'dblclick', () => t.dispatch(e)),
    OnMouseDown: ({ message: e }, t) => Z(t, 'mousedown', () => t.dispatch(e)),
    OnMouseUp: ({ message: e }, t) => Z(t, 'mouseup', () => t.dispatch(e)),
    OnMouseEnter: ({ message: e }, t) =>
      Z(t, 'mouseenter', () => t.dispatch(e)),
    OnMouseLeave: ({ message: e }, t) =>
      Z(t, 'mouseleave', () => t.dispatch(e)),
    OnMouseOver: ({ message: e }, t) => Z(t, 'mouseover', () => t.dispatch(e)),
    OnMouseOut: ({ message: e }, t) => Z(t, 'mouseout', () => t.dispatch(e)),
    OnMouseMove: ({ message: e }, t) => Z(t, 'mousemove', () => t.dispatch(e)),
    OnPointerMove: ({ f: e }, t) =>
      Q(t, {
        pointermove: n => {
          let r = e(n.screenX, n.screenY, n.pointerType)
          j(r) && t.dispatch(r.value)
        },
      }),
    OnPointerLeave: ({ f: e }, t) =>
      Q(t, {
        pointerleave: n => {
          let r = e(n.pointerType)
          j(r) && t.dispatch(r.value)
        },
      }),
    OnPointerDown: ({ f: e }, t) =>
      Q(t, {
        pointerdown: n => {
          let r = e(
            n.pointerType,
            n.button,
            n.screenX,
            n.screenY,
            n.timeStamp,
            n.clientX,
            n.clientY,
          )
          j(r) && t.dispatch(r.value)
        },
      }),
    OnPointerUp: ({ f: e }, t) =>
      Q(t, {
        pointerup: n => {
          let r = e(n.screenX, n.screenY, n.pointerType, n.timeStamp)
          j(r) && t.dispatch(r.value)
        },
      }),
    OnKeyDown: ({ f: e }, t) =>
      Q(t, { keydown: n => t.dispatch(e(n.key, WS(n))) }),
    OnKeyDownPreventDefault: ({ f: e }, t) =>
      Q(t, {
        keydown: n => {
          let r = e(n.key, WS(n))
          j(r) && (n.preventDefault(), t.dispatch(r.value))
        },
      }),
    OnKeyDownFocus: ({ f: e }, t) =>
      Q(t, {
        keydown: n => {
          let r = e(n.key, WS(n))
          if (j(r)) {
            n.preventDefault()
            let { focusSelector: e, message: i } = r.value,
              a = document.querySelector(e)
            ;(a instanceof HTMLElement && a.focus(), t.dispatch(i))
          }
        },
      }),
    OnKeyUp: ({ f: e }, t) => Q(t, { keyup: n => t.dispatch(e(n.key, WS(n))) }),
    OnKeyUpPreventDefault: ({ f: e }, t) =>
      Q(t, {
        keyup: n => {
          let r = e(n.key, WS(n))
          j(r) && (n.preventDefault(), t.dispatch(r.value))
        },
      }),
    OnKeyPress: ({ f: e }, t) =>
      Q(t, { keypress: n => t.dispatch(e(n.key, WS(n))) }),
    OnFocus: ({ message: e }, t) => Z(t, 'focus', () => t.dispatch(e)),
    OnBlur: ({ message: e }, t) =>
      Q(t, {
        blur: n => {
          ;(n.relatedTarget instanceof Element &&
            n.relatedTarget.id === 'foldkit-devtools') ||
            t.dispatch(e)
        },
      }),
    OnInput: ({ f: e }, t) =>
      Q(t, { input: n => t.dispatch(e(n.target.value)) }),
    OnChange: ({ f: e }, t) =>
      Q(t, { change: n => t.dispatch(e(n.target.value)) }),
    OnFileChange: ({ f: e }, t) =>
      Q(t, {
        change: US(n => {
          let r = n.target,
            i = r.files ? ar(r.files) : jr()
          ;((r.value = ''), t.dispatch(e(i)))
        }, 'OnFileChange'),
      }),
    OnSubmit: ({ message: e }, t) =>
      Q(t, {
        submit: n => {
          ;(n.preventDefault(), t.dispatch(e))
        },
      }),
    OnReset: ({ message: e }, t) => Z(t, 'reset', () => t.dispatch(e)),
    OnScroll: ({ f: e }, t) =>
      Q(t, { scroll: n => t.dispatch(e(n.target.scrollTop)) }),
    OnWheel: ({ message: e }, t) => Z(t, 'wheel', () => t.dispatch(e)),
    OnCopy: ({ message: e }, t) => Z(t, 'copy', () => t.dispatch(e)),
    OnCut: ({ message: e }, t) => Z(t, 'cut', () => t.dispatch(e)),
    OnPaste: ({ message: e }, t) => Z(t, 'paste', () => t.dispatch(e)),
    OnPastePreventDefault: ({ f: e }, t) =>
      Q(t, {
        paste: n => {
          let r = e(n.clipboardData?.getData('text/plain') ?? '')
          j(r) && (n.preventDefault(), t.dispatch(r.value))
        },
      }),
    OnCopyText: ({ text: e }, t) =>
      Q(t, {
        copy: t => {
          t.clipboardData &&
            (t.clipboardData.setData('text/plain', e), t.preventDefault())
        },
      }),
    OnCutText: ({ text: e, message: t }, n) =>
      Q(n, {
        cut: r => {
          r.clipboardData &&
            (r.clipboardData.setData('text/plain', e),
            r.preventDefault(),
            n.dispatch(t))
        },
      }),
    OnCancel: ({ message: e }, t) =>
      Q(t, {
        cancel: n => {
          ;(n.preventDefault(), t.dispatch(e))
        },
      }),
    OnToggle: ({ f: e }, t) =>
      Q(t, { toggle: n => t.dispatch(e(n.target.open)) }),
    OnContextMenu: ({ message: e }, t) =>
      Q(t, {
        contextmenu: n => {
          ;(n.preventDefault(), t.dispatch(e))
        },
      }),
    OnDragStart: ({ message: e }, t) => Z(t, 'dragstart', () => t.dispatch(e)),
    OnDrag: ({ message: e }, t) => Z(t, 'drag', () => t.dispatch(e)),
    OnDragEnd: ({ message: e }, t) => Z(t, 'dragend', () => t.dispatch(e)),
    OnDragEnter: ({ message: e }, t) =>
      Q(t, {
        dragenter: n => {
          n.preventDefault()
          let r = n.currentTarget
          if (!(r instanceof Element)) {
            t.dispatch(e)
            return
          }
          SS(bS(r), r, n.target) && t.dispatch(e)
        },
      }),
    OnDragLeave: ({ message: e }, t) =>
      Q(t, {
        dragleave: n => {
          let r = n.currentTarget
          if (!(r instanceof Element)) {
            t.dispatch(e)
            return
          }
          let i = bS(r)
          CS(i, r, n.target) === 'schedule' &&
            queueMicrotask(() => {
              wS(i) && t.dispatch(e)
            })
        },
      }),
    OnDragOver: ({ message: e }, t) =>
      Q(t, {
        dragover: n => {
          ;(n.preventDefault(), t.dispatch(e))
        },
      }),
    AllowDrop: (e, t) =>
      Q(t, {
        dragover: e => {
          e.preventDefault()
        },
      }),
    OnDrop: ({ message: e }, t) =>
      Q(t, {
        drop: n => {
          n.preventDefault()
          let r = n.currentTarget
          ;(r instanceof Element && TS(r), t.dispatch(e))
        },
      }),
    OnDropFiles: ({ f: e }, t) =>
      Q(t, {
        drop: US(n => {
          n.preventDefault()
          let r = n,
            i = r.currentTarget
          i instanceof Element && TS(i)
          let a = r.dataTransfer?.files ? ar(r.dataTransfer.files) : jr()
          t.dispatch(e(a))
        }, 'OnDropFiles'),
      }),
    OnTouchStart: ({ message: e }, t) =>
      Z(t, 'touchstart', () => t.dispatch(e)),
    OnTouchEnd: ({ message: e }, t) => Z(t, 'touchend', () => t.dispatch(e)),
    OnTouchMove: ({ message: e }, t) => Z(t, 'touchmove', () => t.dispatch(e)),
    OnTouchCancel: ({ message: e }, t) =>
      Z(t, 'touchcancel', () => t.dispatch(e)),
    OnAnimationStart: ({ message: e }, t) =>
      Z(t, 'animationstart', () => t.dispatch(e)),
    OnAnimationEnd: ({ message: e }, t) =>
      Z(t, 'animationend', () => t.dispatch(e)),
    OnAnimationIteration: ({ message: e }, t) =>
      Z(t, 'animationiteration', () => t.dispatch(e)),
    OnTransitionEnd: ({ message: e }, t) =>
      Z(t, 'transitionend', () => t.dispatch(e)),
    OnLoad: ({ message: e }, t) => Z(t, 'load', () => t.dispatch(e)),
    OnError: ({ message: e }, t) => Z(t, 'error', () => t.dispatch(e)),
    OnPlay: ({ message: e }, t) => Z(t, 'play', () => t.dispatch(e)),
    OnPause: ({ message: e }, t) => Z(t, 'pause', () => t.dispatch(e)),
    OnEnded: ({ message: e }, t) => Z(t, 'ended', () => t.dispatch(e)),
    OnTimeUpdate: ({ message: e }, t) =>
      Z(t, 'timeupdate', () => t.dispatch(e)),
    OnVolumeChange: ({ message: e }, t) =>
      Z(t, 'volumechange', () => t.dispatch(e)),
    OnSelect: ({ message: e }, t) => Z(t, 'select', () => t.dispatch(e)),
    Value: ({ value: e }, t) => RO(t, 'value', e),
    Checked: ({ value: e }, t) => RO(t, 'checked', e),
    Selected: ({ value: e }, t) => RO(t, 'selected', e),
    Open: ({ value: e }, t) => RO(t, 'open', e),
    Placeholder: ({ value: e }, t) => Y(t, 'placeholder', e),
    Name: ({ value: e }, t) => Y(t, 'name', e),
    Disabled: ({ value: e }, t) => Y(t, 'disabled', e),
    Readonly: ({ value: e }, t) => Y(t, 'readOnly', e),
    Required: ({ value: e }, t) => Y(t, 'required', e),
    Autofocus: ({ value: e }, t) => Y(t, 'autofocus', e),
    Spellcheck: ({ value: e }, t) => X(t, 'spellcheck', e.toString()),
    Autocorrect: ({ value: e }, t) => X(t, 'autocorrect', e),
    Autocapitalize: ({ value: e }, t) => X(t, 'autocapitalize', e),
    InputMode: ({ value: e }, t) => X(t, 'inputmode', e),
    EnterKeyHint: ({ value: e }, t) => X(t, 'enterkeyhint', e),
    Multiple: ({ value: e }, t) => Y(t, 'multiple', e),
    Type: ({ value: e }, t) => Y(t, 'type', e),
    Accept: ({ value: e }, t) => Y(t, 'accept', e),
    Autocomplete: ({ value: e }, t) => Y(t, 'autocomplete', e),
    Pattern: ({ value: e }, t) => Y(t, 'pattern', e),
    Maxlength: ({ value: e }, t) => Y(t, 'maxLength', e),
    Minlength: ({ value: e }, t) => Y(t, 'minLength', e),
    Size: ({ value: e }, t) => Y(t, 'size', e),
    Cols: ({ value: e }, t) => Y(t, 'cols', e),
    Rows: ({ value: e }, t) => Y(t, 'rows', e),
    Max: ({ value: e }, t) => Y(t, 'max', e),
    Min: ({ value: e }, t) => Y(t, 'min', e),
    Step: ({ value: e }, t) => Y(t, 'step', e),
    For: ({ value: e }, t) => Y(t, 'htmlFor', e),
    Href: ({ value: e }, t) => Y(t, 'href', e),
    Src: ({ value: e }, t) => Y(t, 'src', e),
    Alt: ({ value: e }, t) => Y(t, 'alt', e),
    Target: ({ value: e }, t) => Y(t, 'target', e),
    Rel: ({ value: e }, t) => Y(t, 'rel', e),
    Download: ({ value: e }, t) => Y(t, 'download', e),
    Action: ({ value: e }, t) => Y(t, 'action', e),
    Method: ({ value: e }, t) => Y(t, 'method', e),
    Enctype: ({ value: e }, t) => Y(t, 'enctype', e),
    Novalidate: ({ value: e }, t) => Y(t, 'noValidate', e),
    Formaction: ({ value: e }, t) => Y(t, 'formAction', e),
    Formmethod: ({ value: e }, t) => Y(t, 'formMethod', e),
    Formnovalidate: ({ value: e }, t) => Y(t, 'formNoValidate', e),
    Formtarget: ({ value: e }, t) => Y(t, 'formTarget', e),
    Formenctype: ({ value: e }, t) => Y(t, 'formEnctype', e),
    Colspan: ({ value: e }, t) => Y(t, 'colSpan', e),
    Rowspan: ({ value: e }, t) => Y(t, 'rowSpan', e),
    Scope: ({ value: e }, t) => X(t, 'scope', e),
    Headers: ({ value: e }, t) => X(t, 'headers', e),
    Span: ({ value: e }, t) => Y(t, 'span', e),
    Start: ({ value: e }, t) => Y(t, 'start', e),
    Reversed: ({ value: e }, t) => Y(t, 'reversed', e),
    CiteAttr: ({ value: e }, t) => Y(t, 'cite', e),
    Datetime: ({ value: e }, t) => Y(t, 'dateTime', e),
    Wrap: ({ value: e }, t) => Y(t, 'wrap', e),
    List: ({ value: e }, t) => X(t, 'list', e),
    FormAttr: ({ value: e }, t) => X(t, 'form', e),
    LabelAttr: ({ value: e }, t) => Y(t, 'label', e),
    ContentAttr: ({ value: e }, t) => X(t, 'content', e),
    Charset: ({ value: e }, t) => X(t, 'charset', e),
    HttpEquiv: ({ value: e }, t) => X(t, 'http-equiv', e),
    Srcset: ({ value: e }, t) => X(t, 'srcset', e),
    Sizes: ({ value: e }, t) => X(t, 'sizes', e),
    Loading: ({ value: e }, t) => X(t, 'loading', e),
    Decoding: ({ value: e }, t) => X(t, 'decoding', e),
    Fetchpriority: ({ value: e }, t) => X(t, 'fetchpriority', e),
    Crossorigin: ({ value: e }, t) => X(t, 'crossorigin', e),
    Referrerpolicy: ({ value: e }, t) => X(t, 'referrerpolicy', e),
    Integrity: ({ value: e }, t) => X(t, 'integrity', e),
    Hreflang: ({ value: e }, t) => X(t, 'hreflang', e),
    Ping: ({ value: e }, t) => X(t, 'ping', e),
    Sandbox: ({ value: e }, t) => X(t, 'sandbox', e),
    Allow: ({ value: e }, t) => X(t, 'allow', e),
    Srcdoc: ({ value: e }, t) => X(t, 'srcdoc', e),
    Autoplay: ({ value: e }, t) => Y(t, 'autoplay', e),
    Controls: ({ value: e }, t) => Y(t, 'controls', e),
    Loop: ({ value: e }, t) => Y(t, 'loop', e),
    Muted: ({ value: e }, t) => RO(t, 'muted', e),
    Poster: ({ value: e }, t) => Y(t, 'poster', e),
    Preload: ({ value: e }, t) => Y(t, 'preload', e),
    Playsinline: ({ value: e }, t) => Y(t, 'playsInline', e),
    High: ({ value: e }, t) => Y(t, 'high', e),
    Low: ({ value: e }, t) => Y(t, 'low', e),
    Optimum: ({ value: e }, t) => Y(t, 'optimum', e),
    Usemap: ({ value: e }, t) => X(t, 'usemap', e),
    Ismap: ({ value: e }, t) => Y(t, 'isMap', e),
    Role: ({ value: e }, t) => X(t, 'role', e),
    AriaLabel: ({ value: e }, t) => X(t, 'aria-label', e),
    AriaLabelledBy: ({ value: e }, t) => X(t, 'aria-labelledby', e),
    AriaDescribedBy: ({ value: e }, t) => X(t, 'aria-describedby', e),
    AriaHidden: ({ value: e }, t) => X(t, 'aria-hidden', e.toString()),
    AriaExpanded: ({ value: e }, t) => X(t, 'aria-expanded', e.toString()),
    AriaSelected: ({ value: e }, t) => X(t, 'aria-selected', e.toString()),
    AriaChecked: ({ value: e }, t) => X(t, 'aria-checked', e.toString()),
    AriaDisabled: ({ value: e }, t) => X(t, 'aria-disabled', e.toString()),
    AriaRequired: ({ value: e }, t) => X(t, 'aria-required', e.toString()),
    AriaInvalid: ({ value: e }, t) => X(t, 'aria-invalid', e.toString()),
    AriaLive: ({ value: e }, t) => X(t, 'aria-live', e),
    AriaControls: ({ value: e }, t) => X(t, 'aria-controls', e),
    AriaCurrent: ({ value: e }, t) => X(t, 'aria-current', e),
    AriaOrientation: ({ value: e }, t) => X(t, 'aria-orientation', e),
    AriaPressed: ({ value: e }, t) => X(t, 'aria-pressed', e),
    AriaHasPopup: ({ value: e }, t) => X(t, 'aria-haspopup', e),
    AriaActiveDescendant: ({ value: e }, t) => X(t, 'aria-activedescendant', e),
    AriaSort: ({ value: e }, t) => X(t, 'aria-sort', e),
    AriaMultiSelectable: ({ value: e }, t) =>
      X(t, 'aria-multiselectable', e.toString()),
    AriaModal: ({ value: e }, t) => X(t, 'aria-modal', e.toString()),
    AriaBusy: ({ value: e }, t) => X(t, 'aria-busy', e.toString()),
    AriaErrorMessage: ({ value: e }, t) => X(t, 'aria-errormessage', e),
    AriaRoleDescription: ({ value: e }, t) => X(t, 'aria-roledescription', e),
    AriaAtomic: ({ value: e }, t) => X(t, 'aria-atomic', e.toString()),
    AriaAutocomplete: ({ value: e }, t) => X(t, 'aria-autocomplete', e),
    AriaColcount: ({ value: e }, t) => X(t, 'aria-colcount', e.toString()),
    AriaColindex: ({ value: e }, t) => X(t, 'aria-colindex', e.toString()),
    AriaColspan: ({ value: e }, t) => X(t, 'aria-colspan', e.toString()),
    AriaDescription: ({ value: e }, t) => X(t, 'aria-description', e),
    AriaDetails: ({ value: e }, t) => X(t, 'aria-details', e),
    AriaFlowto: ({ value: e }, t) => X(t, 'aria-flowto', e),
    AriaKeyshortcuts: ({ value: e }, t) => X(t, 'aria-keyshortcuts', e),
    AriaLevel: ({ value: e }, t) => X(t, 'aria-level', e.toString()),
    AriaOwns: ({ value: e }, t) => X(t, 'aria-owns', e),
    AriaPlaceholder: ({ value: e }, t) => X(t, 'aria-placeholder', e),
    AriaPosinset: ({ value: e }, t) => X(t, 'aria-posinset', e.toString()),
    AriaReadonly: ({ value: e }, t) => X(t, 'aria-readonly', e.toString()),
    AriaRelevant: ({ value: e }, t) => X(t, 'aria-relevant', e),
    AriaRowcount: ({ value: e }, t) => X(t, 'aria-rowcount', e.toString()),
    AriaRowindex: ({ value: e }, t) => X(t, 'aria-rowindex', e.toString()),
    AriaRowspan: ({ value: e }, t) => X(t, 'aria-rowspan', e.toString()),
    AriaSetsize: ({ value: e }, t) => X(t, 'aria-setsize', e.toString()),
    AriaValuemax: ({ value: e }, t) => X(t, 'aria-valuemax', e.toString()),
    AriaValuemin: ({ value: e }, t) => X(t, 'aria-valuemin', e.toString()),
    AriaValuenow: ({ value: e }, t) => X(t, 'aria-valuenow', e.toString()),
    AriaValuetext: ({ value: e }, t) => X(t, 'aria-valuetext', e),
    Attribute: ({ key: e, value: t }, n) => X(n, e, t),
    DataAttribute: ({ key: e, value: t }, n) => X(n, `data-${e}`, t),
    Style: ({ value: e }, t) => LO(t, 'style', e, zb.Style),
    InnerHTML: ({ value: e }, t) => Y(t, 'innerHTML', e),
    ViewBox: ({ value: e }, t) => X(t, 'viewBox', e),
    Xmlns: ({ value: e }, t) => X(t, 'xmlns', e),
    Fill: ({ value: e }, t) => X(t, 'fill', e),
    FillRule: ({ value: e }, t) => X(t, 'fill-rule', e),
    ClipRule: ({ value: e }, t) => X(t, 'clip-rule', e),
    Stroke: ({ value: e }, t) => X(t, 'stroke', e),
    StrokeWidth: ({ value: e }, t) => X(t, 'stroke-width', e),
    StrokeLinecap: ({ value: e }, t) => X(t, 'stroke-linecap', e),
    StrokeLinejoin: ({ value: e }, t) => X(t, 'stroke-linejoin', e),
    D: ({ value: e }, t) => X(t, 'd', e),
    Cx: ({ value: e }, t) => X(t, 'cx', e),
    Cy: ({ value: e }, t) => X(t, 'cy', e),
    R: ({ value: e }, t) => X(t, 'r', e),
    X: ({ value: e }, t) => X(t, 'x', e),
    Y: ({ value: e }, t) => X(t, 'y', e),
    Width: ({ value: e }, t) => X(t, 'width', e),
    Height: ({ value: e }, t) => X(t, 'height', e),
    X1: ({ value: e }, t) => X(t, 'x1', e),
    Y1: ({ value: e }, t) => X(t, 'y1', e),
    X2: ({ value: e }, t) => X(t, 'x2', e),
    Y2: ({ value: e }, t) => X(t, 'y2', e),
    Points: ({ value: e }, t) => X(t, 'points', e),
    Transform: ({ value: e }, t) => X(t, 'transform', e),
    Opacity: ({ value: e }, t) => X(t, 'opacity', e),
    StrokeDasharray: ({ value: e }, t) => X(t, 'stroke-dasharray', e),
    StrokeDashoffset: ({ value: e }, t) => X(t, 'stroke-dashoffset', e),
    Dx: ({ value: e }, t) => X(t, 'dx', e),
    Dy: ({ value: e }, t) => X(t, 'dy', e),
    Rotate: ({ value: e }, t) => X(t, 'rotate', e),
    TextAnchor: ({ value: e }, t) => X(t, 'text-anchor', e),
    DominantBaseline: ({ value: e }, t) => X(t, 'dominant-baseline', e),
    AlignmentBaseline: ({ value: e }, t) => X(t, 'alignment-baseline', e),
    BaselineShift: ({ value: e }, t) => X(t, 'baseline-shift', e),
    TextLength: ({ value: e }, t) => X(t, 'textLength', e),
    LengthAdjust: ({ value: e }, t) => X(t, 'lengthAdjust', e),
    FontFamily: ({ value: e }, t) => X(t, 'font-family', e),
    FontSize: ({ value: e }, t) => X(t, 'font-size', e),
    FontWeight: ({ value: e }, t) => X(t, 'font-weight', e),
    FontStyle: ({ value: e }, t) => X(t, 'font-style', e),
    LetterSpacing: ({ value: e }, t) => X(t, 'letter-spacing', e),
    WordSpacing: ({ value: e }, t) => X(t, 'word-spacing', e),
    TextDecoration: ({ value: e }, t) => X(t, 'text-decoration', e),
    WritingMode: ({ value: e }, t) => X(t, 'writing-mode', e),
    Rx: ({ value: e }, t) => X(t, 'rx', e),
    Ry: ({ value: e }, t) => X(t, 'ry', e),
    PathLength: ({ value: e }, t) => X(t, 'pathLength', e),
    FillOpacity: ({ value: e }, t) => X(t, 'fill-opacity', e),
    StrokeOpacity: ({ value: e }, t) => X(t, 'stroke-opacity', e),
    StrokeMiterlimit: ({ value: e }, t) => X(t, 'stroke-miterlimit', e),
    PaintOrder: ({ value: e }, t) => X(t, 'paint-order', e),
    VectorEffect: ({ value: e }, t) => X(t, 'vector-effect', e),
    Color: ({ value: e }, t) => X(t, 'color', e),
    Visibility: ({ value: e }, t) => X(t, 'visibility', e),
    Display: ({ value: e }, t) => X(t, 'display', e),
    Overflow: ({ value: e }, t) => X(t, 'overflow', e),
    PointerEvents: ({ value: e }, t) => X(t, 'pointer-events', e),
    Cursor: ({ value: e }, t) => X(t, 'cursor', e),
    ShapeRendering: ({ value: e }, t) => X(t, 'shape-rendering', e),
    TextRendering: ({ value: e }, t) => X(t, 'text-rendering', e),
    ImageRendering: ({ value: e }, t) => X(t, 'image-rendering', e),
    ClipPath: ({ value: e }, t) => X(t, 'clip-path', e),
    Mask: ({ value: e }, t) => X(t, 'mask', e),
    Filter: ({ value: e }, t) => X(t, 'filter', e),
    ClipPathUnits: ({ value: e }, t) => X(t, 'clipPathUnits', e),
    MaskUnits: ({ value: e }, t) => X(t, 'maskUnits', e),
    MaskContentUnits: ({ value: e }, t) => X(t, 'maskContentUnits', e),
    FilterUnits: ({ value: e }, t) => X(t, 'filterUnits', e),
    PrimitiveUnits: ({ value: e }, t) => X(t, 'primitiveUnits', e),
    Offset: ({ value: e }, t) => X(t, 'offset', e),
    StopColor: ({ value: e }, t) => X(t, 'stop-color', e),
    StopOpacity: ({ value: e }, t) => X(t, 'stop-opacity', e),
    GradientUnits: ({ value: e }, t) => X(t, 'gradientUnits', e),
    GradientTransform: ({ value: e }, t) => X(t, 'gradientTransform', e),
    SpreadMethod: ({ value: e }, t) => X(t, 'spreadMethod', e),
    Fx: ({ value: e }, t) => X(t, 'fx', e),
    Fy: ({ value: e }, t) => X(t, 'fy', e),
    Fr: ({ value: e }, t) => X(t, 'fr', e),
    PatternUnits: ({ value: e }, t) => X(t, 'patternUnits', e),
    PatternContentUnits: ({ value: e }, t) => X(t, 'patternContentUnits', e),
    PatternTransform: ({ value: e }, t) => X(t, 'patternTransform', e),
    MarkerStart: ({ value: e }, t) => X(t, 'marker-start', e),
    MarkerMid: ({ value: e }, t) => X(t, 'marker-mid', e),
    MarkerEnd: ({ value: e }, t) => X(t, 'marker-end', e),
    MarkerWidth: ({ value: e }, t) => X(t, 'markerWidth', e),
    MarkerHeight: ({ value: e }, t) => X(t, 'markerHeight', e),
    MarkerUnits: ({ value: e }, t) => X(t, 'markerUnits', e),
    RefX: ({ value: e }, t) => X(t, 'refX', e),
    RefY: ({ value: e }, t) => X(t, 'refY', e),
    Orient: ({ value: e }, t) => X(t, 'orient', e),
    PreserveAspectRatio: ({ value: e }, t) => X(t, 'preserveAspectRatio', e),
    Prop: ({ key: e, value: t }, n) => Y(n, e, t),
    OnCustomEvent: ({ name: e, f: t }, n) =>
      Q(n, {
        [e]: e => {
          e instanceof CustomEvent && n.dispatch(t(e))
        },
      }),
    OnMount: ({ action: e }, t) => {
      let n = t.getCapturedContext(),
        r = Ai(n, Lb),
        i = j(r) ? () => r.value.started(e.name, e.args) : f,
        a = j(r) ? () => r.value.ended(e.name, e.args) : f,
        o =
          e.args === void 0
            ? { name: e.name }
            : {
                name: e.name,
                args: e.args,
              },
        s = t.boundaryMappers,
        c = fr(s)
          ? o
          : {
              ...o,
              messageMappers: s,
            }
      t.data[YS] = c
      let l = t.data.hook?.destroy
      t.data.hook = {
        ...t.data.hook,
        insert: r => {
          if (r.elm instanceof Element) {
            let a = r.elm
            i()
            let o = Nd(n)(
              eb(e.f(a), n =>
                R(() =>
                  t.dispatch(n, {
                    _tag: 'Mount',
                    name: e.name,
                  }),
                ),
              ).pipe(
                od(t =>
                  R(() => {
                    console.error(`[OnMount ${e.name}] unhandled failure`, t)
                  }),
                ),
              ),
            )
            GS.set(a, { fiber: o })
          }
        },
        destroy: e => {
          if ((l !== void 0 && l(e), e.elm instanceof Element)) {
            let t = GS.get(e.elm)
            t && (Md(Wm(t.fiber)), GS.delete(e.elm), a())
          }
        },
      }
    },
    OnUnmount: ({ message: e }, t) => {
      let n = t.resolveUnmount(e),
        r = t.data.hook?.destroy
      t.data.hook = {
        ...t.data.hook,
        destroy: e => {
          ;(r !== void 0 && r(e), KS || n())
        },
      }
    },
  },
  UO = (e, t) => {
    let n = HO[e._tag]
    n(e, t)
  },
  WO = () => {
    throw Error(
      'Foldkit: an event-bearing Html attribute fired without an active runtime frame. This typically means an Html element with event handlers (OnClick, OnInput, etc.) was constructed at module top level outside of a view function.',
    )
  },
  GO = () => () => {
    throw Error(
      'Foldkit: an OnUnmount attribute fired without an active runtime frame. This typically means an Html element with OnUnmount was constructed at module top level outside of a view function.',
    )
  },
  KO = () => {
    try {
      return fS()
    } catch {
      return WO
    }
  },
  qO = () => {
    try {
      return pS()
    } catch {
      return GO
    }
  },
  JO = () => {
    try {
      return hS()
    } catch {
      return yi()
    }
  },
  YO = (e, t) => {
    e.hook = {
      ...e.hook,
      postpatch: (e, n) => {
        n.elm &&
          Lr(t, ({ propName: e, value: t }) => {
            n.elm[e] !== t && (n.elm[e] = t)
          })
      },
    }
  },
  XO = e => {
    let t = { [Rb]: 0 }
    if (e.length === 0) return t
    let n,
      r,
      i,
      a = () => (i ??= [])
    for (let i of e)
      if (vS(i)) {
        r ??= /* @__PURE__ */ new Map()
        let e = r.get(i.dispatch)
        ;(e === void 0 &&
          ((e = {
            data: t,
            getPostpatchProps: a,
            dispatch: i.dispatch,
            resolveUnmount: i.resolveUnmount,
            boundaryMappers: i.boundaryMappers,
            getCapturedContext: JO,
          }),
          r.set(i.dispatch, e)),
          UO(i.attribute, e))
      } else
        (n === void 0 &&
          (n = {
            data: t,
            getPostpatchProps: a,
            dispatch: KO(),
            resolveUnmount: qO(),
            boundaryMappers: mS(),
            getCapturedContext: JO,
          }),
          UO(i, n))
    return (i !== void 0 && mr(i) && YO(t, i), t)
  },
  ZO = e => {
    let t = []
    for (let n = 0; n < e.length; n++) {
      let r = e[n]
      r != null && t.push(r)
    }
    return t
  },
  QO = (e, t = [], n = []) => cx(e, XO(t), ZO(n)),
  $O =
    () =>
    e =>
    (t = [], n = []) =>
      QO(e, t, n),
  ek =
    () =>
    e =>
    (t = []) =>
      QO(e, t, []),
  tk =
    () =>
    e =>
    (t, n = [], r = []) => {
      let i = XO(n)
      return ((i.key = t), cx(e, i, ZO(r)))
    },
  nk = () => {
    let e = $O(),
      t = ek()
    return {
      a: e('a'),
      abbr: e('abbr'),
      address: e('address'),
      area: t('area'),
      article: e('article'),
      aside: e('aside'),
      audio: e('audio'),
      b: e('b'),
      base: t('base'),
      bdi: e('bdi'),
      bdo: e('bdo'),
      blockquote: e('blockquote'),
      body: e('body'),
      br: t('br'),
      button: e('button'),
      canvas: e('canvas'),
      caption: e('caption'),
      cite: e('cite'),
      code: e('code'),
      col: t('col'),
      colgroup: e('colgroup'),
      data: e('data'),
      datalist: e('datalist'),
      dd: e('dd'),
      del: e('del'),
      details: e('details'),
      dfn: e('dfn'),
      dialog: e('dialog'),
      div: e('div'),
      dl: e('dl'),
      dt: e('dt'),
      em: e('em'),
      embed: t('embed'),
      fieldset: e('fieldset'),
      figcaption: e('figcaption'),
      figure: e('figure'),
      footer: e('footer'),
      form: e('form'),
      h1: e('h1'),
      h2: e('h2'),
      h3: e('h3'),
      h4: e('h4'),
      h5: e('h5'),
      h6: e('h6'),
      head: e('head'),
      header: e('header'),
      hgroup: e('hgroup'),
      hr: t('hr'),
      html: e('html'),
      i: e('i'),
      iframe: e('iframe'),
      img: t('img'),
      input: t('input'),
      ins: e('ins'),
      kbd: e('kbd'),
      label: e('label'),
      legend: e('legend'),
      li: e('li'),
      link: t('link'),
      main: e('main'),
      map: e('map'),
      mark: e('mark'),
      menu: e('menu'),
      meta: t('meta'),
      meter: e('meter'),
      nav: e('nav'),
      noscript: e('noscript'),
      object: e('object'),
      ol: e('ol'),
      optgroup: e('optgroup'),
      option: e('option'),
      output: e('output'),
      p: e('p'),
      picture: e('picture'),
      portal: e('portal'),
      pre: e('pre'),
      progress: e('progress'),
      q: e('q'),
      rp: e('rp'),
      rt: e('rt'),
      ruby: e('ruby'),
      s: e('s'),
      samp: e('samp'),
      script: e('script'),
      search: e('search'),
      section: e('section'),
      select: e('select'),
      slot: e('slot'),
      small: e('small'),
      source: t('source'),
      span: e('span'),
      strong: e('strong'),
      style: e('style'),
      sub: e('sub'),
      summary: e('summary'),
      sup: e('sup'),
      table: e('table'),
      tbody: e('tbody'),
      td: e('td'),
      template: e('template'),
      textarea: e('textarea'),
      tfoot: e('tfoot'),
      th: e('th'),
      thead: e('thead'),
      time: e('time'),
      title: e('title'),
      tr: e('tr'),
      track: t('track'),
      u: e('u'),
      ul: e('ul'),
      var: e('var'),
      video: e('video'),
      wbr: t('wbr'),
      svg: e('svg'),
      animate: e('animate'),
      animateMotion: e('animateMotion'),
      animateTransform: e('animateTransform'),
      circle: e('circle'),
      clipPath: e('clipPath'),
      defs: e('defs'),
      desc: e('desc'),
      ellipse: e('ellipse'),
      feBlend: e('feBlend'),
      feColorMatrix: e('feColorMatrix'),
      feComponentTransfer: e('feComponentTransfer'),
      feComposite: e('feComposite'),
      feConvolveMatrix: e('feConvolveMatrix'),
      feDiffuseLighting: e('feDiffuseLighting'),
      feDisplacementMap: e('feDisplacementMap'),
      feDistantLight: e('feDistantLight'),
      feDropShadow: e('feDropShadow'),
      feFlood: e('feFlood'),
      feFuncA: e('feFuncA'),
      feFuncB: e('feFuncB'),
      feFuncG: e('feFuncG'),
      feFuncR: e('feFuncR'),
      feGaussianBlur: e('feGaussianBlur'),
      feImage: e('feImage'),
      feMerge: e('feMerge'),
      feMergeNode: e('feMergeNode'),
      feMorphology: e('feMorphology'),
      feOffset: e('feOffset'),
      fePointLight: e('fePointLight'),
      feSpecularLighting: e('feSpecularLighting'),
      feSpotLight: e('feSpotLight'),
      feTile: e('feTile'),
      feTurbulence: e('feTurbulence'),
      filter: e('filter'),
      foreignObject: e('foreignObject'),
      g: e('g'),
      image: e('image'),
      line: e('line'),
      linearGradient: e('linearGradient'),
      marker: e('marker'),
      mask: e('mask'),
      metadata: e('metadata'),
      mpath: e('mpath'),
      path: e('path'),
      pattern: e('pattern'),
      polygon: e('polygon'),
      polyline: e('polyline'),
      radialGradient: e('radialGradient'),
      rect: e('rect'),
      set: e('set'),
      stop: e('stop'),
      switch: e('switch'),
      symbol: e('symbol'),
      text: e('text'),
      textPath: e('textPath'),
      tspan: e('tspan'),
      use: e('use'),
      view: e('view'),
      math: e('math'),
      annotation: e('annotation'),
      'annotation-xml': e('annotation-xml'),
      maction: e('maction'),
      menclose: e('menclose'),
      merror: e('merror'),
      mfenced: e('mfenced'),
      mfrac: e('mfrac'),
      mglyph: e('mglyph'),
      mi: e('mi'),
      mlabeledtr: e('mlabeledtr'),
      mlongdiv: e('mlongdiv'),
      mmultiscripts: e('mmultiscripts'),
      mn: e('mn'),
      mo: e('mo'),
      mover: e('mover'),
      mpadded: e('mpadded'),
      mphantom: e('mphantom'),
      mprescripts: e('mprescripts'),
      mroot: e('mroot'),
      mrow: e('mrow'),
      ms: e('ms'),
      mscarries: e('mscarries'),
      mscarry: e('mscarry'),
      msgroup: e('msgroup'),
      msline: e('msline'),
      mspace: e('mspace'),
      msqrt: e('msqrt'),
      msrow: e('msrow'),
      mstack: e('mstack'),
      mstyle: e('mstyle'),
      msub: e('msub'),
      msubsup: e('msubsup'),
      msup: e('msup'),
      mtable: e('mtable'),
      mtd: e('mtd'),
      mtext: e('mtext'),
      mtr: e('mtr'),
      munder: e('munder'),
      munderover: e('munderover'),
      semantics: e('semantics'),
    }
  },
  rk = () => ({
    Key: e => XS({ value: e }),
    Class: e => ZS({ value: e }),
    Id: e => QS({ value: e }),
    Title: e => $S({ value: e }),
    Lang: e => eC({ value: e }),
    Dir: e => tC({ value: e }),
    Tabindex: e => nC({ value: e }),
    Hidden: e => rC({ value: e }),
    Contenteditable: e => iC({ value: e }),
    Draggable: e => aC({ value: e }),
    Accesskey: e => oC({ value: e }),
    Translate: e => sC({ value: e }),
    Inert: e => cC({ value: e }),
    Popover: e => lC({ value: e }),
    Popovertarget: e => uC({ value: e }),
    Popovertargetaction: e => dC({ value: e }),
    OnClick: e => fC({ message: e }),
    OnClickFocus: (e, t) =>
      pC({
        focusSelector: e,
        message: t,
      }),
    OnDoubleClick: e => mC({ message: e }),
    OnMouseDown: e => hC({ message: e }),
    OnMouseUp: e => gC({ message: e }),
    OnMouseEnter: e => _C({ message: e }),
    OnMouseLeave: e => vC({ message: e }),
    OnMouseOver: e => yC({ message: e }),
    OnMouseOut: e => bC({ message: e }),
    OnMouseMove: e => xC({ message: e }),
    OnPointerMove: e => SC({ f: e }),
    OnPointerLeave: e => CC({ f: e }),
    OnPointerDown: e => wC({ f: e }),
    OnPointerUp: e => TC({ f: e }),
    OnKeyDown: e => EC({ f: e }),
    OnKeyDownPreventDefault: e => DC({ f: e }),
    OnKeyDownFocus: e => OC({ f: e }),
    OnKeyUp: e => kC({ f: e }),
    OnKeyUpPreventDefault: e => AC({ f: e }),
    OnKeyPress: e => jC({ f: e }),
    OnFocus: e => MC({ message: e }),
    OnBlur: e => NC({ message: e }),
    OnInput: e => PC({ f: e }),
    OnChange: e => FC({ f: e }),
    OnFileChange: e => IC({ f: e }),
    OnSubmit: e => LC({ message: e }),
    OnReset: e => RC({ message: e }),
    OnScroll: e => zC({ f: e }),
    OnWheel: e => BC({ message: e }),
    OnCopy: e => VC({ message: e }),
    OnCut: e => HC({ message: e }),
    OnPaste: e => UC({ message: e }),
    OnPastePreventDefault: e => WC({ f: e }),
    OnCopyText: e => GC({ text: e }),
    OnCutText: (e, t) =>
      KC({
        text: e,
        message: t,
      }),
    OnCancel: e => qC({ message: e }),
    OnToggle: e => JC({ f: e }),
    OnContextMenu: e => YC({ message: e }),
    OnDragStart: e => XC({ message: e }),
    OnDrag: e => ZC({ message: e }),
    OnDragEnd: e => QC({ message: e }),
    OnDragEnter: e => $C({ message: e }),
    OnDragLeave: e => ew({ message: e }),
    OnDragOver: e => tw({ message: e }),
    AllowDrop: () => nw(),
    OnDrop: e => rw({ message: e }),
    OnDropFiles: e => iw({ f: e }),
    OnTouchStart: e => aw({ message: e }),
    OnTouchEnd: e => ow({ message: e }),
    OnTouchMove: e => sw({ message: e }),
    OnTouchCancel: e => cw({ message: e }),
    OnAnimationStart: e => lw({ message: e }),
    OnAnimationEnd: e => uw({ message: e }),
    OnAnimationIteration: e => dw({ message: e }),
    OnTransitionEnd: e => fw({ message: e }),
    OnLoad: e => pw({ message: e }),
    OnError: e => mw({ message: e }),
    OnPlay: e => hw({ message: e }),
    OnPause: e => gw({ message: e }),
    OnEnded: e => _w({ message: e }),
    OnTimeUpdate: e => vw({ message: e }),
    OnVolumeChange: e => yw({ message: e }),
    OnSelect: e => bw({ message: e }),
    Value: e => xw({ value: e }),
    Checked: e => Sw({ value: e }),
    Selected: e => Cw({ value: e }),
    Open: e => ww({ value: e }),
    Placeholder: e => Tw({ value: e }),
    Name: e => Ew({ value: e }),
    Disabled: e => Dw({ value: e }),
    Readonly: e => Ow({ value: e }),
    Required: e => kw({ value: e }),
    Autofocus: e => Aw({ value: e }),
    Spellcheck: e => jw({ value: e }),
    Autocorrect: e => Mw({ value: e }),
    Autocapitalize: e => Nw({ value: e }),
    InputMode: e => Pw({ value: e }),
    EnterKeyHint: e => Fw({ value: e }),
    Multiple: e => Iw({ value: e }),
    Type: e => Lw({ value: e }),
    Accept: e => Rw({ value: e }),
    Autocomplete: e => zw({ value: e }),
    Pattern: e => Bw({ value: e }),
    Maxlength: e => Vw({ value: e }),
    Minlength: e => Hw({ value: e }),
    Size: e => Uw({ value: e }),
    Cols: e => Ww({ value: e }),
    Rows: e => Gw({ value: e }),
    Max: e => Kw({ value: e }),
    Min: e => qw({ value: e }),
    Step: e => Jw({ value: e }),
    For: e => Yw({ value: e }),
    Href: e => Xw({ value: e }),
    Src: e => Zw({ value: e }),
    Alt: e => Qw({ value: e }),
    Target: e => $w({ value: e }),
    Rel: e => eT({ value: e }),
    Download: e => tT({ value: e }),
    Action: e => nT({ value: e }),
    Method: e => rT({ value: e }),
    Enctype: e => iT({ value: e }),
    Novalidate: e => aT({ value: e }),
    Formaction: e => oT({ value: e }),
    Formmethod: e => sT({ value: e }),
    Formnovalidate: e => cT({ value: e }),
    Formtarget: e => lT({ value: e }),
    Formenctype: e => uT({ value: e }),
    Colspan: e => dT({ value: e }),
    Rowspan: e => fT({ value: e }),
    Scope: e => pT({ value: e }),
    Headers: e => mT({ value: e }),
    Span: e => hT({ value: e }),
    Start: e => gT({ value: e }),
    Reversed: e => _T({ value: e }),
    CiteAttr: e => vT({ value: e }),
    Datetime: e => yT({ value: e }),
    Wrap: e => bT({ value: e }),
    List: e => xT({ value: e }),
    FormAttr: e => ST({ value: e }),
    LabelAttr: e => CT({ value: e }),
    ContentAttr: e => wT({ value: e }),
    Charset: e => TT({ value: e }),
    HttpEquiv: e => ET({ value: e }),
    Srcset: e => DT({ value: e }),
    Sizes: e => OT({ value: e }),
    Loading: e => kT({ value: e }),
    Decoding: e => AT({ value: e }),
    Fetchpriority: e => jT({ value: e }),
    Crossorigin: e => MT({ value: e }),
    Referrerpolicy: e => NT({ value: e }),
    Integrity: e => PT({ value: e }),
    Hreflang: e => FT({ value: e }),
    Ping: e => IT({ value: e }),
    Sandbox: e => LT({ value: e }),
    Allow: e => RT({ value: e }),
    Srcdoc: e => zT({ value: e }),
    Autoplay: e => BT({ value: e }),
    Controls: e => VT({ value: e }),
    Loop: e => HT({ value: e }),
    Muted: e => UT({ value: e }),
    Poster: e => WT({ value: e }),
    Preload: e => GT({ value: e }),
    Playsinline: e => KT({ value: e }),
    High: e => qT({ value: e }),
    Low: e => JT({ value: e }),
    Optimum: e => YT({ value: e }),
    Usemap: e => XT({ value: e }),
    Ismap: e => ZT({ value: e }),
    Role: e => QT({ value: e }),
    AriaLabel: e => $T({ value: e }),
    AriaLabelledBy: e => eE({ value: e }),
    AriaDescribedBy: e => tE({ value: e }),
    AriaHidden: e => nE({ value: e }),
    AriaExpanded: e => rE({ value: e }),
    AriaSelected: e => iE({ value: e }),
    AriaChecked: e => aE({ value: e }),
    AriaDisabled: e => oE({ value: e }),
    AriaRequired: e => sE({ value: e }),
    AriaInvalid: e => cE({ value: e }),
    AriaLive: e => lE({ value: e }),
    AriaControls: e => uE({ value: e }),
    AriaCurrent: e => dE({ value: e }),
    AriaOrientation: e => fE({ value: e }),
    AriaPressed: e => pE({ value: e }),
    AriaHasPopup: e => mE({ value: e }),
    AriaActiveDescendant: e => hE({ value: e }),
    AriaSort: e => gE({ value: e }),
    AriaMultiSelectable: e => _E({ value: e }),
    AriaModal: e => vE({ value: e }),
    AriaBusy: e => yE({ value: e }),
    AriaErrorMessage: e => bE({ value: e }),
    AriaRoleDescription: e => xE({ value: e }),
    AriaAtomic: e => SE({ value: e }),
    AriaAutocomplete: e => CE({ value: e }),
    AriaColcount: e => wE({ value: e }),
    AriaColindex: e => TE({ value: e }),
    AriaColspan: e => EE({ value: e }),
    AriaDescription: e => DE({ value: e }),
    AriaDetails: e => OE({ value: e }),
    AriaFlowto: e => kE({ value: e }),
    AriaKeyshortcuts: e => AE({ value: e }),
    AriaLevel: e => jE({ value: e }),
    AriaOwns: e => ME({ value: e }),
    AriaPlaceholder: e => NE({ value: e }),
    AriaPosinset: e => PE({ value: e }),
    AriaReadonly: e => FE({ value: e }),
    AriaRelevant: e => IE({ value: e }),
    AriaRowcount: e => LE({ value: e }),
    AriaRowindex: e => RE({ value: e }),
    AriaRowspan: e => zE({ value: e }),
    AriaSetsize: e => BE({ value: e }),
    AriaValuemax: e => VE({ value: e }),
    AriaValuemin: e => HE({ value: e }),
    AriaValuenow: e => UE({ value: e }),
    AriaValuetext: e => WE({ value: e }),
    Attribute: (e, t) =>
      GE({
        key: e,
        value: t,
      }),
    DataAttribute: (e, t) =>
      KE({
        key: e,
        value: t,
      }),
    Style: e => qE({ value: e }),
    InnerHTML: e => JE({ value: e }),
    ViewBox: e => YE({ value: e }),
    Xmlns: e => XE({ value: e }),
    Fill: e => ZE({ value: e }),
    FillRule: e => QE({ value: e }),
    ClipRule: e => $E({ value: e }),
    Stroke: e => eD({ value: e }),
    StrokeWidth: e => tD({ value: e }),
    StrokeLinecap: e => nD({ value: e }),
    StrokeLinejoin: e => rD({ value: e }),
    D: e => iD({ value: e }),
    Cx: e => aD({ value: e }),
    Cy: e => oD({ value: e }),
    R: e => sD({ value: e }),
    X: e => cD({ value: e }),
    Y: e => lD({ value: e }),
    Width: e => uD({ value: e }),
    Height: e => dD({ value: e }),
    X1: e => fD({ value: e }),
    Y1: e => pD({ value: e }),
    X2: e => mD({ value: e }),
    Y2: e => hD({ value: e }),
    Points: e => gD({ value: e }),
    Transform: e => _D({ value: e }),
    Opacity: e => vD({ value: e }),
    StrokeDasharray: e => yD({ value: e }),
    StrokeDashoffset: e => bD({ value: e }),
    Dx: e => xD({ value: e }),
    Dy: e => SD({ value: e }),
    Rotate: e => CD({ value: e }),
    TextAnchor: e => wD({ value: e }),
    DominantBaseline: e => TD({ value: e }),
    AlignmentBaseline: e => ED({ value: e }),
    BaselineShift: e => DD({ value: e }),
    TextLength: e => OD({ value: e }),
    LengthAdjust: e => kD({ value: e }),
    FontFamily: e => AD({ value: e }),
    FontSize: e => jD({ value: e }),
    FontWeight: e => MD({ value: e }),
    FontStyle: e => ND({ value: e }),
    LetterSpacing: e => PD({ value: e }),
    WordSpacing: e => FD({ value: e }),
    TextDecoration: e => ID({ value: e }),
    WritingMode: e => LD({ value: e }),
    Rx: e => RD({ value: e }),
    Ry: e => zD({ value: e }),
    PathLength: e => BD({ value: e }),
    FillOpacity: e => VD({ value: e }),
    StrokeOpacity: e => HD({ value: e }),
    StrokeMiterlimit: e => UD({ value: e }),
    PaintOrder: e => WD({ value: e }),
    VectorEffect: e => GD({ value: e }),
    Color: e => KD({ value: e }),
    Visibility: e => qD({ value: e }),
    Display: e => JD({ value: e }),
    Overflow: e => YD({ value: e }),
    PointerEvents: e => XD({ value: e }),
    Cursor: e => ZD({ value: e }),
    ShapeRendering: e => QD({ value: e }),
    TextRendering: e => $D({ value: e }),
    ImageRendering: e => eO({ value: e }),
    ClipPath: e => tO({ value: e }),
    Mask: e => nO({ value: e }),
    Filter: e => rO({ value: e }),
    ClipPathUnits: e => iO({ value: e }),
    MaskUnits: e => aO({ value: e }),
    MaskContentUnits: e => oO({ value: e }),
    FilterUnits: e => sO({ value: e }),
    PrimitiveUnits: e => cO({ value: e }),
    Offset: e => lO({ value: e }),
    StopColor: e => uO({ value: e }),
    StopOpacity: e => dO({ value: e }),
    GradientUnits: e => fO({ value: e }),
    GradientTransform: e => pO({ value: e }),
    SpreadMethod: e => mO({ value: e }),
    Fx: e => hO({ value: e }),
    Fy: e => gO({ value: e }),
    Fr: e => _O({ value: e }),
    PatternUnits: e => vO({ value: e }),
    PatternContentUnits: e => yO({ value: e }),
    PatternTransform: e => bO({ value: e }),
    MarkerStart: e => xO({ value: e }),
    MarkerMid: e => SO({ value: e }),
    MarkerEnd: e => CO({ value: e }),
    MarkerWidth: e => wO({ value: e }),
    MarkerHeight: e => TO({ value: e }),
    MarkerUnits: e => EO({ value: e }),
    RefX: e => DO({ value: e }),
    RefY: e => OO({ value: e }),
    Orient: e => kO({ value: e }),
    PreserveAspectRatio: e => AO({ value: e }),
    OnMount: e => NO({ action: e }),
    OnUnmount: e => PO({ message: e }),
  }),
  ik = {
    ...nk(),
    ...rk(),
    empty: null,
    keyed: tk(),
    submodel: zS,
  },
  ak = () => ik,
  ok = Symbol.for('foldkit/CommandDefinition')
function sk(e, ...t) {
  let [n] = t
  return de(n) && !Pv(n)
    ? t => {
        let n = n => ({
          name: e,
          args: n,
          effect: t(n),
          messageMappers: [],
        })
        return (
          Object.defineProperty(n, 'name', {
            value: e,
            configurable: !0,
          }),
          Object.defineProperty(n, ok, { value: ok }),
          n
        )
      }
    : t => {
        let n = () => ({
          name: e,
          effect: t,
          messageMappers: [],
        })
        return (
          Object.defineProperty(n, 'name', {
            value: e,
            configurable: !0,
          }),
          Object.defineProperty(n, ok, { value: ok }),
          n
        )
      }
}
o(2, (e, t) => ({
  ...e,
  effect: t(e.effect),
}))
var ck = o(2, (e, t) => {
  let n = e
  return {
    ...n,
    effect: H(e.effect, t),
    messageMappers: [...(n.messageMappers ?? []), t],
  }
})
o(2, (e, t) => Nr(e, e => ck(e, t)))
//#endregion
//#region ../../packages/foldkit/src/command/interruptible/interruptible.ts
var lk = Ib('Interrupted'),
  uk = Ib('NotFound')
Yv([lk, uk])
var dk = () => {
    let e = /* @__PURE__ */ new Map(),
      t = t =>
        M(jn(e.get(t)), {
          onNone: () => [],
          onSome: e => ar(e),
        })
    return {
      lookup: t,
      register: (t, n) => {
        M(jn(e.get(t)), {
          onNone: () => {
            e.set(t, new Set([n]))
          },
          onSome: e => {
            e.add(n)
          },
        })
      },
      release: (t, n) => {
        let r = jn(e.get(t))
        j(r) && (r.value.delete(n), r.value.size === 0 && e.delete(t))
      },
      interrupt: e =>
        Wu(() =>
          or(t(e), {
            onEmpty: () => L(uk()),
            onNonEmpty: e => H(Gm(e), () => lk()),
          }),
        ),
    }
  },
  fk = Pi('foldkit/Command/Interruptible/CurrentRegistry', {
    defaultValue: dk,
  }),
  pk = zn(Eu)
o(2, (e, t) => zn(t, () => e))
//#endregion
//#region ../../packages/foldkit/src/effectExtensions/stringExtensions.ts
var mk = e => m(zn(Ou(e)), Pn(wu(e.length))),
  hk = e => m(mk(e), Fn(pk)),
  gk = K({
    protocol: G,
    host: G,
    port: py(G),
    pathname: G,
    search: py(G),
    hash: py(G),
  }),
  _k = K({
    href: G,
    location: K({
      protocol: G,
      host: G,
      port: G,
    }),
  }),
  vk = G.pipe(
    Qv(
      _k,
      Bf({
        decode: e =>
          Xu({
            try: () => {
              let t = new URL(e)
              return {
                href: `${t.pathname}${t.search}${t.hash}`,
                location: {
                  protocol: t.protocol,
                  host: t.hostname,
                  port: t.port,
                },
              }
            },
            catch: () => new nf(k(e), { description: `Invalid URL: ${e}` }),
          }),
        encode: ({ href: e, location: t }) => {
          let n = t.port ? `:${t.port}` : ''
          return L(`${t.protocol}//${t.host}${n}${e}`)
        },
      }),
    ),
  ),
  yk = _k.pipe(
    Qv(
      gk,
      Vf({
        decode: ({ href: e, location: t }) => {
          let [n, r] = Du(e, '#'),
            [i, a] = Du(n, '?')
          return {
            protocol: t.protocol,
            host: t.host,
            port: pk(t.port),
            pathname: i || '/',
            search: pk(a || ''),
            hash: pk(r || ''),
          }
        },
        encode: e => {
          let t = M(e.search, {
              onNone: () => '',
              onSome: e => `?${e}`,
            }),
            n = M(e.hash, {
              onNone: () => '',
              onSome: e => `#${e}`,
            })
          return {
            href: `${e.pathname}${t}${n}`,
            location: {
              protocol: e.protocol,
              host: e.host,
              port: An(e.port, () => ''),
            },
          }
        },
      }),
    ),
  )
vk.pipe(Qv(yk))
//#endregion
//#region ../../packages/foldkit/src/navigation/urlRequest.ts
var bk = Ib('Internal', { url: gk }),
  xk = Ib('External', { href: G })
Yv([bk, xk])
//#endregion
//#region ../../packages/foldkit/src/subscription/subscription.ts
var Sk = () => e =>
    e((e, t) => ({
      dependenciesSchema: K(e),
      ...t,
    })),
  Ck = e => ({
    dependenciesSchema: K({}),
    modelToDependencies: () => ({}),
    dependenciesToStream: () => e,
  }),
  wk = Symbol.for('foldkit/Port/Inbound'),
  Tk = e => ({
    [wk]: wk,
    schema: e,
  }),
  Ek = {
    isConfigured: !1,
    lookupInbound: () => O(),
    lookupOutbound: () => O(),
  },
  Dk = Pi('foldkit/Port/CurrentPortChannels', { defaultValue: () => Ek }),
  Ok = () => {
    let e = /* @__PURE__ */ new Set(),
      t = k([])
    return {
      deliver: n => {
        e.size > 0 ? e.forEach(e => e(n)) : j(t) && t.value.push(n)
      },
      attach: n => {
        if ((e.add(n), j(t))) {
          let e = t.value
          ;((t = O()), e.forEach(n))
        }
        return () => {
          e.delete(n)
        }
      },
    }
  },
  kk = e =>
    `[foldkit] ${e} was called, but this program has no ports config. Declare Ports with Port.inbound and Port.outbound and pass the record to makeApplication or makeElement via the ports field.`,
  Ak = e =>
    `[foldkit] ${e} was called with a Port that is not in this program's ports config. Every Port the app uses must appear in the ports record passed to makeApplication or makeElement.`,
  jk = e =>
    Vy(
      z(function* () {
        let t = yield* Dk
        if (!t.isConfigured) return yield* Yu(Error(kk('Port.stream')))
        let n = yield* M(t.lookupInbound(e), {
          onNone: () => Yu(Error(Ak('Port.stream'))),
          onSome: L,
        })
        return My(e =>
          yd(
            R(() =>
              n.attach(t => {
                Gh(e, t)
              }),
            ),
            e => R(() => e()),
          ).pipe(V(() => Ku)),
        )
      }),
    ),
  Mk = (e, t) => {
    let n = {
      _tag: 'Port',
      port: e,
    }
    return {
      ...Ck(Uy(jk(e), t)),
      source: n,
    }
  },
  Nk = e => {
    let t = Object.entries(e.inbound ?? {}),
      n = Object.entries(e.outbound ?? {}),
      r = new Set(t.map(([e]) => e))
    n.forEach(([e]) => {
      if (r.has(e))
        throw Error(
          `[foldkit] Port name "${e}" appears in both inbound and outbound. Port names share one namespace on the runtime handle, so each name must be unique across both records.`,
        )
    })
    let i = /* @__PURE__ */ new Set()
    ;[...t, ...n].forEach(([e, t]) => {
      if (i.has(t))
        throw Error(
          `[foldkit] The Port registered as "${e}" is also registered under another name. Each entry in the Ports record needs its own Port.inbound or Port.outbound value.`,
        )
      i.add(t)
    })
  },
  Pk = e => {
    if (e === void 0)
      return {
        channels: {
          isConfigured: !1,
          lookupInbound: () => O(),
          lookupOutbound: () => O(),
        },
        handles: {},
        inboundName: () => O(),
        shutdown: f,
      }
    Nk(e)
    let t = !1,
      n = /* @__PURE__ */ new Map(),
      r = /* @__PURE__ */ new Map(),
      i = /* @__PURE__ */ new Set(),
      a = /* @__PURE__ */ new Map(),
      o = {}
    return (
      Object.entries(e.inbound ?? {}).forEach(([e, i]) => {
        let a = Ok()
        ;(n.set(i, a),
          r.set(i, e),
          (o[e] = {
            send: n => {
              if (t) return kl
              let r = Ov(i.schema)(n)
              return (
                Nl(r, {
                  onFailure: t => {
                    console.error(
                      `[foldkit] Inbound port "${e}" rejected a value:`,
                      bl(t),
                    )
                  },
                  onSuccess: e => a.deliver(e),
                }),
                Pl(r)
              )
            },
          }))
      }),
      Object.entries(e.outbound ?? {}).forEach(([e, n]) => {
        ;(i.add(n),
          (o[e] = {
            subscribe: e => {
              if (t) return f
              let r = a.get(n) ?? /* @__PURE__ */ new Set()
              return (
                a.set(n, r),
                r.add(e),
                () => {
                  r.delete(e)
                }
              )
            },
          }))
      }),
      {
        channels: {
          isConfigured: !0,
          lookupInbound: e => jn(n.get(e)),
          lookupOutbound: e =>
            i.has(e)
              ? k(n => {
                  t ||
                    queueMicrotask(() => {
                      t ||
                        (a.get(e) ?? /* @__PURE__ */ new Set()).forEach(e => {
                          try {
                            e(n)
                          } catch (e) {
                            console.error(
                              '[foldkit] An outbound port listener threw:',
                              e,
                            )
                          }
                        })
                    })
                })
              : O(),
        },
        handles: o,
        inboundName: e => jn(r.get(e)),
        shutdown: () => {
          ;((t = !0), a.forEach(e => e.clear()), a.clear())
        },
      }
    )
  },
  Fk = e => {
    if (e === void 0)
      return {
        handles: {},
        bind: f,
        unbind: f,
        dispose: f,
      }
    Nk(e)
    let t = !1,
      n = O(),
      r = [],
      i = /* @__PURE__ */ new Map(),
      a = /* @__PURE__ */ new Map(),
      o = {}
    ;(Object.entries(e.inbound ?? {}).forEach(([e, i]) => {
      o[e] = {
        send: a => {
          if (t) return kl
          if (j(n)) {
            let t = n.value[e]
            if (t !== void 0 && 'send' in t) return t.send(a)
          }
          let o = Ov(i.schema)(a)
          return (
            Nl(o, {
              onFailure: t => {
                console.error(
                  `[foldkit] Inbound port "${e}" rejected a value:`,
                  bl(t),
                )
              },
              onSuccess: () => {
                r.push({
                  name: e,
                  value: a,
                })
              },
            }),
            Pl(o)
          )
        },
      }
    }),
      Object.entries(e.outbound ?? {}).forEach(([e]) => {
        o[e] = {
          subscribe: n => {
            if (t) return f
            let r = i.get(e) ?? /* @__PURE__ */ new Set()
            return (
              i.set(e, r),
              r.add(n),
              () => {
                r.delete(n)
              }
            )
          },
        }
      }))
    let s = () => {
      ;(a.forEach(e => e()), a.clear(), (n = O()))
    }
    return {
      handles: o,
      bind: o => {
        if (t) return
        s()
        let c = o
        ;((n = k(c)),
          Object.entries(e.outbound ?? {}).forEach(([e]) => {
            let t = c[e]
            t !== void 0 &&
              'subscribe' in t &&
              a.set(
                e,
                t.subscribe(t => {
                  ;(i.get(e) ?? /* @__PURE__ */ new Set()).forEach(e => {
                    try {
                      e(t)
                    } catch (e) {
                      console.error(
                        '[foldkit] An outbound port listener threw:',
                        e,
                      )
                    }
                  })
                }),
              )
          }),
          r.splice(0).forEach(({ name: e, value: t }) => {
            let n = c[e]
            n !== void 0 && 'send' in n && n.send(t)
          }))
      },
      unbind: s,
      dispose: () => {
        t ||
          ((t = !0), s(), (r.length = 0), i.forEach(e => e.clear()), i.clear())
      },
    }
  },
  Ik = e => e,
  Lk = class extends _u('QueryParamsError') {},
  Rk = [],
  zk = e =>
    encodeURIComponent(e)
      .replace(/%20/g, '+')
      .replace(
        /[!'()~]/g,
        e => `%${e.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
  Bk = e =>
    Xu({
      try: () => decodeURIComponent(e.replace(/\+/g, ' ')),
      catch: t =>
        new Lk({
          cause: t,
          component: e,
        }),
    }),
  Vk = e =>
    sr(Du('=')(e), {
      onEmpty: () => L(['', '']),
      onNonEmpty: (e, t) => Ru([Bk(e), Bk(zr(t, '='))]),
    }),
  Hk = e => {
    let t = e.startsWith('?') ? e.slice(1) : e
    return Tu(t) ? L(Rk) : p(t, Du('&'), Pr(Eu), zu(Vk))
  },
  Uk = (e, t) =>
    p(
      e,
      Dr(([e]) => e === t),
      Pn(([, e]) => e),
    ),
  Wk = (e, t, n) => {
    let r = [t, n]
    return p(
      e,
      Pr(([e]) => e !== t),
      lr(r),
    )
  },
  Gk = e => qn(e),
  Kk = e =>
    p(
      e,
      Nr(([e, t]) => `${zk(e)}=${zk(t)}`),
      zr('&'),
    ),
  $ = class extends _u('ParseError') {},
  qk = e => e
m(Du('/'), Pr(Eu))
var Jk = e => ({
    parse: t =>
      sr(t, {
        onEmpty: () =>
          B(
            new $({
              message: `Expected '${e}'`,
              expected: e,
              actual: 'end of path',
              position: 0,
            }),
          ),
        onNonEmpty: (t, n) =>
          t === e
            ? L([{}, n])
            : B(
                new $({
                  message: `Expected '${e}'`,
                  expected: e,
                  actual: t,
                  position: 0,
                }),
              ),
      }),
    print: (t, n) =>
      L({
        ...n,
        segments: [...n.segments, e],
      }),
  }),
  Yk = (e, t, n) => ({
    parse: n =>
      sr(n, {
        onEmpty: () =>
          B(
            new $({
              message: `Expected ${e}`,
              expected: e,
              actual: 'end of path',
              position: 0,
            }),
          ),
        onNonEmpty: (e, n) =>
          p(
            e,
            t,
            H(e => [e, n]),
          ),
      }),
    print: (e, t) =>
      L({
        ...t,
        segments: [...t.segments, n(e)],
      }),
  }),
  Xk = e =>
    Yk(
      `string (${e})`,
      t => L({ [e]: t }),
      t => t[e],
    ),
  Zk = (e, t) => R(() => {}),
  Qk = (e, t) => {
    let n = Tv(t),
      r = Mv(t)
    return {
      parse: t =>
        sr(t, {
          onEmpty: () =>
            B(
              new $({
                message: `Expected ${e}`,
                expected: e,
                actual: 'end of path',
                position: 0,
              }),
            ),
          onNonEmpty: (t, r) =>
            p(
              t,
              n,
              U(
                n =>
                  new $({
                    message: `Invalid ${e}: ${n.message}`,
                    expected: e,
                    actual: t,
                  }),
              ),
              H(t => [tr(e, t), r]),
            ),
        }),
      print: (t, n) =>
        p(
          t[e],
          r,
          U(t => new $({ message: `Failed to encode ${e}: ${t.message}` })),
          td(t => Zk(e, t)),
          H(e => ({
            ...n,
            segments: [...n.segments, e],
          })),
        ),
    }
  },
  $k = ([e, t]) =>
    or(t, {
      onEmpty: () => L([e, t]),
      onNonEmpty: () => {
        let e = zr(t, '/')
        return B(
          new $({
            message: `Unexpected remaining segments: ${e}`,
            actual: e,
          }),
        )
      },
    }),
  eA = (...e) => ({
    parse: (t, n) =>
      sr(e, {
        onEmpty: () =>
          B(
            new $({
              message: `No route cases provided for path: /${zr(t, '/')}`,
            }),
          ),
        onNonEmpty: () =>
          cd(
            Nr(e, e =>
              p(
                e.parser.parse(t, n),
                V($k),
                H(([t, n]) => [e.casePath.embed(t), n]),
              ),
            ),
          ),
      }),
    print: (t, n) =>
      p(
        e,
        Fr(O(), (e, r) =>
          j(e)
            ? e
            : p(
                r.casePath.extract(t),
                Pn(e => r.parser.print(e, n)),
              ),
        ),
        An(() =>
          B(new $({ message: 'No route case could print the supplied value' })),
        ),
      ),
  }),
  tA = (e, t) => ({
    parser: e,
    casePath: t,
  }),
  nA = e => t => {
    let n = aA(t)
    return Object.assign(n, {
      parse: (n, r) =>
        p(
          t.parse(n, r),
          H(([t, n]) => [e.make.length === 0 ? e.make() : e.make(t), n]),
        ),
      build: n,
    })
  },
  rA = e => t => ({
    parse: (n, r) =>
      p(
        t.parse(n, r),
        V(([t, n]) =>
          p(
            e.parse(n, r),
            H(([e, n]) => [
              {
                ...t,
                ...e,
              },
              n,
            ]),
          ),
        ),
      ),
    print: (n, r) =>
      p(
        t.print(n, r),
        V(t => e.print(n, t)),
      ),
  }),
  iA = e => t =>
    qk({
      parse: (n, r) =>
        p(
          t.parse(n, r),
          V(([t, n]) =>
            p(
              Hk(r ?? ''),
              U(
                e =>
                  new $({
                    message: `Query parameters could not be decoded: ${globalThis.String(e.cause)}`,
                    expected: 'valid query parameters',
                    actual: r || 'empty',
                  }),
              ),
              H(Gk),
              V(t =>
                p(
                  t,
                  Tv(e),
                  U(
                    e =>
                      new $({
                        message: `Query parameter validation failed: ${e.message}`,
                        expected: 'valid query parameters',
                        actual: r || 'empty',
                      }),
                  ),
                ),
              ),
              H(e => [
                {
                  ...t,
                  ...e,
                },
                n,
              ]),
            ),
          ),
        ),
      print: (n, r) =>
        p(
          t.print(n, r),
          V(t =>
            p(
              Mv(e)(n),
              H(e => {
                let n = p(
                  e,
                  Yn,
                  Fr(t.queryParams, (e, [t, n]) =>
                    ce(n) ? Wk(e, t, n.toString()) : e,
                  ),
                )
                return {
                  ...t,
                  queryParams: n,
                }
              }),
              U(
                e =>
                  new $({
                    message: `Query parameter encoding failed: ${e.message}`,
                  }),
              ),
            ),
          ),
        ),
    }),
  aA = e => t => {
    let n = {
      segments: [],
      queryParams: Rk,
    }
    return p(
      e.print(t, n),
      H(e => {
        let t = '/' + zr(e.segments, '/'),
          n = Kk(e.queryParams)
        return n ? `${t}?${n}` : t
      }),
      Pd,
    )
  },
  oA = {
    changedPaths: H_(),
    affectedPaths: H_(),
  },
  sA = ue,
  cA = (e, t) => {
    let n = /* @__PURE__ */ new Set(),
      r = (e, t, r) => {
        if (e !== t) {
          if (!sA(t) || !sA(e)) {
            n.add(r)
            return
          }
          dr(t) && dr(e) ? a(e, t, r) : de(t) && de(e) ? i(e, t, r) : n.add(r)
        }
      },
      i = (e, t, i) => {
        ;(p(
          t,
          $n,
          Lr(a => {
            let o = `${i}.${a}`,
              s = Zn(e, a),
              c = Zn(t, a)
            j(s) && j(c) ? r(s.value, c.value, o) : n.add(o)
          }),
        ),
          p(
            e,
            $n,
            Lr(e => {
              Xn(t, e) || n.add(`${i}.${e}`)
            }),
          ))
      },
      a = (e, t, i) => {
        ;(p(
          t,
          Lr((t, a) => {
            let o = `${i}.${a}`,
              s = _r(e, a)
            j(s) ? r(s.value, t, o) : n.add(o)
          }),
        ),
          e.length > t.length &&
            p(
              ir(t.length, e.length - 1),
              Lr(e => n.add(`${i}.${e}`)),
            ))
      }
    r(e, t, 'root')
    let o = new Set(n),
      s = e => {
        p(
          e,
          ku('.'),
          Pn(t => e.substring(0, t)),
          Ln(e => !o.has(e)),
          Pn(e => {
            ;(o.add(e), s(e))
          }),
        )
      }
    return (
      n.forEach(s),
      {
        changedPaths: U_(n),
        affectedPaths: U_(o),
      }
    )
  },
  lA = 31,
  uA = q('Host', { actionName: Fv(G) }),
  dA = q('Command', { name: G }),
  fA = q('Subscription', { name: G }),
  pA = q('ManagedResource', { name: G }),
  mA = q('Mount', { name: G }),
  hA = q('Port', { name: G }),
  gA = q('Navigation', {}),
  _A = Yv([uA, dA, fA, pA, mA, hA, gA, q('DevTools', {})]),
  vA = e => ({
    name: e.name,
    ...(e.args === void 0 ? {} : { args: e.args }),
  }),
  yA = ({ initialModel: e, initialCommands: t, applyMessage: n }, r) => {
    let i = 0,
      a = e,
      o = t,
      s = [],
      c = k_([0, e]),
      l = e,
      u = () => ({
        retainedFromSequence: i,
        initialModel: a,
        initialCommands: o,
        transitions: s,
        latestModel: l,
      }),
      d = () => {
        c = k_([0, a])
        let e = a
        p(
          s,
          Lr((t, i) => {
            e = n(e, t.message)
            let a = i + 1
            a % r.keyframeInterval === 0 && (c = j_(c, a, e))
          }),
        )
      },
      f = () => {
        if (A(r.maximumTransitions)) return
        let e = s.length - r.maximumTransitions.value
        if (e <= 0) return
        let t = p(
          s,
          Tr((t, n) => n + 1 >= e && t.isOperationSettled),
        )
        if (A(t)) return
        let n = p(s, _r(t.value))
        if (A(n)) return
        let c = n.value
        ;((i = c.sequence),
          (a = c.model),
          (o = []),
          (s = wr(s, t.value + 1)),
          d())
      }
    return {
      read: u,
      append: e => {
        ;((s = lr(s, e)), (l = e.model))
        let t = s.length
        ;(t % r.keyframeInterval === 0 && (c = j_(c, t, e.model)), f())
      },
      modelAt: e => {
        if (!Number.isInteger(e) || e < 0 || e > s.length) return O()
        let t = Math.floor(e / r.keyframeInterval) * r.keyframeInterval
        return p(
          c,
          A_(t),
          Pn(r =>
            p(
              s,
              wr(t),
              Sr(e - t),
              Fr(r, (e, t) => n(e, t.message)),
            ),
          ),
        )
      },
    }
  },
  bA = (e, t) => {
    if (!Number.isInteger(t) || t <= 0)
      throw RangeError(`${e} must be a positive integer`)
    return t
  },
  xA = (e = {}) => {
    let t = bA('keyframeInterval', e.keyframeInterval ?? lA)
    return e =>
      yA(e, {
        keyframeInterval: t,
        maximumTransitions: O(),
      })
  },
  SA = ({
    program: e,
    initialModel: t,
    initialCommands: n = [],
    archive: r = xA(),
    now: i = Date.now,
  }) => {
    let a = t,
      o = 1,
      s = !1,
      c = /* @__PURE__ */ new Set(),
      l = r({
        initialModel: t,
        initialCommands: n,
        applyMessage: (t, n) => {
          let [r] = e.update(t, n)
          return r
        },
      })
    return {
      read: l.read,
      record: e => {
        if (s) return
        let t = {
          sequence: o,
          message: e.message,
          source: e.source,
          ...(e.operationId === void 0 ? {} : { operationId: e.operationId }),
          isOperationSettled: e.isOperationSettled,
          commands: Nr(e.commands, vA),
          timestamp: e.timestamp ?? i(),
          isModelChanged: a !== e.model,
          diff: cA(a, e.model),
          model: e.model,
        }
        ;((o += 1),
          (a = e.model),
          l.append(t),
          c.forEach(e => {
            try {
              e(t)
            } catch (e) {
              console.error('[foldkit] A Program journal observer threw:', e)
            }
          }))
      },
      modelAt: l.modelAt,
      observe: e =>
        s
          ? f
          : (c.add(e),
            () => {
              c.delete(e)
            }),
      shutdown: () => {
        ;((s = !0), c.clear())
      },
    }
  },
  CA = e => uA.make(e === void 0 ? {} : { actionName: e }),
  wA = e => dA.make({ name: e }),
  TA = e => fA.make({ name: e }),
  EA = e => pA.make({ name: e }),
  DA = e => hA.make({ name: e }),
  OA = () => gA.make({}),
  kA = 1,
  AA = K({
    name: G,
    args: Fv(Gv(G, xy)),
  }),
  jA = K({
    sequence: J,
    message: xy,
    source: _A,
    operationId: Fv(J),
    isOperationSettled: Uv,
    commands: qv(AA),
    timestamp: Hv,
  }),
  MA = K({
    name: G,
    attributes: Fv(Gv(G, xy)),
    afterFrame: J,
    timestamp: Hv,
  }),
  NA = qv(MA).pipe(ey(L([]))),
  PA = K({
    formatVersion: zv(kA),
    programId: G,
    programVersion: J,
    initialModel: xy,
    initialCommands: qv(AA),
    transitions: qv(jA),
    runtimeEvents: NA,
  }),
  FA = e =>
    K({
      formatVersion: zv(kA),
      programId: zv(e.id),
      programVersion: zv(e.version),
      initialModel: e.Model,
      initialCommands: qv(
        K({
          name: G,
          args: Fv(Gv(G, xy)),
        }),
      ),
      transitions: qv(
        K({
          sequence: J,
          message: e.Message,
          source: _A,
          operationId: Fv(J),
          isOperationSettled: Uv,
          commands: qv(
            K({
              name: G,
              args: Fv(Gv(G, xy)),
            }),
          ),
          timestamp: Hv,
        }),
      ),
      runtimeEvents: NA,
    }),
  IA = K({
    formatVersion: J,
    programId: G,
    programVersion: J,
  }),
  LA = class extends _u('ReplayTapeExportError') {},
  RA = class extends _u('ReplayTapeImportError') {},
  zA = class extends _u('IncompatibleProgramError') {},
  BA = class extends _u('IncompatibleProgramVersionError') {},
  VA = class extends _u('ReplayTapeMigrationError') {},
  HA = class extends _u('ReplayFrameError') {},
  UA = class extends _u('UnsettledReplayFrameError') {},
  WA = e => t =>
    new LA({
      message: e,
      cause: t,
    }),
  GA = e => t =>
    new RA({
      message: e,
      cause: t,
    }),
  KA = e =>
    e.args === void 0
      ? L({ name: e.name })
      : p(
          Tv(Gv(G, xy))(e.args),
          H(t => ({
            name: e.name,
            args: t,
          })),
          U(WA(`Command ${e.name} has invalid args`)),
        ),
  qA = (e, t) =>
    z(function* () {
      let n = yield* p(
          Mv(e)(t.message),
          U(WA('A Message could not be encoded')),
        ),
        r = yield* zu(t.commands, KA)
      return {
        sequence: t.sequence,
        message: n,
        source: t.source,
        ...(t.operationId === void 0 ? {} : { operationId: t.operationId }),
        isOperationSettled: t.isOperationSettled,
        commands: r,
        timestamp: t.timestamp,
      }
    }),
  JA = e => ({
    sequence: e.sequence,
    message: e.message,
    source: e.source,
    ...(e.operationId === void 0 ? {} : { operationId: e.operationId }),
    isOperationSettled: e.isOperationSettled,
    commands: e.commands,
    timestamp: e.timestamp,
  }),
  YA = (e, t, n = []) => ({
    formatVersion: kA,
    programId: e.id,
    programVersion: e.version,
    initialModel: t.initialModel,
    initialCommands: t.initialCommands,
    transitions: Nr(t.transitions, JA),
    runtimeEvents: n,
  }),
  XA = (e, t) =>
    t.programId === e.id
      ? t.programVersion === e.version
        ? Gu
        : B(
            new BA({
              programId: e.id,
              expectedVersion: e.version,
              actualVersion: t.programVersion,
            }),
          )
      : B(
          new zA({
            expectedProgramId: e.id,
            actualProgramId: t.programId,
          }),
        ),
  ZA = (e, t) => {
    if (t === 0)
      return fr(e.initialCommands)
        ? L({
            ...e,
            transitions: [],
            runtimeEvents: Pr(e.runtimeEvents, e => e.afterFrame === 0),
          })
        : B(new UA({ frame: t }))
    let n = p(e.transitions, _r(t - 1))
    return A(n) || !n.value.isOperationSettled
      ? B(new UA({ frame: t }))
      : L({
          ...e,
          transitions: Sr(e.transitions, t),
          runtimeEvents: Pr(e.runtimeEvents, e => e.afterFrame <= t),
        })
  },
  QA = (e, t) =>
    z(function* () {
      let n = vy(e.Model),
        r = vy(e.Message),
        i = yield* p(
          Mv(n)(t.initialModel),
          U(WA('The initial Model could not be encoded')),
        ),
        a = yield* zu(t.transitions, e => qA(r, e)),
        o = yield* zu(t.initialCommands, KA),
        s = yield* p(
          Mv(PA)({
            formatVersion: kA,
            programId: e.id,
            programVersion: e.version,
            initialModel: i,
            initialCommands: o,
            transitions: a,
            runtimeEvents: t.runtimeEvents,
          }),
          U(WA('The replay tape is not portable JSON')),
        )
      return yield* Xu({
        try: () => JSON.stringify(s),
        catch: WA('The replay tape could not be serialized'),
      })
    }),
  $A = e => p(Tv(IA)(e), U(GA('The replay tape header is invalid'))),
  ej = (e, t, n) => {
    if (n === e.version) return L(t)
    let r = p(
      e.migrations ?? [],
      Er(e => e.fromVersion === n),
    )
    if (A(r))
      return B(
        new BA({
          programId: e.id,
          expectedVersion: e.version,
          actualVersion: n,
        }),
      )
    let i = r.value
    return p(
      Xu({
        try: () => i.migrate(t),
        catch: t =>
          new VA({
            programId: e.id,
            fromVersion: i.fromVersion,
            toVersion: i.toVersion,
            cause: t,
          }),
      }),
      V(t =>
        p(
          $A(t),
          V(n => ej(e, t, n.programVersion)),
        ),
      ),
    )
  },
  tj = (e, t) =>
    p(
      Tv(e)(t.message),
      H(e => ({
        sequence: t.sequence,
        message: e,
        source: t.source,
        ...(t.operationId === void 0 ? {} : { operationId: t.operationId }),
        isOperationSettled: t.isOperationSettled,
        commands: t.commands,
        timestamp: t.timestamp,
      })),
      U(GA('A replay Message is invalid')),
    ),
  nj = (e, t) =>
    z(function* () {
      let n = yield* Xu({
          try: () => JSON.parse(t),
          catch: GA('The replay tape is not valid JSON'),
        }),
        r = yield* p(Tv(xy)(n), U(GA('The replay tape is not JSON data'))),
        i = yield* $A(r)
      if (i.programId !== e.id)
        return yield* new zA({
          expectedProgramId: e.id,
          actualProgramId: i.programId,
        })
      if (i.formatVersion !== kA)
        return yield* new RA({
          message: `Unsupported replay tape format ${i.formatVersion}`,
          cause: i.formatVersion,
        })
      let a = yield* ej(e, r, i.programVersion),
        o = yield* p(Tv(PA)(a), U(GA('The replay tape shape is invalid'))),
        s = vy(e.Model),
        c = vy(e.Message),
        l = yield* p(
          Tv(s)(o.initialModel),
          U(GA('The initial Model is invalid')),
        ),
        u = yield* zu(o.transitions, e => tj(c, e))
      return {
        formatVersion: o.formatVersion,
        programId: o.programId,
        programVersion: o.programVersion,
        initialModel: l,
        initialCommands: o.initialCommands,
        transitions: u,
        runtimeEvents: o.runtimeEvents,
      }
    }),
  rj = (e, t, n) =>
    !Number.isInteger(n) || n < 0 || n > t.transitions.length
      ? B(
          new HA({
            frame: n,
            maximumFrame: t.transitions.length,
          }),
        )
      : L(
          p(
            t.transitions,
            Sr(n),
            Fr(t.initialModel, (t, n) => {
              let [r] = e.update(t, n.message)
              return r
            }),
          ),
        ),
  ij = Yv([
    G.check(
      iy(
        /^uuiduri:[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      ),
    ),
    G.check(oy(4)),
  ]),
  aj = class extends _u('ProgramRouteError') {},
  oj = G.pipe(
    Qv(
      xy,
      Bf({
        decode: e =>
          p(
            Xu({
              try: () => JSON.parse(e),
              catch: t => new nf(k(e), { description: globalThis.String(t) }),
            }),
            V($_(xy)),
          ),
        encode: e =>
          Xu({
            try: () => JSON.stringify(e),
            catch: t => new nf(k(e), { description: globalThis.String(t) }),
          }),
      }),
    ),
  ),
  sj = e => {
    let t = e.indexOf('?'),
      n = t === -1 ? e : e.slice(0, t),
      r = t === -1 ? '' : e.slice(t + 1)
    return {
      segments: p(n, Du('/'), Pr(Eu)),
      search: r,
    }
  },
  cj = e => {
    let t = `/${zr(e.segments, '/')}`,
      n = Kk(e.queryParams)
    return Tu(n) ? t : `${t}?${n}`
  },
  lj = e => t =>
    new aj({
      message: e,
      cause: t,
    }),
  uj = (e, t, n, r) => [
    {
      tape: e,
      frame: t,
      isPlaying: n,
    },
    r,
  ],
  dj = (e, t, n, r) => [
    {
      tapeId: e,
      frame: t,
      isPlaying: n,
    },
    r,
  ],
  fj = e =>
    p(
      Hk(e ?? ''),
      U(
        e =>
          new $({
            message: 'Replay query parameters could not be decoded',
            actual: e.component,
          }),
      ),
      V(e => {
        let t = Uk(e, 'play')
        return A(t) || t.value === '0'
          ? L(!1)
          : t.value === '1'
            ? L(!0)
            : B(
                new $({
                  message: 'Replay playback must be encoded as 0 or 1',
                  expected: '0 or 1',
                  actual: t.value,
                }),
              )
      }),
    ),
  pj = (e, t, n) => {
    let r = Wk(e, 'frame', t.toString())
    return n ? Wk(r, 'play', '1') : r
  },
  mj = e =>
    p(
      Hk(e ?? ''),
      U(
        e =>
          new $({
            message: 'Replay query parameters could not be decoded',
            actual: e.component,
          }),
      ),
      V(e => {
        let t = Uk(e, 'frame')
        if (A(t))
          return B(
            new $({
              message: 'Expected replay frame query parameter',
              expected: 'frame',
              actual: 'missing',
            }),
          )
        let n = globalThis.Number(t.value)
        return !Number.isInteger(n) || n < 0
          ? B(
              new $({
                message: 'Replay frame must be a non-negative integer',
                expected: 'non-negative integer',
                actual: t.value,
              }),
            )
          : L(n)
      }),
    ),
  hj = e => {
    let t = p(Jk(e.id), rA(Jk('replay')), rA(Qk('tapeId', ij)))
    return {
      parse: (e, n) =>
        p(
          t.parse(e, n),
          V(([{ tapeId: e }, t]) =>
            Ru({
              frame: mj(n),
              isPlaying: fj(n),
            }).pipe(H(({ frame: n, isPlaying: r }) => dj(e, n, r, t))),
          ),
        ),
      print: ({ tapeId: e, frame: n, isPlaying: r }, i) =>
        p(
          t.print({ tapeId: e }, i),
          H(e => ({
            ...e,
            queryParams: pj(e.queryParams, n, r),
          })),
        ),
    }
  },
  gj = e => {
    let t = p(Jk(e.id), rA(Jk('replay')))
    return {
      parse: (n, r) =>
        p(
          t.parse(n, r),
          V(([t, n]) =>
            p(
              Hk(r ?? ''),
              U(
                e =>
                  new $({
                    message: 'Replay query parameters could not be decoded',
                    actual: e.component,
                  }),
              ),
              V(t => {
                let r = Uk(t, 'tape')
                if (A(r))
                  return B(
                    new $({
                      message: 'Expected replay tape query parameter',
                      expected: 'tape',
                      actual: 'missing',
                    }),
                  )
                let i = Uk(t, 'frame'),
                  a = Uk(t, 'play')
                return p(
                  nj(e, r.value),
                  V(e => {
                    let t = M(i, {
                      onNone: () => e.transitions.length,
                      onSome: e => globalThis.Number(e),
                    })
                    if (
                      !Number.isInteger(t) ||
                      t < 0 ||
                      t > e.transitions.length
                    )
                      return B(
                        new $({
                          message: 'Replay frame is outside the tape bounds',
                          expected: `integer from 0 through ${e.transitions.length.toString()}`,
                          actual: An(i, () => ''),
                        }),
                      )
                    let r = M(a, {
                      onNone: () => !1,
                      onSome: e => e === '1',
                    })
                    return j(a) && a.value !== '0' && a.value !== '1'
                      ? B(
                          new $({
                            message:
                              'Replay playback must be encoded as 0 or 1',
                            expected: '0 or 1',
                            actual: a.value,
                          }),
                        )
                      : L(uj(e, t, r, n))
                  }),
                  U(
                    e =>
                      new $({
                        message: `Invalid replay tape: ${e._tag}`,
                        actual: r.value,
                      }),
                  ),
                )
              }),
            ),
          ),
        ),
      print: ({ tape: n, frame: r, isPlaying: i }, a) =>
        p(
          t.print({}, a),
          V(t =>
            p(
              QA(e, n),
              H(e => {
                let n = pj(Wk(t.queryParams, 'tape', e), r, i)
                return {
                  ...t,
                  queryParams: n,
                }
              }),
              U(
                e =>
                  new $({
                    message: `Could not encode replay tape: ${e.message}`,
                  }),
              ),
            ),
          ),
        ),
    }
  },
  _j = e => {
    let t = q('State', { model: e.Model }),
      n = q('Replay', {
        tape: FA(e),
        frame: J,
        isPlaying: Uv,
      }),
      r = q('SavedReplay', {
        tapeId: ij,
        frame: J,
        isPlaying: Uv,
      }),
      i = Yv([t, n, r]),
      a = oj.pipe(Qv(vy(e.Model))),
      o = p(Jk(e.id), rA(Jk('state')), iA(K({ model: a }))),
      s = gj(e),
      c = hj(e),
      l = eA(
        tA(o, {
          embed: ({ model: e }) => t.make({ model: e }),
          extract: e => (e._tag === 'State' ? k({ model: e.model }) : O()),
        }),
        tA(s, {
          embed: ({ tape: e, frame: t, isPlaying: r }) =>
            n.make({
              tape: e,
              frame: t,
              isPlaying: r,
            }),
          extract: e =>
            e._tag === 'Replay'
              ? k({
                  tape: e.tape,
                  frame: e.frame,
                  isPlaying: e.isPlaying,
                })
              : O(),
        }),
        tA(c, {
          embed: ({ tapeId: e, frame: t, isPlaying: n }) =>
            r.make({
              tapeId: e,
              frame: t,
              isPlaying: n,
            }),
          extract: e =>
            e._tag === 'SavedReplay'
              ? k({
                  tapeId: e.tapeId,
                  frame: e.frame,
                  isPlaying: e.isPlaying,
                })
              : O(),
        }),
      ),
      u = e => {
        let { segments: t, search: n } = sj(e)
        return p(
          l.parse(t, n),
          V(([e, t]) =>
            mr(t)
              ? B(
                  new $({
                    message: `Unexpected remaining segments: ${zr(t, '/')}`,
                    actual: zr(t, '/'),
                  }),
                )
              : L(e),
          ),
          U(lj('The Program route could not be parsed')),
        )
      },
      d = e =>
        p(
          l.print(e, {
            segments: [],
            queryParams: Rk,
          }),
          H(cj),
          U(lj('The Program route could not be printed')),
        )
    return {
      Route: i,
      parse: u,
      print: d,
      canonicalize: e => p(e, u, V(d)),
    }
  },
  vj = e => ({
    _tag: 'State',
    model: e,
  }),
  yj = (e, t = e.transitions.length, n = !1) => ({
    _tag: 'Replay',
    tape: e,
    frame: t,
    isPlaying: n,
  }),
  bj = W_,
  xj = 100,
  Sj = ({
    runtime: e,
    bridge: t,
    excludeFromHistory: n = [],
    maxEntries: r = xj,
    initialMountStarts: i = [],
  }) =>
    z(function* () {
      let a = new Set(n),
        o = /* @__PURE__ */ new Map(),
        s = yield* kb({
          entries: [],
          maybeInitModel: O(),
          initCommands: [],
          initMountStarts: i,
          startIndex: 0,
          isPaused: !1,
          pausedAtIndex: 0,
          maybeLatestModel: O(),
        }),
        c = 0,
        l = () =>
          p(
            e.journal.read().transitions,
            Pr(e => e.sequence > c && !a.has(e.message._tag)),
          ),
        u = e => {
          let t = o.get(e.sequence) ?? {
            starts: [],
            ends: [],
          }
          return {
            tag: e.message._tag,
            message: e.message,
            maybeSource: k(e.source),
            commands: e.commands,
            mountStarts: t.starts,
            mountEnds: t.ends,
            timestamp: e.timestamp,
            isModelChanged: e.isModelChanged,
            diff: e.diff,
          }
        },
        d = Nb(s, t => {
          let n = e.journal.read(),
            i = l(),
            a = Cr(i, r),
            o = i.length - a.length,
            s = t.pausedAtIndex === -1 || t.pausedAtIndex >= o
          return {
            entries: Nr(a, u),
            maybeInitModel: k(n.initialModel),
            initCommands: n.initialCommands,
            initMountStarts: t.initMountStarts,
            startIndex: o,
            isPaused: t.isPaused && s,
            pausedAtIndex: t.pausedAtIndex,
            maybeLatestModel: k(n.latestModel),
          }
        }),
        f = yield* Uh(),
        m = e.journal.observe(e => {
          Gh(f, e)
        })
      ;(yield* bd(() => R(m)),
        yield* d,
        yield* Ry(f).pipe(
          eb(() => d),
          jd,
        ))
      let h = e => p(l(), _r(e), Nn),
        g = t =>
          R(() => {
            if (t === -1) return e.journal.read().initialModel
            let n = l(),
              r = p(n, _r(t), Nn)
            return t === n.length - 1 ? e.journal.read().latestModel : r.model
          }),
        _ = e => R(() => (e === -1 ? O() : k(h(e).message))),
        v = e => R(() => (e === -1 ? oA : h(e).diff)),
        ee = e =>
          z(function* () {
            let n = yield* g(e)
            return (
              yield* t.render(n),
              yield* Nb(s, t =>
                bj(t, {
                  isPaused: () => !0,
                  pausedAtIndex: () => e,
                }),
              ),
              n
            )
          }),
        te = z(function* () {
          ;(yield* Nb(s, e => bj(e, { isPaused: () => !1 })),
            yield* t.markRenderPending)
        }),
        ne = z(function* () {
          ;(yield* jb(s)).isPaused ||
            ((c = M(yr(e.journal.read().transitions), {
              onNone: () => 0,
              onSome: e => e.sequence,
            })),
            yield* d)
        }),
        re = (e, t) =>
          z(function* () {
            if (fr(e) && fr(t)) return
            let n = yr(l())
            if (A(n)) {
              yield* Nb(s, t => bj(t, { initMountStarts: ur(e) }))
              return
            }
            let r = n.value.sequence,
              i = o.get(r) ?? {
                starts: [],
                ends: [],
              }
            ;(o.set(r, {
              starts: ur(i.starts, e),
              ends: ur(i.ends, t),
            }),
              yield* d)
          }),
        ie = p(
          s,
          jb,
          H(e => {
            let t = Nr(e.entries, (t, n) => e.startIndex + n)
            return j(e.maybeInitModel) ? cr(t, -1) : t
          }),
        )
      return {
        attachRenderedMounts: re,
        getModelAtIndex: g,
        getMessageAtIndex: _,
        getDiffAtIndex: v,
        getRuntimeDiagnostics: R(e.readDiagnostics),
        getRuntimeFailures: R(() => e.readFailures()),
        getReplayIndices: ie,
        jumpTo: ee,
        resume: te,
        clear: ne,
        stateRef: s,
      }
    }),
  Cj = q('StartedSubscription', {
    programId: G,
    name: G,
    instanceId: J,
    timestamp: Hv,
  }),
  wj = q('StoppedSubscription', {
    programId: G,
    name: G,
    instanceId: J,
    timestamp: Hv,
  }),
  Tj = q('FailedSubscription', {
    programId: G,
    name: G,
    instanceId: J,
    timestamp: Hv,
    cause: G,
  }),
  Ej = q('StartedAcquiringManagedResource', {
    programId: G,
    name: G,
    instanceId: J,
    timestamp: Hv,
  }),
  Dj = q('AcquiredManagedResource', {
    programId: G,
    name: G,
    instanceId: J,
    timestamp: Hv,
  }),
  Oj = q('FailedAcquiringManagedResource', {
    programId: G,
    name: G,
    instanceId: J,
    timestamp: Hv,
    cause: G,
  }),
  kj = q('StartedReleasingManagedResource', {
    programId: G,
    name: G,
    instanceId: J,
    timestamp: Hv,
  }),
  Aj = q('ReleasedManagedResource', {
    programId: G,
    name: G,
    instanceId: J,
    timestamp: Hv,
  }),
  jj = q('FailedReleasingManagedResource', {
    programId: G,
    name: G,
    instanceId: J,
    timestamp: Hv,
    cause: G,
  })
Yv([Cj, wj, Tj, Ej, Dj, Oj, kj, Aj, jj])
var Mj = e => Cj.make(e),
  Nj = e => wj.make(e),
  Pj = e => Tj.make(e),
  Fj = e => Ej.make(e),
  Ij = e => Dj.make(e),
  Lj = e => Oj.make(e),
  Rj = e => kj.make(e),
  zj = e => Aj.make(e),
  Bj = e => jj.make(e),
  Vj = q('Update', { messageTag: G }),
  Hj = q('Command', { name: G }),
  Uj = q('Subscription', { name: G }),
  Wj = q('ManagedResource', { name: G })
Yv([Vj, Hj, Uj, Wj])
var Gj = e => Vj.make({ messageTag: e }),
  Kj = e => Hj.make({ name: e }),
  qj = e => Uj.make({ name: e }),
  Jj = e => Wj.make({ name: e }),
  Yj = (e, t) => {
    let n = Xj(e, t),
      r = Zj(e, t),
      i = Qj(e, t)
    return () => {
      ;(n(), r(), i())
    }
  },
  Xj = (e, t) => {
    let n = () => {
      e(t.onUrlChange(eM()), OA())
    }
    return (
      window.addEventListener('popstate', n),
      () => {
        window.removeEventListener('popstate', n)
      }
    )
  },
  Zj = (e, t) => {
    let n = n => {
      let r = n.button !== 0,
        i = n.metaKey || n.ctrlKey || n.shiftKey || n.altKey,
        a = n.defaultPrevented
      if (r || i || a) return
      let o = n.target
      if (!(o instanceof Element)) return
      let s = jn(o.closest('a'))
      if (A(s)) return
      let c = s.value,
        { href: l } = c
      if (Tu(l)) return
      let u = !Tu(c.target) && c.target !== '_self',
        d = c.hasAttribute('download')
      if (u || d) return
      n.preventDefault()
      let f = new URL(l),
        p = new URL(window.location.href)
      if (f.origin !== p.origin) {
        e(t.onUrlRequest(xk({ href: l })), OA())
        return
      }
      e(t.onUrlRequest(bk({ url: $j(f) })), OA())
    }
    return (
      document.addEventListener('click', n),
      () => {
        document.removeEventListener('click', n)
      }
    )
  },
  Qj = (e, t) => {
    let n = () => {
      e(t.onUrlChange(eM()), OA())
    }
    return (
      window.addEventListener('foldkit:urlchange', n),
      () => {
        window.removeEventListener('foldkit:urlchange', n)
      }
    )
  },
  $j = e => {
    let {
      protocol: t,
      hostname: n,
      port: r,
      pathname: i,
      search: a,
      hash: o,
    } = e
    return {
      protocol: t,
      host: n,
      port: pk(r),
      pathname: i,
      search: hk('?')(a),
      hash: hk('#')(o),
    }
  },
  eM = () => $j(new URL(window.location.href)),
  tM = ({ persisted: e }) => {
    e && location.reload()
  },
  nM = () => (
    window.addEventListener('pageshow', tM),
    () => {
      window.removeEventListener('pageshow', tM)
    }
  ),
  rM = {
    dispatchAsync: e => Gu,
    dispatchSync: e => {},
  },
  iM = {
    bg: '#f9fafb',
    cardBg: '#ffffff',
    border: '#e5e7eb',
    errorAccent: '#dc2626',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    codeBg: '#f3f4f6',
    buttonBg: '#18181b',
    buttonText: '#ffffff',
  },
  aM =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  oM =
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  sM = (e, t) => {
    let n = ak(),
      r = n.Style({
        fontFamily: oM,
        color: iM.textPrimary,
        margin: '0',
        fontSize: '0.9375rem',
        lineHeight: '1.5',
        backgroundColor: iM.codeBg,
        padding: '0.75rem 1rem',
        borderRadius: '0.375rem',
      }),
      i = n.Style({
        color: iM.textSecondary,
        margin: '0 0 0.5rem 0',
        fontSize: '0.875rem',
        fontWeight: '500',
      }),
      a = n.Style({
        fontFamily: oM,
        backgroundColor: iM.codeBg,
        padding: '0.125rem 0.375rem',
        borderRadius: '0.25rem',
      }),
      o = t instanceof Error ? t.message : String(t),
      s = t
        ? [
            'Your custom ',
            n.span([a], ['crash.view']),
            ' threw an error while rendering.',
          ]
        : [
            'Foldkit encountered an unrecoverable error while running your application.',
          ],
      c = t
        ? [
            n.div(
              [n.Style({ margin: '0 0 1rem 0' })],
              [n.p([i], ['Original error']), n.p([r], [e.error.message])],
            ),
            n.div(
              [n.Style({ margin: '0 0 1.25rem 0' })],
              [n.p([i], ['crash.view error']), n.p([r], [o])],
            ),
          ]
        : [
            n.p(
              [
                n.Style({
                  fontFamily: oM,
                  color: iM.textPrimary,
                  margin: '0 0 1.25rem 0',
                  fontSize: '0.9375rem',
                  lineHeight: '1.5',
                  backgroundColor: iM.codeBg,
                  padding: '0.75rem 1rem',
                  borderRadius: '0.375rem',
                }),
              ],
              [e.error.message],
            ),
          ],
      l = t
        ? []
        : [
            n.p(
              [
                n.Style({
                  color: iM.textSecondary,
                  margin: '1.5rem 0 0 0',
                  fontSize: '0.875rem',
                  lineHeight: '1.5',
                  borderTop: `1px solid ${iM.border}`,
                  paddingTop: '1rem',
                }),
              ],
              [
                'This is the default crash view. You can customize it by providing a ',
                n.span([a], ['crash.view']),
                ' function.',
              ],
            ),
          ]
    return {
      title: 'Application Crash',
      body: n.div(
        [
          n.Style({
            fontFamily: aM,
            padding: '2rem',
            minHeight: '100vh',
            backgroundColor: iM.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }),
        ],
        [
          n.div(
            [
              n.Style({
                width: '100%',
                maxWidth: '960px',
                margin: '0 auto',
                backgroundColor: iM.cardBg,
                borderRadius: '0 0.5rem 0.5rem 0',
                border: `1px solid ${iM.border}`,
                borderLeft: `4px solid ${iM.errorAccent}`,
                padding: '1.5rem',
              }),
            ],
            [
              n.h1(
                [
                  n.Style({
                    color: iM.errorAccent,
                    margin: '0 0 0.75rem 0',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    lineHeight: '1.5',
                  }),
                ],
                ['Application Crash'],
              ),
              n.p(
                [
                  n.Style({
                    color: iM.textPrimary,
                    margin: '0 0 1rem 0',
                    fontSize: '1rem',
                    lineHeight: '1.625',
                  }),
                ],
                s,
              ),
              ...c,
              n.p(
                [
                  n.Style({
                    color: iM.textPrimary,
                    margin: '0 0 1.5rem 0',
                    fontSize: '1rem',
                    lineHeight: '1.5',
                  }),
                ],
                [
                  '→ Check the browser console for the full stack trace with source-mapped line numbers.',
                ],
              ),
              n.button(
                [
                  n.Style({
                    fontFamily: aM,
                    backgroundColor: iM.buttonBg,
                    color: iM.buttonText,
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }),
                  n.Attribute('onclick', 'location.reload()'),
                ],
                ['Reload'],
              ),
              ...l,
            ],
          ),
        ],
      ),
    }
  },
  cM = e =>
    typeof e != 'object' || !e || Object.isFrozen(e)
      ? e
      : dr(e)
        ? (Object.freeze(e), e.forEach(cM), e)
        : kn(e)
          ? (j(e) && cM(e.value), e)
          : lM(e)
            ? (Object.freeze(e), er(e).forEach(cM), e)
            : e,
  lM = e => {
    if (!de(e)) return !1
    let t = Object.getPrototypeOf(e)
    return t === Object.prototype || t === null
  },
  uM = K({
    id: G,
    model: Bv,
    isHmrReload: Iv(Uv),
  }),
  dM = K({ id: G }),
  fM = K({
    id: G,
    model: Iv(Bv),
  }),
  pM = hy(
    K({
      x: Hv,
      y: Hv,
    }),
  )
Nv(pM)
var mM = kv(pM),
  hM = e => `foldkit:hmr-scroll:${e}`,
  gM = e => {
    try {
      let t = hM(e),
        n = jn(window.sessionStorage.getItem(t))
      return (window.sessionStorage.removeItem(t), Fn(n, mM))
    } catch {
      return O()
    }
  },
  _M = e =>
    R(() => {
      let t = gM(e)
      if (j(t)) {
        let { x: e, y: n } = t.value
        window.scrollTo({
          left: e,
          top: n,
          behavior: 'instant',
        })
      }
    }),
  vM = (e, t) =>
    z(function* () {
      let n = yield* _d,
        r = yield* Sb(O()),
        i = yield* Sb(O()),
        a = z(function* () {
          ;(yield* M(yield* Cb(i), {
            onNone: () => Gu,
            onSome: Wm,
          }),
            yield* wb(i, O()))
        }),
        o = e =>
          z(function* () {
            yield* M(yield* Tb(r, O()), {
              onNone: () => Gu,
              onSome: e,
            })
          })
      return {
        schedule: s =>
          z(function* () {
            ;(yield* wb(r, k(s)),
              yield* a,
              yield* wb(
                i,
                k(
                  yield* Ad(
                    z(function* () {
                      ;(yield* ld(t), yield* o(e.onDebounce))
                    }),
                    n,
                  ),
                ),
              ))
          }),
        flush: o(e.onFlush),
        cancel: z(function* () {
          ;(yield* a, yield* wb(r, O()))
        }),
      }
    }),
  yM = (e, t, n = t.transitions.length) =>
    z(function* () {
      let r = n,
        i = yield* rj(e, t, r),
        a = /* @__PURE__ */ new Set(),
        o = () => r,
        s = () => i,
        c = () => t,
        l = n =>
          p(
            rj(e, t, n),
            td(e =>
              R(() => {
                ;((r = n), (i = e), a.forEach(t => t(n, e)))
              }),
            ),
          )
      return {
        mode: 'Inspecting',
        readFrame: o,
        readModel: s,
        seek: l,
        stepBackward: Wu(() => l(Math.max(0, r - 1))),
        stepForward: Wu(() => l(Math.min(t.transitions.length, r + 1))),
        observe: e => (
          a.add(e),
          () => {
            a.delete(e)
          }
        ),
        branch: (e = r) => ZA(t, e),
        readTape: c,
      }
    }),
  bM = class extends _u('ProgramRuntimeStartError') {},
  xM = e => ({
    name: e.name,
    ...(e.args === void 0 ? {} : { args: e.args }),
  }),
  SM = (e, t) => {
    if (t._tag === 'Fresh') {
      let [t, n] = e.init()
      return L({
        model: t,
        commands: n,
        journalInitialModel: t,
        journalInitialCommands: Nr(n, xM),
        maybeReplayTape: O(),
      })
    }
    if (t._tag === 'Model') {
      let [n, r] = e.restore?.(t.model) ?? [t.model, []]
      return L({
        model: n,
        commands: r,
        journalInitialModel: n,
        journalInitialCommands: Nr(r, xM),
        maybeReplayTape: O(),
      })
    }
    return z(function* () {
      yield* p(
        XA(e, t.tape),
        U(
          () =>
            new bM({
              message: `Replay tape ${t.tape.programId}@${t.tape.programVersion} does not match ${e.id}@${e.version}`,
            }),
        ),
      )
      let n = yield* p(
        ZA(t.tape, t.tape.transitions.length),
        U(
          () =>
            new bM({
              message:
                'A live Program can resume only from a settled replay frame',
            }),
        ),
      )
      return {
        model: yield* p(
          rj(e, n, n.transitions.length),
          U(e => new bM({ message: e.message })),
        ),
        commands: [],
        journalInitialModel: n.initialModel,
        journalInitialCommands: n.initialCommands,
        maybeReplayTape: k(n),
      }
    })
  },
  CM = (e, t) => {
    let n = {
      id: e,
      pendingWorkCount: 0,
      completion: Il(),
    }
    return (t.add(n), n)
  },
  wM = e => {
    j(e) && (e.value.pendingWorkCount += 1)
  },
  TM = (e, t) => {
    if (A(t)) return
    let n = t.value
    ;(--n.pendingWorkCount,
      n.pendingWorkCount === 0 && (e.delete(n), Vl(n.completion, Gu)))
  },
  EM = 5,
  DM = e => {
    let t = setTimeout(e, 0)
    return () => clearTimeout(t)
  },
  OM = (e, t) => {
    ;(e.forEach(e => {
      Vl(e.completion, qu(t))
    }),
      e.clear())
  },
  kM = e =>
    z(function* () {
      let t = yield* SM(e.program, e.start ?? AM()),
        n = yield* Ul()
      yield* bd(e => Yl(n, e))
      let r = yield* fd(),
        i = yield* ph({ replay: 1 }),
        a = yield* ph(),
        o = yield* ph(),
        s = yield* ph(),
        c = yield* ph(),
        l = /* @__PURE__ */ new Set(),
        u = /* @__PURE__ */ new Set(),
        d = /* @__PURE__ */ new Set(),
        m = /* @__PURE__ */ new Set(),
        h = /* @__PURE__ */ new Set(),
        g = dk(),
        _ = Pk(e.program.ports),
        v = e.journal?.now ?? Date.now,
        ee = e.scheduling?.now ?? Date.now,
        te = e.scheduling?.defer ?? DM,
        ne = e.scheduling?.synchronousWorkBudgetMs ?? EM,
        re = [],
        ie = [],
        ae = 1,
        oe = SA({
          program: e.program,
          initialModel: t.journalInitialModel,
          initialCommands: t.journalInitialCommands,
          ...(e.journal?.archive === void 0
            ? {}
            : { archive: e.journal.archive }),
          ...(e.journal?.now === void 0 ? {} : { now: e.journal.now }),
        }),
        se = oe.observe(e => {
          gh(a, e)
        }),
        ce = M(t.maybeReplayTape, {
          onNone: () => [],
          onSome: e =>
            Nr(e.runtimeEvents, e => ({
              name: e.name,
              ...(e.attributes === void 0 ? {} : { attributes: e.attributes }),
              afterSequence: e.afterFrame,
              timestamp: e.timestamp,
            })),
        }),
        le = t.journalInitialModel
      j(t.maybeReplayTape) &&
        p(
          t.maybeReplayTape.value.transitions,
          Lr(t => {
            let [n] = e.program.update(le, t.message)
            ;(oe.record({
              message: t.message,
              source: t.source,
              ...(t.operationId === void 0
                ? {}
                : { operationId: t.operationId }),
              isOperationSettled: t.isOperationSettled,
              commands: t.commands,
              timestamp: t.timestamp,
              model: n,
            }),
              (le = n))
          }),
        )
      let ue = yield* zu(Yn(e.program.managedResources ?? {}), ([e, t]) =>
          Sb(O()).pipe(
            H(n => ({
              name: e,
              managedResource: t,
              ref: n,
            })),
          ),
        ),
        de = Fr(ue, du, (e, { managedResource: t, ref: n }) =>
          mu(e, lu(t.resource._tag, n)),
        ),
        fe = yield* cu(e.resources, n),
        y = e => md(hd(gd(gd(e, fk, g), Dk, _.channels), fe), de),
        pe = t.model
      gh(i, pe)
      let me = [],
        b = !1,
        x = !1,
        he = !1,
        ge = 1,
        _e = O(),
        ve = 0,
        ye = 0,
        S = !1,
        be = O(),
        xe = () => pe,
        Se = () => {
          let e = oe.read()
          return Nr(ce, t => ({
            name: t.name,
            ...(t.attributes === void 0 ? {} : { attributes: t.attributes }),
            afterFrame: Math.max(0, t.afterSequence - e.retainedFromSequence),
            timestamp: t.timestamp,
          }))
        },
        Ce = e => {
          if (he) return
          let t = oe.read(),
            n = M(yr(t.transitions), {
              onNone: () => t.retainedFromSequence,
              onSome: e => e.sequence,
            }),
            r = {
              name: e.name,
              ...(e.attributes === void 0 ? {} : { attributes: e.attributes }),
              afterSequence: n,
              timestamp: e.timestamp ?? v(),
            }
          ce = lr(ce, r)
          let i = MA.make({
            name: r.name,
            ...(r.attributes === void 0 ? {} : { attributes: r.attributes }),
            afterFrame: Math.max(0, r.afterSequence - t.retainedFromSequence),
            timestamp: r.timestamp,
          })
          ;(gh(o, i),
            d.forEach(e => {
              try {
                e(i)
              } catch (e) {
                console.error('[foldkit] A runtime event observer threw:', e)
              }
            }))
        },
        we = e =>
          he
            ? f
            : (d.add(e),
              () => {
                d.delete(e)
              }),
        Te = e => {
          u.forEach(t => {
            try {
              t(e)
            } catch (e) {
              console.error('[foldkit] A Model observer threw:', e)
            }
          })
        },
        Ee = e => {
          ;((re = lr(re, e)),
            gh(s, e),
            m.forEach(t => {
              try {
                t(e)
              } catch (e) {
                console.error('[foldkit] A diagnostic observer threw:', e)
              }
            }))
        },
        De = e => {
          ;((ie = lr(ie, e)),
            gh(c, e),
            h.forEach(t => {
              try {
                t(e)
              } catch (e) {
                console.error('[foldkit] A failure observer threw:', e)
              }
            }))
        },
        Oe = (t, n, r = O()) => {
          he ||
            j(_e) ||
            vl(t) ||
            ((_e = k(t)),
            De({
              programId: e.program.id,
              source: n,
              message: r,
              cause: t,
              timestamp: v(),
            }),
            OM(l, t))
        },
        ke = (e, t = !1) => {
          he ||
            j(_e) ||
            (wM(e.maybeOperation),
            me.push(e),
            b && (t ? queueMicrotask(je) : je()))
        },
        C = (e, t, i) => {
          ;(wM(t),
            queueMicrotask(() => {
              if (he || j(_e)) {
                TM(l, t)
                return
              }
              Nd(r)(
                Ad(n)(
                  e.effect.pipe(
                    Od(e.name, { attributes: e.args ?? {} }),
                    y,
                    nd,
                    V(n =>
                      Nl(n, {
                        onFailure: t => R(() => Oe(t, Kj(e.name), i)),
                        onSuccess: n =>
                          R(() =>
                            ke(
                              {
                                message: n,
                                source: wA(e.name),
                                maybeOperation: t,
                              },
                              !0,
                            ),
                          ),
                      }),
                    ),
                    xd(R(() => TM(l, t))),
                  ),
                ),
              )
            }))
        },
        w = ({ message: t, source: n, maybeOperation: r }) => {
          try {
            let a = pe,
              [o, s] = e.program.update(a, t),
              c = M(r, {
                onNone: () => !0,
                onSome: e => fr(s) && e.pendingWorkCount === 1,
              })
            ;(a !== o && (pe = o),
              oe.record({
                message: t,
                source: n,
                ...(j(r) ? { operationId: r.value.id } : {}),
                isOperationSettled: c,
                commands: Nr(s, xM),
                model: o,
              }),
              a !== o && (gh(i, o), Te(o)))
            for (let e of s) C(e, r, k(t))
          } catch (e) {
            Oe(gl(e), Gj(t._tag), k(t))
          } finally {
            TM(l, r)
          }
        },
        Ae = () => {
          S ||
            he ||
            ((S = !0),
            (be = k(
              te(() => {
                ;((be = O()), (S = !1), (ve = 0), je())
              }),
            )))
        }
      function je() {
        if (!b || x || S || he || j(_e)) return
        let e = ee()
        if ((e - ye > ne && (ve = 0), ve > ne)) {
          Ae()
          return
        }
        x = !0
        try {
          for (; mr(me); ) {
            let t = me
            for (me = []; mr(t); ) {
              let [n, r] = sr(t, {
                onEmpty: () => {
                  throw Error('A non-empty Message batch became empty')
                },
                onNonEmpty: (e, t) => [e, t],
              })
              if ((w(n), j(_e))) {
                me = []
                return
              }
              if ((mr(r) || mr(me)) && ve + (ee() - e) > ne) {
                ;((me = ur(r, me)), Ae())
                return
              }
              t = r
            }
          }
        } finally {
          let t = ee()
          ;((ve += t - e), (ye = t), (x = !1))
        }
      }
      let Me = (e, t) => {
          ke({
            message: e,
            source: t?.source ?? CA(t?.actionName),
            maybeOperation: O(),
          })
        },
        Ne = e =>
          he
            ? f
            : (u.add(e),
              () => {
                u.delete(e)
              }),
        Pe = e =>
          he
            ? f
            : (m.add(e),
              () => {
                m.delete(e)
              }),
        Fe = e =>
          he
            ? f
            : (h.add(e),
              () => {
                h.delete(e)
              }),
        Ie = (e, t) =>
          Wu(() => {
            if (he) return wd
            if (j(_e)) return qu(_e.value)
            let n = CM(ge, l)
            return (
              (ge += 1),
              ke({
                message: e,
                source: t?.source ?? CA(t?.actionName),
                maybeOperation: k(n),
              }),
              ed(Ll(n.completion), R(xe))
            )
          })
      e.program.subscriptions !== void 0 &&
        (yield* p(
          e.program.subscriptions,
          Yn,
          zu(
            ([
              t,
              {
                dependenciesSchema: r,
                modelToDependencies: a,
                keepAliveEquivalence: o,
                dependenciesToStream: s,
                source: c,
              },
            ]) =>
              z(function* () {
                let l = o ?? _y(r),
                  u = a(pe),
                  d = yield* Sb(u),
                  f =
                    c?._tag === 'Port'
                      ? M(_.inboundName(c.port), {
                          onNone: () => TA(t),
                          onSome: DA,
                        })
                      : TA(t),
                  p = zy(i).pipe(
                    Wy(e => {
                      let t = a(e)
                      return rd(wb(d, t), t)
                    }),
                  )
                yield* Ad(n)(
                  Jy(Fy(u), p).pipe(
                    Xy(l),
                    Ky(n => {
                      let r = ae
                      ae += 1
                      let i = {
                        programId: e.program.id,
                        name: t,
                        instanceId: r,
                      }
                      return s(n, () => Eb(d)).pipe(
                        Qy(
                          R(() =>
                            Ee(
                              Mj({
                                ...i,
                                timestamp: v(),
                              }),
                            ),
                          ),
                        ),
                        Zy(e =>
                          vl(e)
                            ? Gu
                            : R(() =>
                                Ee(
                                  Pj({
                                    ...i,
                                    timestamp: v(),
                                    cause: Sl(e),
                                  }),
                                ),
                              ),
                        ),
                        $y(
                          R(() =>
                            Ee(
                              Nj({
                                ...i,
                                timestamp: v(),
                              }),
                            ),
                          ),
                        ),
                      )
                    }),
                    eb(e =>
                      R(() =>
                        ke({
                          message: e,
                          source: f,
                          maybeOperation: O(),
                        }),
                      ),
                    ),
                    y,
                    od(e => R(() => Oe(e, qj(t)))),
                  ),
                )
              }),
            {
              concurrency: 'unbounded',
              discard: !0,
            },
          ),
        ))
      let Le = (t, n, r, i) => {
        if (kn(i) && A(i)) return Ny
        let a = kn(i) ? Nn(i) : i,
          o = ae
        ae += 1
        let s = {
          programId: e.program.id,
          name: t,
          instanceId: o,
        }
        return p(
          Hy(
            ky(
              yd(
                z(function* () {
                  yield* R(() =>
                    Ee(
                      Fj({
                        ...s,
                        timestamp: v(),
                      }),
                    ),
                  )
                  let e = yield* n.acquire(a)
                  return (
                    yield* wb(r, k(e)),
                    yield* R(() =>
                      Ee(
                        Ij({
                          ...s,
                          timestamp: v(),
                        }),
                      ),
                    ),
                    e
                  )
                }).pipe(
                  od(e =>
                    ed(
                      R(() =>
                        Ee(
                          Lj({
                            ...s,
                            timestamp: v(),
                            cause: Sl(e),
                          }),
                        ),
                      ),
                      qu(e),
                    ),
                  ),
                ),
                e =>
                  z(function* () {
                    ;(yield* R(() =>
                      Ee(
                        Rj({
                          ...s,
                          timestamp: v(),
                        }),
                      ),
                    ),
                      yield* n.release(e),
                      yield* wb(r, O()),
                      yield* R(() =>
                        Ee(
                          zj({
                            ...s,
                            timestamp: v(),
                          }),
                        ),
                      ),
                      yield* R(() =>
                        ke({
                          message: n.onReleased(),
                          source: EA(t),
                          maybeOperation: O(),
                        }),
                      ))
                  }).pipe(
                    od(e =>
                      z(function* () {
                        ;(yield* wb(r, O()),
                          yield* R(() =>
                            Ee(
                              Bj({
                                ...s,
                                timestamp: v(),
                                cause: Sl(e),
                              }),
                            ),
                          ))
                      }),
                    ),
                  ),
              ),
            ),
          ),
          Gy(e => Jy(Fy(n.onAcquired(e)), By)),
          Yy(e => Fy(n.onAcquireError(e))),
        )
      }
      yield* zu(
        ue,
        ({ name: e, managedResource: t, ref: r }) =>
          z(function* () {
            let a = _y(t.schema)
            yield* Ad(n)(
              Jy(Fy(pe), zy(i)).pipe(
                Uy(t.modelToMaybeRequirements),
                Xy(a),
                Ky(n => Le(e, t, r, n)),
                eb(t =>
                  R(() =>
                    ke({
                      message: t,
                      source: EA(e),
                      maybeOperation: O(),
                    }),
                  ),
                ),
                od(t => R(() => Oe(t, Jj(e)))),
              ),
            )
          }),
        {
          concurrency: 'unbounded',
          discard: !0,
        },
      )
      let Re = CM(0, l),
        ze = k(Re)
      wM(ze)
      for (let e of t.commands) C(e, ze, O())
      ;(TM(l, ze), (b = !0), je())
      let Be = ed(Ll(Re.completion), R(xe)),
        Ve = Wu(() =>
          he
            ? Gu
            : ((he = !0),
              j(be) && (be.value(), (be = O())),
              _.shutdown(),
              u.clear(),
              (me = []),
              OM(l, _l(void 0)),
              Yl(n, kl).pipe(
                xd(
                  z(function* () {
                    ;(yield* hh(i),
                      yield* hh(a),
                      yield* hh(o),
                      yield* hh(s),
                      yield* hh(c),
                      m.clear(),
                      h.clear(),
                      d.clear(),
                      se(),
                      oe.shutdown())
                  }),
                ),
              )),
        )
      yield* bd(() => Ve)
      let He = () => YA(e.program, oe.read(), Se())
      return {
        mode: 'Live',
        readModel: xe,
        journal: {
          read: oe.read,
          observe: oe.observe,
          transitions: zy(a),
        },
        timeline: {
          read: Se,
          record: Ce,
          observe: we,
          events: zy(o),
        },
        replay: {
          readTape: He,
          exportTape: p(
            R(He),
            V(t => QA(e.program, t)),
          ),
          inspect: e =>
            p(
              oe.modelAt(e),
              M({
                onNone: () =>
                  B(
                    new HA({
                      frame: e,
                      maximumFrame: oe.read().transitions.length,
                    }),
                  ),
                onSome: L,
              }),
            ),
          makeSession: t => {
            let n = He()
            return yM(e.program, n, t ?? n.transitions.length)
          },
          stateRoute: () => vj(xe()),
          replayRoute: (e, t = !1) => {
            let n = He()
            return yj(n, e ?? n.transitions.length, t)
          },
          router: _j(e.program),
        },
        send: Me,
        run: Ie,
        observeModel: Ne,
        readDiagnostics: () => re,
        observeDiagnostics: Pe,
        diagnostics: zy(s),
        readFailures: () => ie,
        observeFailures: Fe,
        failures: zy(c),
        ports: _.handles,
        initialization: Be,
        shutdown: Ve,
      }
    }),
  AM = () => ({ _tag: 'Fresh' }),
  jM = e => ({
    _tag: 'Model',
    model: e,
  }),
  MM = 'Development',
  NM = 'BottomRight',
  PM = 'TimeTravel',
  FM = e => (typeof e == 'string' ? e : e.production),
  IM = 20,
  LM = 500
Xv(['Update', 'View', 'Patch', 'SubscriptionDependencies'])
var RM = 'Development',
  zM = 16,
  BM = 4,
  VM = 8,
  HM = 2,
  UM = ['Update', 'View', 'Patch', 'SubscriptionDependencies'],
  WM = (e, t, n) =>
    zn(
      {
        thresholdMs: t,
        onSlow: n,
      },
      () => e,
    ),
  GM = (e, t) =>
    p(
      mb(e).pipe(
        hb(),
        gb(!1, () => O()),
        gb(ae, () => k({})),
        vb(e => k(e)),
      ),
      Ln(e => t(e.show ?? RM)),
      Pn(e => {
        let t = e.onSlow ?? ZM,
          n = e.measuredPhases ?? UM,
          r = e => Or(n, e)
        return {
          view: WM(r('View'), e.thresholdOverrides?.View ?? zM, t),
          update: WM(r('Update'), e.thresholdOverrides?.Update ?? BM, t),
          patch: WM(r('Patch'), e.thresholdOverrides?.Patch ?? VM, t),
          subscriptionDependencies: WM(
            r('SubscriptionDependencies'),
            e.thresholdOverrides?.SubscriptionDependencies ?? HM,
            t,
          ),
        }
      }),
    ),
  KM = (e, t) => {
    if (j(e)) {
      let e = performance.now()
      return [t(), k(performance.now() - e)]
    } else return [t(), O()]
  },
  qM = (e, t, n) => {
    if (j(e)) {
      let { thresholdMs: r, onSlow: i } = e.value,
        a = Ln(t, e => e > r)
      j(a) && i(n(a.value, r))
    }
  },
  JM = e =>
    p(
      e,
      zn(de),
      Fn(Zn('_tag')),
      M({
        onNone: () => 'unknown',
        onSome: String,
      }),
    ),
  YM = e =>
    M(e, {
      onNone: () => 'init',
      onSome: JM,
    }),
  XM =
    'Set slow.thresholdOverrides to change budgets or pass slow: false to disable warnings.',
  ZM = e => {
    let { durationMs: t, thresholdMs: n } = e,
      r = t.toFixed(1),
      i = mb(e).pipe(
        _b({
          View: ({ message: e }) =>
            `Slow view: ${r}ms (budget: ${n}ms), triggered by ${YM(e)}. Keep render-only work in the view path and memoize expensive subtrees with createLazy or createKeyedLazy.`,
          Update: ({ message: e }) =>
            `Slow update: ${r}ms (budget: ${n}ms), triggered by ${JM(e)}. Inspect the triggering Message branch; move render-only derivations to memoized views and keep update focused on state transitions.`,
          Patch: ({ message: e }) =>
            `Slow patch: ${r}ms (budget: ${n}ms), triggered by ${YM(e)}. Key mapped lists by stable ids, split large views, or memoize stable subtrees with createLazy.`,
          SubscriptionDependencies: ({ subscriptionKey: e }) =>
            `Slow subscription dependencies: ${r}ms (budget: ${n}ms) for subscription "${e}". Keep modelToDependencies a cheap projection from modeled fields; avoid scans, sorting, serialization, and large dependency objects.`,
        }),
      ),
      a = mb(e).pipe(
        hb(),
        _b({
          Update: ({ message: e }) => k(e),
          View: ({ message: e }) => e,
          Patch: ({ message: e }) => e,
          SubscriptionDependencies: () => O(),
        }),
      )
    console.warn(`[foldkit] ${i} ${XM}`, e, ...In(a))
  },
  QM = class extends di()('@foldkit/Dispatch') {},
  $M = /* @__PURE__ */ new WeakMap(),
  eN = () => {
    let { origin: e, pathname: t, search: n } = window.location
    return `${e}${t}${n}`
  },
  tN = /* @__PURE__ */ new WeakMap(),
  nN = () => {
    let e = tN.get(document)
    e === void 0 && ((e = {}), tN.set(document, e))
    let t = e.canonical
    ;(t === void 0 || t.parentNode !== document.head) &&
      ((t =
        document.head.querySelector('link[rel="canonical"]') ??
        document.head.appendChild(document.createElement('link'))),
      (e.canonical = t))
    let n = e.ogUrl
    return (
      (n === void 0 || n.parentNode !== document.head) &&
        ((n =
          document.head.querySelector('meta[property="og:url"]') ??
          document.head.appendChild(document.createElement('meta'))),
        (e.ogUrl = n)),
      {
        canonical: t,
        ogUrl: n,
      }
    )
  },
  rN = (e, t) => {
    if (!t || !document.body.contains(t)) return
    document.title !== e.title && (document.title = e.title)
    let n = e.canonical ?? eN(),
      r = e.ogUrl ?? n,
      i = nN()
    ;(i.canonical.getAttribute('rel') !== 'canonical' &&
      i.canonical.setAttribute('rel', 'canonical'),
      i.canonical.getAttribute('href') !== n &&
        i.canonical.setAttribute('href', n),
      i.ogUrl.getAttribute('property') !== 'og:url' &&
        i.ogUrl.setAttribute('property', 'og:url'),
      i.ogUrl.getAttribute('content') !== r &&
        i.ogUrl.setAttribute('content', r))
  },
  iN = (e, t, n, r, i) => {
    if ((console.error('[foldkit] Application crash:', e.error), t?.report))
      try {
        t.report(e)
      } catch (e) {
        console.error('[foldkit] crash.report failed:', e)
      }
    let a = xi(QM, rM).pipe(
      Si(Lb, {
        started: () => {},
        ended: () => {},
      }),
    )
    try {
      BS(rM.dispatchSync, a)
      let o
      try {
        o = t?.view ? t.view(e) : sM(e)
      } finally {
        VS()
      }
      let s = MS(r.maybeCurrentVNode, o.body, n)
      ;((r.maybeCurrentVNode = k(s)), i && rN(o, s.elm))
    } catch (t) {
      console.error('[foldkit] crash.view failed:', t)
      let o = t instanceof Error ? t : Error(String(t))
      BS(rM.dispatchSync, a)
      let s
      try {
        s = sM(e, o)
      } finally {
        VS()
      }
      let c = MS(r.maybeCurrentVNode, s.body, n)
      ;((r.maybeCurrentVNode = k(c)), i && rN(s, c.elm))
    }
  },
  aN = (e, t, n, r) => {
    let i =
      e.subscriptions === void 0
        ? void 0
        : Qn(e.subscriptions, (e, t) => ({
            ...e,
            modelToDependencies: n => {
              let [i, a] = KM(r, () => e.modelToDependencies(n))
              return (
                qM(r, a, (e, r) => ({
                  _tag: 'SubscriptionDependencies',
                  subscriptionKey: t,
                  model: n,
                  durationMs: e,
                  thresholdMs: r,
                })),
                i
              )
            },
          }))
    return {
      ...e,
      init: () => {
        let [n, r] = e.init()
        return [t(n), r]
      },
      restore: n => {
        let [r, i] = e.restore?.(n) ?? [n, []]
        return [t(r), i]
      },
      update: (r, i) => {
        let [[a, o], s] = KM(n, () => e.update(r, i)),
          c = t(a)
        return (
          qM(n, s, (e, t) => ({
            _tag: 'Update',
            previousModel: r,
            nextModel: c,
            message: i,
            durationMs: e,
            thresholdMs: t,
          })),
          [c, o]
        )
      },
      ...(i === void 0 ? {} : { subscriptions: i }),
    }
  },
  oN = {
    now: () => performance.now(),
    defer: e => {
      let t = new MessageChannel(),
        n = !0,
        r = () => {
          ;((n = !1), t.port1.close(), t.port2.close())
        }
      return (
        (t.port2.onmessage = () => {
          n && (r(), e())
        }),
        t.port1.postMessage(null),
        r
      )
    },
  },
  sN = e => e ?? du,
  cN = e => {
    let { container: t } = e
    if (t === null)
      throw Error(
        '[foldkit] Container is null. Make sure the element exists in the DOM before calling makeFoldkitApplication.',
      )
    let n = t.id
    if (n === '')
      throw Error(
        '[foldkit] Runtime container must have an `id` for HMR model preservation.',
      )
    let r = GM(e.slow, e =>
        mb(e).pipe(
          gb('Always', () => !0),
          gb('Development', () => !1),
          yb,
        ),
      ),
      i = Fn(r, ({ view: e }) => e),
      a = Fn(r, ({ update: e }) => e),
      o = Fn(r, ({ patch: e }) => e),
      s = Fn(r, ({ subscriptionDependencies: e }) => e),
      c = e.freezeModel !== !1 && !1,
      l = e.manageDocument && e.preserveScroll !== !1 && !1,
      u = e => (c ? cM(e) : e),
      d = aN(e.program, u, a, s),
      f = (r, a, s) =>
        vd(
          z(function* () {
            let c = vy(d.Model),
              f = oe(a) ? kv(c)(a) : O(),
              m = j(f)
                ? {
                    ...d,
                    restore: e => [u(e), []],
                  }
                : d,
              h = M(f, {
                onNone: () => e.start,
                onSome: jM,
              }),
              g = yield* kM({
                program: m,
                resources: e.resources,
                scheduling: oN,
                ...(h === void 0 ? {} : { start: h }),
                ...(e.journal === void 0 ? {} : { journal: e.journal }),
              }).pipe(sd)
            yield* M(r, {
              onNone: () => Gu,
              onSome: e =>
                yd(
                  R(() => e.bind(g.ports)),
                  () => R(e.unbind),
                ),
            })
            let _ = Av(Lv(d.Model)),
              v = Av(d.Message),
              ee = Nv(c)
            yield* vM(
              {
                onDebounce: e => R(() => (ee(e), void 0)),
                onFlush: e => R(() => (ee(e), void 0)),
              },
              ta(200),
            )
            let te = yield* fd(),
              ne = Qx(),
              re = { maybeCurrentVNode: O() }
            yield* bd(e =>
              Ml(e)
                ? M(re.maybeCurrentVNode, {
                    onNone: () => Gu,
                    onSome: e =>
                      R(() => {
                        let n = MS(k(e), null, t).elm
                        ;(n?.parentNode && n.parentNode.replaceChild(t, n),
                          t.replaceChildren())
                      }),
                  })
                : Gu,
            )
            let ie = [],
              ae = [],
              se = null,
              ce = O(),
              le = !1,
              ue = !1,
              de = !1,
              fe = !1,
              y = []
            ;(window.self, window.top)
            let pe = p(
                e.devTools ?? {},
                zn(e => e !== !1),
                Ln(e =>
                  mb(e.show ?? MM).pipe(
                    gb('Always', () => !0),
                    gb('Development', () => !1),
                    yb,
                  ),
                ),
              ),
              me = j(pe),
              b = {
                started: (e, t) => {
                  me &&
                    ie.push(
                      t === void 0
                        ? { name: e }
                        : {
                            name: e,
                            args: t,
                          },
                    )
                },
                ended: (e, t) => {
                  me &&
                    ae.push(
                      t === void 0
                        ? { name: e }
                        : {
                            name: e,
                            args: t,
                          },
                    )
                },
              },
              x = () => {
                let e = ie.slice(),
                  t = ae.slice()
                return (
                  (ie.length = 0),
                  (ae.length = 0),
                  {
                    starts: e,
                    ends: t,
                  }
                )
              },
              he = (e, t) => {
                if (!(ue || de)) {
                  if (fe) {
                    y.push({
                      message: e,
                      maybeSource: jn(t),
                    })
                    return
                  }
                  g.send(e, t === void 0 ? {} : { source: t })
                }
              },
              ge = () => {
                if (!(fe || ue || de))
                  for (; mr(y); ) {
                    let e = y
                    ;((y = []),
                      Lr(e, ({ message: e, maybeSource: t }) =>
                        g.send(
                          e,
                          M(t, {
                            onNone: () => ({}),
                            onSome: e => ({ source: e }),
                          }),
                        ),
                      ))
                  }
              },
              _e = {
                dispatchAsync: e => R(() => he(v(e))),
                dispatchSync: (e, t) => he(v(e), t),
              },
              ve = e.routing
            ve !== void 0 &&
              (yield* yd(
                R(() => Yj((e, t) => he(v(e), t), ve)),
                e => R(e),
              ))
            let ye = Si(Si(te, QM, _e), Lb, b),
              S = Si(Si(te, QM, rM), Lb, b),
              be = (n, r) =>
                R(() => {
                  if (ue || de) return
                  ;((de = !0), (y = []))
                  let i = bl(n)
                  iN(
                    {
                      error: i instanceof Error ? i : Error(String(i)),
                      model: g.readModel(),
                      message: r,
                    },
                    e.crash,
                    t,
                    re,
                    e.manageDocument,
                  )
                }),
              xe = (n, r) =>
                R(() => {
                  if (ue || de) return
                  let a = r === 'Inspecting',
                    s = a ? O() : i,
                    c = a ? O() : o
                  ;((fe = !0), a && qS())
                  try {
                    let [r, i] = KM(s, () => {
                      ;(oS(ne),
                        BS(
                          a ? rM.dispatchSync : _e.dispatchSync,
                          a ? S : ye,
                          ne,
                        ))
                      try {
                        return e.view(n)
                      } finally {
                        VS()
                      }
                    })
                    qM(s, i, (e, t) => ({
                      _tag: 'View',
                      model: n,
                      message: ce,
                      durationMs: e,
                      thresholdMs: t,
                    }))
                    let [o, l] = KM(c, () =>
                      MS(re.maybeCurrentVNode, r.body, t, ne.dedupeSeen),
                    )
                    ;((re.maybeCurrentVNode = k(o)),
                      qM(c, l, (e, t) => ({
                        _tag: 'Patch',
                        model: n,
                        message: ce,
                        durationMs: e,
                        thresholdMs: t,
                      })),
                      e.manageDocument && rN(r, o.elm))
                  } finally {
                    ;((fe = !1), a && JS())
                  }
                }),
              Se = () => xe(g.readModel(), 'Live'),
              Ce = () => {
                ;((le = !1),
                  !(ue || de || (se !== null && Ab(se.stateRef).isPaused)) &&
                    Nd(te)(
                      Se().pipe(
                        td(() => {
                          if (se === null) return Gu
                          let e = x()
                          return se.attachRenderedMounts(e.starts, e.ends)
                        }),
                        td(() => R(ge)),
                        od(e => be(e, ce)),
                      ),
                    ))
              },
              we = () => {
                !le && !ue && !de && ((le = !0), requestAnimationFrame(Ce))
              },
              Te = t => {
                if (e.onModel !== void 0)
                  try {
                    e.onModel(t)
                  } catch (e) {
                    console.error(
                      '[foldkit] A Foldkit host Model observer threw:',
                      e,
                    )
                  }
              },
              Ee = g.observeModel(e => {
                ;(Te(e), we())
              }),
              De = g.journal.observe(e => {
                ce = k(e.message)
              }),
              Oe = g.observeFailures(e => {
                Pd(be(e.cause, e.message))
              })
            ;(yield* bd(() =>
              R(() => {
                ;((ue = !0), (y = []), Ee(), De(), Oe())
              }),
            ),
              Te(g.readModel()))
            let ke = yield* nd(Se())
            if (jl(ke))
              return (yield* be(ke.cause, O()), yield* g.shutdown, yield* Ku)
            if (j(pe)) {
              let e = pe.value,
                t = x(),
                n = yield* Sj({
                  runtime: g,
                  bridge: {
                    render: e => xe(_(e), 'Inspecting'),
                    markRenderPending: R(we),
                  },
                  excludeFromHistory: e.excludeFromHistory ?? [],
                  ...(e.maxEntries === void 0
                    ? {}
                    : { maxEntries: Math.max(IM, Math.min(LM, e.maxEntries)) }),
                  initialMountStarts: t.starts,
                })
              ;((se = n),
                yield* M(jn(e.overlay), {
                  onNone: () => Gu,
                  onSome: t =>
                    t(n, e.position ?? NM, FM(e.mode ?? PM), jn(e.banner)),
                }))
            }
            ;(l && (yield* _M(n)),
              yield* R(ge),
              e.manageDocument && !s && (yield* R(() => nM())))
            let C = yield* nd(g.initialization)
            return (jl(C) && (yield* be(C.cause, O())), yield* Ku)
          }),
        ),
      m = {
        runtimeId: n,
        start: e => f(O(), e, !1),
        ports: e.program.ports,
      }
    return (
      $M.set(m, {
        startWith: f,
        isEmbedActive: !1,
        maybeActiveFiber: O(),
      }),
      m
    )
  },
  lN = e => {
    if (ae(e)) return
    let t = e.view
    return {
      ...(oe(t) && {
        view: e => ({
          title: '',
          body: t(e),
        }),
      }),
      ...(oe(e.report) && { report: e.report }),
    }
  }
function uN(e) {
  let { container: t } = e
  if (t === null)
    throw Error(
      '[foldkit] Container is null. Make sure the element exists in the DOM before calling makeElement (e.g. that your <div id="root"></div> has rendered, and your script runs after it).',
    )
  let n = 'Flags' in e,
    r = e.view,
    i = e => ({
      title: '',
      body: r(e),
    }),
    a = lN(e.crash),
    o = t.id,
    s = t =>
      Ik({
        id: o,
        version: 1,
        Model: e.Model,
        Message: e.Message,
        init: t,
        update: e.update,
        ...(e.subscriptions === void 0
          ? {}
          : { subscriptions: e.subscriptions }),
        ...(e.managedResources === void 0
          ? {}
          : { managedResources: e.managedResources }),
        ...(e.ports === void 0 ? {} : { ports: e.ports }),
      }),
    c
  if (n) {
    let t = e
    c = H(t.flags, e => s(() => t.init(e)))
  } else {
    let t = e
    c = R(() => s(t.init))
  }
  let l = (n, r, o) =>
      V(c, s => {
        let c = cN({
          program: s,
          resources: sN(e.resources),
          container: t,
          view: i,
          manageDocument: !1,
          ...(a === void 0 ? {} : { crash: a }),
          ...(e.devTools === void 0 ? {} : { devTools: e.devTools }),
          ...(e.journal === void 0 ? {} : { journal: e.journal }),
          ...(e.slow === void 0 ? {} : { slow: e.slow }),
          ...(e.freezeModel === void 0 ? {} : { freezeModel: e.freezeModel }),
        })
        return M(jn($M.get(c)), {
          onNone: () =>
            Yu(
              /* @__PURE__ */ Error(
                '[foldkit] The Foldkit renderer did not register its runtime internals.',
              ),
            ),
          onSome: e => e.startWith(n, r, o),
        })
      }),
    u = {
      runtimeId: o,
      start: e => l(O(), e, !1),
      ports: e.ports,
    }
  return (
    $M.set(u, {
      startWith: l,
      isEmbedActive: !1,
      maybeActiveFiber: O(),
    }),
    u
  )
}
;(Nv(uM), Nv(dM), Ov(fM))
var dN = new _a('async', e => {
    let t = !1
    return (
      queueMicrotask(() => {
        t || e()
      }),
      () => {
        t = !0
      }
    )
  }),
  fN = e => md(e, lu(ma, dN)),
  pN = e => L(void 0),
  mN = e => {
    let t = $M.get(e)
    if (ae(t))
      throw Error(
        '[foldkit] embed expects a program created by makeApplication or makeElement.',
      )
    if (t.isEmbedActive)
      throw Error(
        '[foldkit] This program is already embedded. Dispose the existing handle first, or create a separate program: each program owns one container.',
      )
    t.isEmbedActive = !0
    let n = Fk(e.ports),
      r = Md(
        fN(
          p(
            M(t.maybeActiveFiber, {
              onNone: () => Gu,
              onSome: e => id(Hm(e)),
            }),
            ed(pN(e.runtimeId)),
            V(e => t.startWith(k(n), e, !0)),
          ),
        ),
      )
    t.maybeActiveFiber = k(r)
    let i = !1
    return {
      ports: n.handles,
      dispose: () => {
        i || ((i = !0), n.dispose(), (t.isEmbedActive = !1), Md(Wm(r)))
      },
    }
  },
  hN = Fb('RecordingSegmentRoute', {
    recordingID: G.check(fy()),
    segmentRangeID: G.check(fy()),
  }),
  gN = Yv([hN, Fb('InvalidWordsRoute', { path: G })]),
  _N = p(Xk('recordingID'), rA(Xk('segmentRangeID')), nA(hN)),
  vN = e =>
    n(
      `${_N({
        recordingID: e.recordingID,
        segmentRangeID: e.segmentRangeID,
      })}/data.json`,
      'src/route.ts#dataPathForRoute',
    ),
  yN = gy.check(ly(0)),
  bN = K({
    id: G.check(fy()),
    text: G.check(fy()),
    start: yN,
    end: yN,
    speaker: Fv(Yv([G.check(fy()), gy])),
  }),
  xN = K({
    url: G.check(fy()),
    duration: Fv(yN),
    mimeType: Fv(G.check(fy())),
  }),
  SN = K({
    firstSegmentID: G.check(fy()),
    lastSegmentID: G.check(fy()),
  }),
  CN = K({
    version: Xv([1]),
    recordingID: G.check(fy()),
    segmentRangeID: G.check(fy()),
    range: SN,
    words: qv(bN),
    audio: xN,
  }),
  wN = q('NetworkWordsDataFailure', { reason: G }),
  TN = q('HttpWordsDataFailure', {
    status: J,
    statusText: G,
  }),
  EN = q('InvalidWordsDataFailure', { reason: G }),
  DN = q('MismatchedWordsDataFailure', {
    expectedRecordingID: G,
    expectedSegmentRangeID: G,
    actualRecordingID: G,
    actualSegmentRangeID: G,
  }),
  ON = q('InvalidWordsRouteFailure', { path: G }),
  kN = Yv([wN, TN, EN, DN, ON]),
  AN = q('LoadingWordsData', {}),
  jN = q('LoadedWordsData', { data: CN }),
  MN = q('FailedWordsData', { failure: kN }),
  NN = Yv([AN, jN, MN]),
  PN = q('WaitingPlayback', {}),
  FN = q('PausedPlayback', {}),
  IN = q('PlayingPlayback', {}),
  LN = q('EndedPlayback', {}),
  RN = q('InvalidAudioElement', { elementName: G }),
  zN = q('RejectedAudioOperation', {
    operation: Xv(['Play', 'Pause', 'Seek']),
    reason: G,
  }),
  BN = q('MediaAudioFailure', {
    code: J,
    reason: G,
  }),
  VN = Yv([RN, zN, BN]),
  HN = q('FailedPlayback', { failure: VN }),
  UN = K({
    route: gN,
    load: NN,
    playback: Yv([PN, FN, IN, LN, HN]),
    currentTime: yN,
    maybeDuration: py(yN),
  }),
  WN = (e, t) =>
    n(
      Er(e, e => n(t >= e.start && t < e.end, 'src/model.ts#anonymous')),
      'src/model.ts#activeWordAt',
    ),
  GN = e =>
    n(
      mb(e).pipe(
        hb(),
        _b({
          NetworkWordsDataFailure: ({ reason: e }) =>
            n(
              `The transcript request could not reach the server. ${e}`,
              'src/model.ts#NetworkWordsDataFailure',
            ),
          HttpWordsDataFailure: ({ status: e, statusText: t }) =>
            n(
              `The transcript request failed with HTTP ${e.toString()}${t === '' ? '' : ` ${t}`}.`,
              'src/model.ts#HttpWordsDataFailure',
            ),
          InvalidWordsDataFailure: ({ reason: e }) =>
            n(
              `The transcript response was invalid. ${e}`,
              'src/model.ts#InvalidWordsDataFailure',
            ),
          MismatchedWordsDataFailure: () =>
            n(
              'The transcript response identified a different recording or segment range.',
              'src/model.ts#MismatchedWordsDataFailure',
            ),
          InvalidWordsRouteFailure: () =>
            n(
              'Use /:recordingID/:segmentRangeID to open a transcript.',
              'src/model.ts#InvalidWordsRouteFailure',
            ),
        }),
      ),
      'src/model.ts#wordsDataFailureMessage',
    ),
  KN = e =>
    n(
      mb(e).pipe(
        hb(),
        _b({
          InvalidAudioElement: () =>
            n(
              'The playback adapter mounted on a non-audio element.',
              'src/model.ts#InvalidAudioElement',
            ),
          RejectedAudioOperation: ({ operation: e, reason: t }) =>
            n(
              `${e} was rejected by the browser. ${t}`,
              'src/model.ts#RejectedAudioOperation',
            ),
          MediaAudioFailure: ({ reason: e }) =>
            n(e, 'src/model.ts#MediaAudioFailure'),
        }),
      ),
      'src/model.ts#audioFailureMessage',
    ),
  qN = q('OpenedRoute', { route: gN }),
  JN = q('SucceededFetchWordsData', {
    route: hN,
    data: CN,
  }),
  YN = q('FailedFetchWordsData', {
    route: hN,
    failure: kN,
  }),
  XN = q('MountedAudioPlayer', { maybeDuration: py(yN) }),
  ZN = q('ObservedAudioTime', { seconds: yN }),
  QN = q('ObservedAudioDuration', { duration: yN }),
  $N = q('ObservedAudioPlaying', {}),
  eP = q('ObservedAudioPaused', {}),
  tP = q('ObservedAudioEnded', { seconds: yN }),
  nP = q('ObservedAudioFailure', { failure: VN }),
  rP = Yv([XN, ZN, QN, $N, eP, tP, nP]),
  iP = q('ClickedWord', { wordID: G }),
  aP = q('ScrubbedPlayback', { seconds: yN }),
  oP = q('ClickedJumpBackward', {}),
  sP = q('ClickedJumpForward', {}),
  cP = q('ClickedPlayPause', {}),
  lP = q('CompletedPlayAudio', {}),
  uP = q('CompletedPauseAudio', {}),
  dP = q('CompletedSeekAudio', { seconds: yN }),
  fP = q('FailedAudioControl', { failure: VN }),
  pP = Yv([
    qN,
    JN,
    YN,
    XN,
    ZN,
    QN,
    $N,
    eP,
    tP,
    nP,
    iP,
    aP,
    oP,
    sP,
    cP,
    lP,
    uP,
    dP,
    fP,
  ]),
  mP = class extends di()('Words/AudioPlayer') {},
  hP = e =>
    n(
      e instanceof Error ? e.message : globalThis.String(e),
      'src/audioPlayer.ts#unknownReason',
    ),
  gP = e =>
    n(
      {
        play: Vu({
          try: () => (
            e.ended && (e.currentTime = 0),
            n(e.play(), 'src/audioPlayer.ts#try')
          ),
          catch: e =>
            n(
              zN.make({
                operation: 'Play',
                reason: hP(e),
              }),
              'src/audioPlayer.ts#catch',
            ),
        }),
        pause: Xu({
          try: () => n(e.pause(), 'src/audioPlayer.ts#try~2'),
          catch: e =>
            n(
              zN.make({
                operation: 'Pause',
                reason: hP(e),
              }),
              'src/audioPlayer.ts#catch~2',
            ),
        }),
        seek: t =>
          n(
            Xu({
              try: () => {
                e.currentTime = t
              },
              catch: e =>
                n(
                  zN.make({
                    operation: 'Seek',
                    reason: hP(e),
                  }),
                  'src/audioPlayer.ts#catch~3',
                ),
            }),
            'src/audioPlayer.ts#seek',
          ),
      },
      'src/audioPlayer.ts#makeBrowserAudioPlayer',
    ),
  _P = e =>
    n(
      globalThis.Number.isFinite(e) && e >= 0 ? e : 0,
      'src/audioPlayer.ts#safeSeconds',
    ),
  vP = e =>
    n(
      globalThis.Number.isFinite(e.duration) && e.duration >= 0
        ? k(e.duration)
        : O(),
      'src/audioPlayer.ts#maybeDuration',
    ),
  yP = e => {
    let t = e.error?.code ?? 0,
      r = e.error?.message ?? 'The browser could not play this audio source.'
    return n(
      BN.make({
        code: t,
        reason: r,
      }),
      'src/audioPlayer.ts#mediaFailure',
    )
  },
  bP = e =>
    e instanceof HTMLAudioElement
      ? n(
          My(t =>
            n(
              yd(
                R(() => {
                  let r = {
                    timeUpdate: () =>
                      n(
                        Gh(t, ZN.make({ seconds: _P(e.currentTime) })),
                        'src/audioPlayer.ts#timeUpdate',
                      ),
                    durationChange: () =>
                      n(
                        Gh(
                          t,
                          QN.make({
                            duration: An(vP(e), () =>
                              n(0, 'src/audioPlayer.ts#anonymous~3'),
                            ),
                          }),
                        ),
                        'src/audioPlayer.ts#durationChange',
                      ),
                    playing: () =>
                      n(Gh(t, $N.make({})), 'src/audioPlayer.ts#playing'),
                    paused: () =>
                      n(Gh(t, eP.make({})), 'src/audioPlayer.ts#paused'),
                    ended: () =>
                      n(
                        Gh(t, tP.make({ seconds: _P(e.currentTime) })),
                        'src/audioPlayer.ts#ended',
                      ),
                    failed: () =>
                      n(
                        Gh(t, nP.make({ failure: yP(e) })),
                        'src/audioPlayer.ts#failed',
                      ),
                  }
                  return (
                    e.addEventListener('timeupdate', r.timeUpdate),
                    e.addEventListener('durationchange', r.durationChange),
                    e.addEventListener('loadedmetadata', r.durationChange),
                    e.addEventListener('play', r.playing),
                    e.addEventListener('pause', r.paused),
                    e.addEventListener('ended', r.ended),
                    e.addEventListener('error', r.failed),
                    Gh(t, XN.make({ maybeDuration: vP(e) })),
                    n(r, 'src/audioPlayer.ts#anonymous~2')
                  )
                }),
                t =>
                  n(
                    R(() => {
                      ;(e.removeEventListener('timeupdate', t.timeUpdate),
                        e.removeEventListener(
                          'durationchange',
                          t.durationChange,
                        ),
                        e.removeEventListener(
                          'loadedmetadata',
                          t.durationChange,
                        ),
                        e.removeEventListener('play', t.playing),
                        e.removeEventListener('pause', t.paused),
                        e.removeEventListener('ended', t.ended),
                        e.removeEventListener('error', t.failed))
                    }),
                    'src/audioPlayer.ts#anonymous~4',
                  ),
              ).pipe(V(() => n(Ku, 'src/audioPlayer.ts#anonymous~6'))),
              'src/audioPlayer.ts#anonymous',
            ),
          ),
          'src/audioPlayer.ts#observeAudioPlayer',
        )
      : n(
          Py(
            nP.make({
              failure: RN.make({ elementName: e.tagName.toLowerCase() }),
            }),
          ),
          'src/audioPlayer.ts#observeAudioPlayer',
        ),
  xP = class extends di()('Words/WordsDataClient') {},
  SP = e =>
    n(
      e instanceof Error ? e.message : globalThis.String(e),
      'src/dataClient.ts#unknownReason',
    ),
  CP = e => {
    let t = Fr(
      e,
      {
        maybePreviousStart: O(),
        maybeReason: O(),
      },
      (e, t) =>
        j(e.maybeReason)
          ? n(e, 'src/dataClient.ts#anonymous')
          : t.end <= t.start
            ? n(
                {
                  ...e,
                  maybeReason: k(`Word ${t.id} must end after it starts.`),
                },
                'src/dataClient.ts#anonymous',
              )
            : j(e.maybePreviousStart) && t.start < e.maybePreviousStart.value
              ? n(
                  {
                    ...e,
                    maybeReason: k('Words are not ordered by start time.'),
                  },
                  'src/dataClient.ts#anonymous',
                )
              : n(
                  {
                    maybePreviousStart: k(t.start),
                    maybeReason: O(),
                  },
                  'src/dataClient.ts#anonymous',
                ),
    )
    if (j(t.maybeReason))
      return n(t.maybeReason, 'src/dataClient.ts#timelineFailure')
    let r = Nr(e, e => n(e.id, 'src/dataClient.ts#anonymous~2'))
    return new Set(r).size === r.length
      ? n(O(), 'src/dataClient.ts#timelineFailure')
      : n(
          k('Word ids must be unique within a payload.'),
          'src/dataClient.ts#timelineFailure',
        )
  },
  wP = e => {
    let t = CP(e.words)
    if (j(t)) return n(t, 'src/dataClient.ts#semanticFailure')
    if (!e.audio.url.startsWith('/') || e.audio.url.startsWith('//'))
      return n(
        k('The audio URL must be an origin-relative path.'),
        'src/dataClient.ts#semanticFailure',
      )
    let r = e.audio.duration
    return r !== void 0 &&
      Ir(e.words, e => n(e.end > r, 'src/dataClient.ts#anonymous~3'))
      ? n(
          k('A word ends after the declared audio duration.'),
          'src/dataClient.ts#semanticFailure',
        )
      : n(O(), 'src/dataClient.ts#semanticFailure')
  },
  TP = (e, t) => {
    if (
      t.recordingID !== e.recordingID ||
      t.segmentRangeID !== e.segmentRangeID
    )
      return n(
        B(
          DN.make({
            expectedRecordingID: e.recordingID,
            expectedSegmentRangeID: e.segmentRangeID,
            actualRecordingID: t.recordingID,
            actualSegmentRangeID: t.segmentRangeID,
          }),
        ),
        'src/dataClient.ts#validateWordsData',
      )
    let r = wP(t)
    return j(r)
      ? n(
          B(EN.make({ reason: r.value })),
          'src/dataClient.ts#validateWordsData',
        )
      : n(L(t), 'src/dataClient.ts#validateWordsData')
  },
  EP = Tv(CN),
  DP = kv(CN),
  OP = e => {
    let t = DP(e)
    return A(t)
      ? n(O(), 'src/dataClient.ts#decodeWordsPayload')
      : n(A(wP(t.value)) ? t : O(), 'src/dataClient.ts#decodeWordsPayload')
  },
  kP = lu(
    xP,
    (e =>
      n(
        {
          fetch: t =>
            n(
              z(function* () {
                let r = yield* Vu({
                  try: () =>
                    n(
                      e(vN(t), { headers: { accept: 'application/json' } }),
                      'src/dataClient.ts#try',
                    ),
                  catch: e =>
                    n(wN.make({ reason: SP(e) }), 'src/dataClient.ts#catch'),
                })
                return r.ok
                  ? n(
                      yield* TP(
                        t,
                        yield* U(
                          EP(
                            yield* Vu({
                              try: () => n(r.json(), 'src/dataClient.ts#try~2'),
                              catch: e =>
                                n(
                                  EN.make({ reason: SP(e) }),
                                  'src/dataClient.ts#catch~2',
                                ),
                            }),
                          ),
                          e =>
                            n(
                              EN.make({ reason: e.message }),
                              'src/dataClient.ts#anonymous~5',
                            ),
                        ),
                      ),
                      'src/dataClient.ts#anonymous~4',
                    )
                  : n(
                      yield* B(
                        TN.make({
                          status: r.status,
                          statusText: r.statusText,
                        }),
                      ),
                      'src/dataClient.ts#anonymous~4',
                    )
              }),
              'src/dataClient.ts#fetch',
            ),
        },
        'src/dataClient.ts#makeWordsDataClient',
      ))(globalThis.fetch.bind(globalThis)),
  ),
  AP = 10,
  jP = sk(
    'FetchWordsData',
    { route: hN },
    JN,
    YN,
  )(({ route: e }) =>
    n(
      V(xP, t => n(t.fetch(e), 'src/update.ts#anonymous~2')).pipe(
        H(t =>
          n(
            JN.make({
              route: e,
              data: t,
            }),
            'src/update.ts#anonymous~3',
          ),
        ),
        ad(t =>
          n(
            L(
              YN.make({
                route: e,
                failure: t,
              }),
            ),
            'src/update.ts#anonymous~4',
          ),
        ),
      ),
      'src/update.ts#anonymous',
    ),
  ),
  MP = sk(
    'PlayAudio',
    lP,
    fP,
  )(
    V(mP, e => n(e.play, 'src/update.ts#anonymous~5')).pipe(
      rd(lP.make({})),
      ad(e => n(L(fP.make({ failure: e })), 'src/update.ts#anonymous~6')),
    ),
  ),
  NP = sk(
    'PauseAudio',
    uP,
    fP,
  )(
    V(mP, e => n(e.pause, 'src/update.ts#anonymous~7')).pipe(
      rd(uP.make({})),
      ad(e => n(L(fP.make({ failure: e })), 'src/update.ts#anonymous~8')),
    ),
  ),
  PP = sk(
    'SeekAudio',
    { seconds: gy.check(ly(0)) },
    dP,
    fP,
  )(({ seconds: e }) =>
    n(
      V(mP, t => n(t.seek(e), 'src/update.ts#anonymous~10')).pipe(
        rd(dP.make({ seconds: e })),
        ad(e => n(L(fP.make({ failure: e })), 'src/update.ts#anonymous~11')),
      ),
      'src/update.ts#anonymous~9',
    ),
  ),
  FP = (e, t) =>
    n(
      e._tag === 'RecordingSegmentRoute' &&
        e.recordingID === t.recordingID &&
        e.segmentRangeID === t.segmentRangeID,
      'src/update.ts#routeMatches',
    ),
  IP = e =>
    n(
      e.load._tag === 'LoadedWordsData' ? k(e.load.data) : O(),
      'src/update.ts#loadedData',
    ),
  LP = e => {
    if (j(e.maybeDuration))
      return n(e.maybeDuration, 'src/update.ts#maybeMaximumTime')
    let t = IP(e)
    return A(t)
      ? n(O(), 'src/update.ts#maybeMaximumTime')
      : n(
          Pn(yr(t.value.words), e => n(e.end, 'src/update.ts#anonymous~12')),
          'src/update.ts#maybeMaximumTime',
        )
  },
  RP = (e, t) => {
    let r = globalThis.Number.isFinite(t) && t > 0 ? t : 0,
      i = LP(e)
    return n(j(i) ? Math.min(r, i.value) : r, 'src/update.ts#clampTime')
  },
  zP = e =>
    n(
      mb(e.playback).pipe(
        hb(),
        _b({
          WaitingPlayback: e => n(e, 'src/update.ts#WaitingPlayback'),
          PausedPlayback: e => n(e, 'src/update.ts#PausedPlayback'),
          PlayingPlayback: e => n(e, 'src/update.ts#PlayingPlayback'),
          EndedPlayback: () => n(FN.make({}), 'src/update.ts#EndedPlayback'),
          FailedPlayback: e => n(e, 'src/update.ts#FailedPlayback'),
        }),
      ),
      'src/update.ts#playbackAfterSeeking',
    ),
  BP = (e, t) => {
    if (e.load._tag !== 'LoadedWordsData')
      return n([e, []], 'src/update.ts#seek')
    let r = RP(e, t)
    return n(
      [
        UN.make({
          ...e,
          currentTime: r,
          playback: zP(e),
        }),
        [PP({ seconds: r })],
      ],
      'src/update.ts#seek',
    )
  },
  VP = e =>
    n(
      UN.make({
        route: hN.make({
          recordingID: e.recordingID,
          segmentRangeID: e.segmentRangeID,
        }),
        load: jN.make({ data: e }),
        playback: PN.make({}),
        currentTime: 0,
        maybeDuration: jn(e.audio.duration),
      }),
      'src/update.ts#modelForData',
    ),
  HP = e =>
    n(
      mb(e).pipe(
        hb(),
        _b({
          RecordingSegmentRoute: e =>
            n(
              [
                UN.make({
                  route: e,
                  load: AN.make({}),
                  playback: PN.make({}),
                  currentTime: 0,
                  maybeDuration: O(),
                }),
                [jP({ route: e })],
              ],
              'src/update.ts#RecordingSegmentRoute',
            ),
          InvalidWordsRoute: ({ path: t }) =>
            n(
              [
                UN.make({
                  route: e,
                  load: MN.make({ failure: ON.make({ path: t }) }),
                  playback: PN.make({}),
                  currentTime: 0,
                  maybeDuration: O(),
                }),
                [],
              ],
              'src/update.ts#InvalidWordsRoute',
            ),
        }),
      ),
      'src/update.ts#init',
    ),
  UP = (e, t) =>
    n(
      mb(t).pipe(
        hb(),
        _b({
          OpenedRoute: ({ route: e }) => n(HP(e), 'src/update.ts#OpenedRoute'),
          SucceededFetchWordsData: ({ route: t, data: r }) =>
            n(
              FP(e.route, t) ? [VP(r), []] : [e, []],
              'src/update.ts#SucceededFetchWordsData',
            ),
          FailedFetchWordsData: ({ route: t, failure: r }) =>
            n(
              FP(e.route, t)
                ? [
                    UN.make({
                      ...e,
                      load: MN.make({ failure: r }),
                    }),
                    [],
                  ]
                : [e, []],
              'src/update.ts#FailedFetchWordsData',
            ),
          MountedAudioPlayer: ({ maybeDuration: t }) => {
            if (e.load._tag !== 'LoadedWordsData')
              return n([e, []], 'src/update.ts#MountedAudioPlayer')
            let r = j(t) ? t : e.maybeDuration
            return n(
              [
                UN.make({
                  ...e,
                  maybeDuration: r,
                  playback: FN.make({}),
                }),
                [],
              ],
              'src/update.ts#MountedAudioPlayer',
            )
          },
          ObservedAudioTime: ({ seconds: t }) =>
            n(
              e.load._tag === 'LoadedWordsData'
                ? [
                    UN.make({
                      ...e,
                      currentTime: RP(e, t),
                    }),
                    [],
                  ]
                : [e, []],
              'src/update.ts#ObservedAudioTime',
            ),
          ObservedAudioDuration: ({ duration: t }) => {
            if (e.load._tag !== 'LoadedWordsData')
              return n([e, []], 'src/update.ts#ObservedAudioDuration')
            let r = k(t),
              i = UN.make({
                ...e,
                maybeDuration: r,
              })
            return n(
              [
                UN.make({
                  ...i,
                  currentTime: RP(i, e.currentTime),
                  playback:
                    e.playback._tag === 'WaitingPlayback'
                      ? FN.make({})
                      : e.playback,
                }),
                [],
              ],
              'src/update.ts#ObservedAudioDuration',
            )
          },
          ObservedAudioPlaying: () =>
            n(
              e.load._tag === 'LoadedWordsData'
                ? [
                    UN.make({
                      ...e,
                      playback: IN.make({}),
                    }),
                    [],
                  ]
                : [e, []],
              'src/update.ts#ObservedAudioPlaying',
            ),
          ObservedAudioPaused: () =>
            e.load._tag !== 'LoadedWordsData' ||
            e.playback._tag === 'EndedPlayback'
              ? n([e, []], 'src/update.ts#ObservedAudioPaused')
              : n(
                  [
                    UN.make({
                      ...e,
                      playback: FN.make({}),
                    }),
                    [],
                  ],
                  'src/update.ts#ObservedAudioPaused',
                ),
          ObservedAudioEnded: ({ seconds: t }) => {
            if (e.load._tag !== 'LoadedWordsData')
              return n([e, []], 'src/update.ts#ObservedAudioEnded')
            let r = An(e.maybeDuration, () =>
              n(RP(e, t), 'src/update.ts#anonymous~13'),
            )
            return n(
              [
                UN.make({
                  ...e,
                  currentTime: r,
                  playback: LN.make({}),
                }),
                [],
              ],
              'src/update.ts#ObservedAudioEnded',
            )
          },
          ObservedAudioFailure: ({ failure: t }) =>
            n(
              [
                UN.make({
                  ...e,
                  playback: HN.make({ failure: t }),
                }),
                [],
              ],
              'src/update.ts#ObservedAudioFailure',
            ),
          ClickedWord: ({ wordID: t }) => {
            let r = IP(e)
            if (A(r)) return n([e, []], 'src/update.ts#ClickedWord')
            let i = Er(r.value.words, e =>
              n(e.id === t, 'src/update.ts#anonymous~14'),
            )
            return n(
              j(i) ? BP(e, i.value.start) : [e, []],
              'src/update.ts#ClickedWord',
            )
          },
          ScrubbedPlayback: ({ seconds: t }) =>
            n(BP(e, t), 'src/update.ts#ScrubbedPlayback'),
          ClickedJumpBackward: () =>
            n(BP(e, e.currentTime - AP), 'src/update.ts#ClickedJumpBackward'),
          ClickedJumpForward: () =>
            n(BP(e, e.currentTime + AP), 'src/update.ts#ClickedJumpForward'),
          ClickedPlayPause: () =>
            e.load._tag === 'LoadedWordsData'
              ? n(
                  mb(e.playback).pipe(
                    hb(),
                    _b({
                      WaitingPlayback: () =>
                        n([e, []], 'src/update.ts#WaitingPlayback~2'),
                      PausedPlayback: () =>
                        n([e, [MP()]], 'src/update.ts#PausedPlayback~2'),
                      PlayingPlayback: () =>
                        n([e, [NP()]], 'src/update.ts#PlayingPlayback~2'),
                      EndedPlayback: () =>
                        n(
                          [
                            UN.make({
                              ...e,
                              currentTime: 0,
                              playback: FN.make({}),
                            }),
                            [MP()],
                          ],
                          'src/update.ts#EndedPlayback~2',
                        ),
                      FailedPlayback: () =>
                        n([e, [MP()]], 'src/update.ts#FailedPlayback~2'),
                    }),
                  ),
                  'src/update.ts#ClickedPlayPause',
                )
              : n([e, []], 'src/update.ts#ClickedPlayPause'),
          CompletedPlayAudio: () =>
            n([e, []], 'src/update.ts#CompletedPlayAudio'),
          CompletedPauseAudio: () =>
            n([e, []], 'src/update.ts#CompletedPauseAudio'),
          CompletedSeekAudio: () =>
            n([e, []], 'src/update.ts#CompletedSeekAudio'),
          FailedAudioControl: ({ failure: t }) =>
            n(
              [
                UN.make({
                  ...e,
                  playback: HN.make({ failure: t }),
                }),
                [],
              ],
              'src/update.ts#FailedAudioControl',
            ),
        }),
      ),
      'src/update.ts#update',
    ),
  WP = { inbound: { audioObserved: Tk(rP) } },
  GP = Sk()(e =>
    n(
      {
        audio: Mk(WP.inbound.audioObserved, e =>
          n(e, 'src/program.ts#anonymous~2'),
        ),
      },
      'src/program.ts#anonymous',
    ),
  ),
  KP = e => {
    let t = Math.max(0, Math.floor(e)),
      r = Math.floor(t / 60),
      i = t % 60
    return n(
      `${r.toString()}:${i.toString().padStart(2, '0')}`,
      'src/view.ts#formatTime',
    )
  },
  qP = e =>
    j(e.maybeDuration)
      ? n(e.maybeDuration, 'src/view.ts#maybeDurationForModel')
      : e.load._tag === 'LoadedWordsData'
        ? n(
            Pn(yr(e.load.data.words), e => n(e.end, 'src/view.ts#anonymous')),
            'src/view.ts#maybeDurationForModel',
          )
        : n(O(), 'src/view.ts#maybeDurationForModel'),
  JP = e =>
    n(
      mb(e.playback).pipe(
        hb(),
        _b({
          WaitingPlayback: () => n('Preparing', 'src/view.ts#WaitingPlayback'),
          PausedPlayback: () => n('Play', 'src/view.ts#PausedPlayback'),
          PlayingPlayback: () => n('Pause', 'src/view.ts#PlayingPlayback'),
          EndedPlayback: () => n('Replay', 'src/view.ts#EndedPlayback'),
          FailedPlayback: () => n('Retry', 'src/view.ts#FailedPlayback'),
        }),
      ),
      'src/view.ts#playbackLabel',
    ),
  YP = e =>
    n(
      `${e.speaker === void 0 ? '' : `${e.speaker}, `}${e.text}, ${KP(e.start)}`,
      'src/view.ts#wordLabel',
    ),
  XP = (e, t) => {
    let r = ak(),
      i = j(t) && t.value === e.id,
      a = [
        r.AriaCurrent(i ? 'true' : 'false'),
        r.AriaLabel(YP(e)),
        r.Class(
          i
            ? 'words-example__word words-example__word--active'
            : 'words-example__word',
        ),
        r.Key(e.id),
        r.OnClick(iP.make({ wordID: e.id })),
        r.Title(YP(e)),
        r.Type('button'),
      ]
    return n(r.button(a, [e.text]), 'src/view.ts#wordView')
  },
  ZP = e => {
    let t = ak(),
      r = An(qP(e), () => n(0, 'src/view.ts#anonymous~2')),
      i = e.playback._tag === 'WaitingPlayback',
      a = e.playback._tag === 'PlayingPlayback'
    return n(
      t.div(
        [
          t.AriaLabel('Audio playback'),
          t.Class('words-example__controls'),
          t.Role('group'),
        ],
        [
          t.button(
            [
              t.AriaLabel('Jump backward 10 seconds'),
              t.Class('words-example__button'),
              t.Disabled(i),
              t.OnClick(oP.make({})),
              t.Type('button'),
            ],
            ['−10'],
          ),
          t.button(
            [
              t.AriaLabel(`${JP(e)} audio`),
              t.AriaPressed(a ? 'true' : 'false'),
              t.Class('words-example__button words-example__button--primary'),
              t.Disabled(i),
              t.OnClick(cP.make({})),
              t.Type('button'),
            ],
            [JP(e)],
          ),
          t.input([
            t.AriaLabel('Audio position'),
            t.AriaValuemax(r),
            t.AriaValuemin(0),
            t.AriaValuenow(e.currentTime),
            t.AriaValuetext(`${KP(e.currentTime)} of ${KP(r)}`),
            t.Class('words-example__scrubber'),
            t.Disabled(i),
            t.Max(r.toString()),
            t.Min('0'),
            t.OnInput(e =>
              n(
                aP.make({ seconds: globalThis.Number(e) }),
                'src/view.ts#anonymous~3',
              ),
            ),
            t.Step('0.01'),
            t.Type('range'),
            t.Value(e.currentTime.toString()),
          ]),
          t.output(
            [t.AriaLive('polite'), t.Class('words-example__time')],
            [`${KP(e.currentTime)} / ${KP(r)}`],
          ),
          t.button(
            [
              t.AriaLabel('Jump forward 10 seconds'),
              t.Class('words-example__button'),
              t.Disabled(i),
              t.OnClick(sP.make({})),
              t.Type('button'),
            ],
            ['+10'],
          ),
        ],
      ),
      'src/view.ts#controlsView',
    )
  },
  QP = e => {
    let t = ak()
    if (e.load._tag !== 'LoadedWordsData')
      return n(t.empty, 'src/view.ts#loadedView')
    let r = Pn(WN(e.load.data.words, e.currentTime), e =>
        n(e.id, 'src/view.ts#anonymous~4'),
      ),
      i = e.playback._tag === 'FailedPlayback' ? k(KN(e.playback.failure)) : O()
    return n(
      t.section(
        [t.AriaLabel('Recording transcript'), t.Class('words-example__panel')],
        [
          ZP(e),
          M(i, {
            onNone: () => n(t.empty, 'src/view.ts#onNone'),
            onSome: e =>
              n(
                t.p([t.Class('words-example__error'), t.Role('alert')], [e]),
                'src/view.ts#onSome',
              ),
          }),
          t.p(
            [t.Class('words-example__transcript')],
            Nr(e.load.data.words, e => n(XP(e, r), 'src/view.ts#anonymous~5')),
          ),
        ],
      ),
      'src/view.ts#loadedView',
    )
  },
  $P = e => {
    let t = ak()
    return n(
      mb(e.load).pipe(
        hb(),
        _b({
          LoadingWordsData: () =>
            n(
              t.p(
                [t.AriaLive('polite'), t.Class('words-example__status')],
                ['Loading transcript…'],
              ),
              'src/view.ts#LoadingWordsData',
            ),
          LoadedWordsData: () => n(QP(e), 'src/view.ts#LoadedWordsData'),
          FailedWordsData: ({ failure: e }) =>
            n(
              t.p([t.Class('words-example__error'), t.Role('alert')], [GN(e)]),
              'src/view.ts#FailedWordsData',
            ),
        }),
      ),
      'src/view.ts#contentView',
    )
  },
  eF = e => {
    let t = ak()
    return n(
      t.main(
        [t.Class('words-example')],
        [
          t.header(
            [t.Class('words-example__header')],
            [
              t.p([t.Class('words-example__eyebrow')], ['Clip transcript']),
              t.h1([], ['Read and listen word by word']),
            ],
          ),
          $P(e),
        ],
      ),
      'src/view.ts#view',
    )
  },
  tF = (e, t, r) =>
    n(
      uN({
        container: e,
        Model: UN,
        Message: pP,
        init: () => n([t, []], 'src/application.ts#init'),
        update: UP,
        subscriptions: GP,
        ports: WP,
        resources: mu(kP, lu(mP, gP(r))),
        view: eF,
      }),
      'src/application.ts#makeWordsApplication',
    ),
  nF =
    '\n.words-example {\n  --words-accent: #175f52;\n  --words-accent-soft: #dff4ee;\n  --words-border: #d8dedc;\n  --words-ink: #17211f;\n  --words-muted: #60706c;\n  color: var(--words-ink);\n  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n  margin: 0 auto;\n  max-width: 72rem;\n  padding: clamp(1rem, 4vw, 3rem);\n}\n.words-example * { box-sizing: border-box; }\n.words-example__header { margin-bottom: 1.5rem; }\n.words-example__eyebrow {\n  color: var(--words-accent);\n  font-size: 0.75rem;\n  font-weight: 750;\n  letter-spacing: 0.12em;\n  margin: 0 0 0.35rem;\n  text-transform: uppercase;\n}\n.words-example h1 {\n  font-size: clamp(1.55rem, 4vw, 2.5rem);\n  letter-spacing: -0.035em;\n  margin: 0;\n}\n.words-example__panel {\n  background: #fff;\n  border: 1px solid var(--words-border);\n  border-radius: 1.25rem;\n  box-shadow: 0 1rem 3rem rgb(23 33 31 / 0.08);\n  overflow: hidden;\n}\n.words-example__controls {\n  align-items: center;\n  background: #f7faf9;\n  border-bottom: 1px solid var(--words-border);\n  display: grid;\n  gap: 0.8rem;\n  grid-template-columns: auto auto minmax(7rem, 1fr) auto auto;\n  padding: 1rem;\n}\n.words-example__button {\n  align-items: center;\n  background: #fff;\n  border: 1px solid var(--words-border);\n  border-radius: 999px;\n  color: var(--words-ink);\n  cursor: pointer;\n  display: inline-flex;\n  font: inherit;\n  font-size: 0.875rem;\n  font-weight: 700;\n  justify-content: center;\n  min-height: 2.75rem;\n  min-width: 2.75rem;\n  padding: 0.55rem 0.9rem;\n}\n.words-example__button:hover:not(:disabled),\n.words-example__button:focus-visible {\n  border-color: var(--words-accent);\n  outline: 3px solid var(--words-accent-soft);\n}\n.words-example__button--primary {\n  background: var(--words-accent);\n  border-color: var(--words-accent);\n  color: #fff;\n  min-width: 5.5rem;\n}\n.words-example__button:disabled { cursor: not-allowed; opacity: 0.5; }\n.words-example__scrubber { accent-color: var(--words-accent); width: 100%; }\n.words-example__time {\n  color: var(--words-muted);\n  font-variant-numeric: tabular-nums;\n  min-width: 6.5rem;\n  text-align: center;\n}\n.words-example__transcript {\n  font-size: clamp(1.2rem, 2.8vw, 1.75rem);\n  line-height: 1.9;\n  margin: 0;\n  padding: clamp(1.2rem, 4vw, 2.5rem);\n}\n.words-example__word {\n  background: transparent;\n  border: 0;\n  border-radius: 0.35rem;\n  color: inherit;\n  cursor: pointer;\n  font: inherit;\n  margin: 0 0.14em 0.12em;\n  padding: 0.08em 0.16em;\n}\n.words-example__word:hover,\n.words-example__word:focus-visible { background: #edf2f0; outline: 2px solid var(--words-accent); }\n.words-example__word--active { background: var(--words-accent-soft); color: #0b4b40; }\n.words-example__status { color: var(--words-muted); margin: 0; padding: 2rem; }\n.words-example__error { color: #8c1c13; margin: 0; padding: 1rem 1.25rem; }\n.words-example__visually-hidden {\n  clip: rect(0 0 0 0);\n  clip-path: inset(50%);\n  height: 1px;\n  overflow: hidden;\n  position: absolute;\n  white-space: nowrap;\n  width: 1px;\n}\n@media (max-width: 42rem) {\n  .words-example__controls { grid-template-columns: repeat(4, 1fr); }\n  .words-example__scrubber { grid-column: 1 / -1; grid-row: 2; }\n  .words-example__time { grid-column: 1 / -1; grid-row: 3; justify-self: center; }\n}\n',
  rF = /* @__PURE__ */ new WeakMap(),
  iF = (e, t) => {
    let n = e.ownerDocument.querySelector('[nonce]'),
      r = n?.nonce || n?.getAttribute('nonce') || ''
    r !== '' && t.setAttribute('nonce', r)
  },
  aF = (e, t, r) => {
    try {
      let i = e.ownerDocument.createElement('div'),
        a = e.ownerDocument.createElement('style'),
        o = e.ownerDocument.createElement('div')
      ;((o.id = e.id === '' ? 'scribe-words-foldkit' : `${e.id}-foldkit`),
        (a.textContent = nF),
        iF(e, a),
        i.append(a, o))
      let s = mN(tF(o, VP(r), t)),
        c = Md(
          eb(bP(t), e =>
            n(
              R(() =>
                n(s.ports.audioObserved.send(e), 'src/public.ts#anonymous~2'),
              ),
              'src/public.ts#anonymous',
            ),
          ),
        )
      return n(
        k({
          container: i,
          mounted: {
            dispose: () => {
              ;(Md(Wm(c)), s.dispose())
            },
          },
        }),
        'src/public.ts#prepareMount',
      )
    } catch {
      return n(O(), 'src/public.ts#prepareMount')
    }
  },
  oF = ({ root: e, audio: t, payload: r }) => {
    if (!(e instanceof HTMLElement) || !(t instanceof HTMLAudioElement))
      return n(!1, 'src/public.ts#mountWordsExample')
    let i = OP(r)
    if (A(i)) return n(!1, 'src/public.ts#mountWordsExample')
    let a = aF(e, t, i.value)
    if (A(a)) return n(!1, 'src/public.ts#mountWordsExample')
    let o = rF.get(e)
    return (
      t.getAttribute('src') !== i.value.audio.url &&
        t.setAttribute('src', i.value.audio.url),
      e.replaceChildren(a.value.container),
      o?.dispose(),
      rF.set(e, a.value.mounted),
      n(!0, 'src/public.ts#mountWordsExample')
    )
  }
//#endregion
window.mountWordsExample = oF
