import {
  l as a,
  s as c,
  a as e,
  i,
  t as l,
  d as n,
  p as o,
  f as r,
  r as s,
  c as t,
  u,
} from './html-dwW1BOoC.js'

n(
  u({
    container: document.getElementById(`root`),
    devTools: { overlay: s },
    program: i,
    resources: t,
    view: t => {
      let n = r()
      return o(
        {
          title: c,
          body: n.main(
            [
              n.Class(
                `gate-screen min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6`,
              ),
            ],
            [l(e(t), a)],
          ),
        },
        `src/view.ts#view`,
      )
    },
  }),
)
