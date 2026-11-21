import { Array, Duration, Effect, Fiber, Option, Schema as S } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Avatar from './avatar.js'
import * as Block from './block.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: Avatar.Props = {
  id: 'profile',
  name: 'Ada Lovelace',
  src: Option.some('https://example.com/ada.png'),
}

const fold = (
  messages: ReadonlyArray<Avatar.Message>,
  props: Avatar.Props = baseProps,
  from: Avatar.State = Avatar.initial,
): Avatar.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Avatar.chart.transition(state, message, props)[0],
  )

describe('core Avatar Part', () => {
  describe('declaration, chart integrity, IDs, sync, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Avatar.part)).toEqual([])
      expect(Part.problemsOf(Avatar.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Avatar.make({ sync: 'OwnView' }))).toEqual([])
      expect(Block.problemsOf({ name: 'Avatar', chart: Avatar.chart })).toEqual(
        [],
      )

      for (const action of Avatar.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and sync tables', () => {
      expect(Avatar.rootId('profile')).toBe('profile-root')
      expect(Avatar.imageId('profile')).toBe('profile-image')
      expect(Avatar.fallbackId('profile')).toBe('profile-fallback')

      expect(Avatar.synced.SetAvatarSource).toEqual(Synced())
      expect(Avatar.synced.LoadedAvatarImage).toEqual(Synced())
      expect(Avatar.synced.FailedAvatarImage).toEqual(Synced())
      expect(Avatar.synced.ResetAvatar).toEqual(Synced())
      expect(Avatar.deviceSync('OwnView').SetAvatarSource).toEqual(
        Device({ because: 'OwnView' }),
      )
    })

    it('round-trips Idle, Loading, Loaded, and Error states through Effect Schema JSON encoding', () => {
      const loading = fold([
        Avatar.SetAvatarSource({ src: 'https://example.com/ada.png' }),
      ])
      const loaded = fold([Avatar.LoadedAvatarImage()], baseProps, loading)
      const failed = fold([Avatar.FailedAvatarImage()], baseProps, loaded)

      for (const state of [Avatar.initial, loading, loaded, failed]) {
        const encoded = S.encodeUnknownSync(Avatar.State)(state)
        const decoded = S.decodeUnknownSync(Avatar.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('initialsOf pure helper', () => {
    it('extracts deterministic uppercase initials from names', () => {
      expect(Avatar.initialsOf('Ada Lovelace')).toBe('AL')
      expect(Avatar.initialsOf('Grace Murray Hopper')).toBe('GH')
      expect(Avatar.initialsOf('Cher')).toBe('C')
      expect(Avatar.initialsOf('  alan   turing  ')).toBe('AT')
      expect(Avatar.initialsOf('')).toBe('')
      expect(Avatar.initialsOf('   ')).toBe('')
      expect(Avatar.initialsOf('Grace Murray Hopper', 3)).toBe('GMH')
      expect(Avatar.initialsOf('Ada Lovelace', 1)).toBe('A')
      expect(Avatar.initialsOf('Ada Lovelace', 0)).toBe('')
    })
  })

  describe('image loading lifecycle and fallbackDelayMs', () => {
    it('tracks Idle -> Loading -> Loaded -> Error -> Loaded recovery and Reset', () => {
      expect(Avatar.isIdle(Avatar.initial)).toBe(true)
      expect(Avatar.showImage(Avatar.initial)).toBe(false)
      expect(Avatar.showFallback(Avatar.initial)).toBe(true)

      const loading = fold([Avatar.StartedLoadingAvatar({})])
      expect(Avatar.isLoading(loading)).toBe(true)
      expect(Avatar.srcOf(loading)).toEqual(
        Option.some('https://example.com/ada.png'),
      )
      expect(Avatar.showImage(loading)).toBe(false)
      expect(Avatar.showFallback(loading)).toBe(true)

      const loaded = fold([Avatar.LoadedAvatarImage()], baseProps, loading)
      expect(Avatar.isLoaded(loaded)).toBe(true)
      expect(Avatar.showImage(loaded)).toBe(true)
      expect(Avatar.showFallback(loaded)).toBe(false)
      expect(Avatar.imageVisibilityOf(loaded)).toBe('visible')
      expect(Avatar.fallbackVisibilityOf(loaded)).toBe('hidden')

      const failed = fold([Avatar.FailedAvatarImage()], baseProps, loaded)
      expect(Avatar.isError(failed)).toBe(true)
      expect(Avatar.showImage(failed)).toBe(false)
      expect(Avatar.showFallback(failed)).toBe(true)

      // Late image load recovers from Error -> Loaded
      const recovered = fold([Avatar.LoadedAvatarImage()], baseProps, failed)
      expect(Avatar.isLoaded(recovered)).toBe(true)
      expect(Avatar.showImage(recovered)).toBe(true)

      // Empty SetAvatarSource returns to Idle
      const cleared = fold(
        [Avatar.SetAvatarSource({ src: '   ' })],
        baseProps,
        recovered,
      )
      expect(Avatar.isIdle(cleared)).toBe(true)

      const reset = fold([Avatar.ResetAvatar()], baseProps, recovered)
      expect(Avatar.isIdle(reset)).toBe(true)
      expect(Avatar.nameOf(reset, baseProps)).toBe('Ada Lovelace')
    })

    it('delays fallback visibility with WaitForAvatarFallbackDelay via TestClock and ignores stale versions', async () => {
      const delayedProps: Avatar.Props = {
        ...baseProps,
        fallbackDelayMs: 600,
      }
      const [loading, commands] = Avatar.chart.transition(
        Avatar.initial,
        Avatar.SetAvatarSource({ src: 'https://example.com/ada.png' }),
        delayedProps,
      )
      expect(Avatar.isLoading(loading)).toBe(true)
      expect(Avatar.showImage(loading)).toBe(false)
      expect(Avatar.showFallback(loading)).toBe(false)
      const waitCommand = Option.getOrThrow(Array.head(commands))
      expect(waitCommand.name).toBe('WaitForAvatarFallbackDelay')

      const elapsed = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(waitCommand.effect)
          yield* TestClock.adjust(Duration.millis(600))
          return yield* Fiber.join(fiber)
        }).pipe(Effect.provide(TestClock.layer())),
      )

      const revealed = fold([elapsed], delayedProps, loading)
      expect(Avatar.isLoading(revealed)).toBe(true)
      expect(Avatar.showFallback(revealed)).toBe(true)

      // Changing source bumps version so earlier delay completion is ignored
      const reloaded = fold(
        [Avatar.SetAvatarSource({ src: 'https://example.com/grace.png' })],
        delayedProps,
        loading,
      )
      expect(Avatar.showFallback(reloaded)).toBe(false)
      const afterStale = fold([elapsed], delayedProps, reloaded)
      expect(Avatar.showFallback(afterStale)).toBe(false)
    })

    it('atRest settles Loading back to Idle while preserving source', () => {
      const loading = fold([
        Avatar.SetAvatarSource({ src: 'https://example.com/ada.png' }),
      ])
      const rested = Avatar.atRest(loading)
      expect(Avatar.isIdle(rested)).toBe(true)
      expect(Avatar.srcOf(rested)).toEqual(
        Option.some('https://example.com/ada.png'),
      )
    })
  })

  describe('reference-stable SlotBindings and Part.compose', () => {
    it('projects Root, Image, and Fallback slots and preserves unchanged references', () => {
      const idleView = Part.view(Avatar.part, Avatar.initial, baseProps)
      const idleViewAgain = Part.view(Avatar.part, Avatar.initial, baseProps)
      expect(idleViewAgain).toBe(idleView)

      expect(Slot.ariaOf(idleView.slot('Root'))).toMatchObject({
        role: 'group',
        id: 'profile-root',
        'aria-label': 'Ada Lovelace',
      })
      expect(idleView.slot('Image').isHidden).toBe(true)
      expect(idleView.slot('Fallback').isHidden).toBeUndefined()

      const loaded = fold([
        Avatar.SetAvatarSource({ src: 'https://example.com/ada.png' }),
        Avatar.LoadedAvatarImage(),
      ])
      const loadedView = Part.view(Avatar.part, loaded, baseProps)
      expect(loadedView.slot('Root')).toBe(idleView.slot('Root'))
      expect(loadedView.slot('Image').isHidden).toBeUndefined()
      expect(loadedView.slot('Fallback').isHidden).toBe(true)
    })

    it('composes cleanly into a Program with Part.compose', () => {
      const Base = makeProgram({
        id: 'avatar-compose-test',
        version: 1,
        Model: S.Struct({ label: S.String }),
        Message: S.TaggedStruct('ChangedLabel', { label: S.String }),
        init: () => [{ label: 'Profile' }, []],
        update: (model, message) => [{ ...model, label: message.label }, []],
      })
      const App = Part.compose({
        of: Base,
        parts: [Part.given(Avatar.part, () => baseProps)],
      })
      const [initModel] = App.init()
      const [loadingModel] = App.update(
        initModel,
        Avatar.SetAvatarSource({ src: 'https://example.com/ada.png' }),
      )
      const [loadedModel] = App.update(loadingModel, Avatar.LoadedAvatarImage())
      expect(Avatar.showImage(loadedModel.parts['Avatar'])).toBe(true)
    })
  })
})
