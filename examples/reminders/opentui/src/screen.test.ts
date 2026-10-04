import { describe, expect, it } from 'bun:test'
import { Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import {
  App,
  type AppModel,
  LocalDay,
  ReachedDay,
  ReceivedBoard,
  sampleBoard,
  sampleListIds,
} from 'reminders-core-example'

import { paintOpenTuiNavigationFrame } from '@foldkit/opentui/interaction'
import { createTestRenderer } from '@opentui/core/testing'

const today = LocalDay.make('2026-10-07')

const testScreenSize = { width: 80, height: 28 }

const bindApp = () => {
  let model: AppModel = App.update(
    App.update(App.init()[0], ReceivedBoard({ board: sampleBoard(today) }))[0],
    ReachedDay({ today }),
  )[0]
  return Interaction.bind(App, {
    readModel: () => model,
    subscribe: () => () => {},
    send: message => {
      model = App.update(model, message)[0]
    },
    stop: () => Promise.resolve(),
  })
}

const paintedAt = async (uri: string): Promise<string> => {
  const bound = bindApp()
  bound.openUri(uri, Navigation.Link())
  const { renderer, renderOnce, captureCharFrame } =
    await createTestRenderer(testScreenSize)
  renderer.root.add(
    paintOpenTuiNavigationFrame(
      renderer,
      Option.getOrThrow(Navigation.frameOf(bound)),
      { onPress: () => {}, onChoose: () => {}, onDismiss: () => {} },
    ),
  )
  await renderOnce()
  const frame = captureCharFrame()
  renderer.destroy()
  return frame
}

describe('Reminders on OpenTUI', () => {
  it('paints a list with a box before each reminder, and Sort, List info, and Share', async () => {
    const frame = await paintedAt(`/reminders/lists/${sampleListIds.groceries}`)
    expect(frame).toContain('Groceries')
    expect(frame).toContain('[ New reminder ]')
    expect(frame).toMatch(/\[ \] +Oat milk/)
    expect(frame).toMatch(/⚙ Sort.*… List info.*↗ Share/)
  })

  it('paints the due dates over a reminder, each with its date', async () => {
    const frame = await paintedAt(
      `/reminders/lists/${sampleListIds.groceries}/reminder/00000000-0000-4000-8003-000000000001/due`,
    )
    expect(frame).toContain('Due date')
    expect(frame).toMatch(/Tomorrow +Thu, Oct 8, 9:00 AM/)
  })
})
