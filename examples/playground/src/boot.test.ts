// @vitest-environment happy-dom
import { Array, Option } from 'effect'
import { Catalog, Runtime } from 'foldkit'
import { BoundField, Slider, Tooltip } from 'foldkit/behavior'
import * as Declaration from 'foldkit/declaration'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { catalog } from './catalog'
import { makePlaygroundApp } from './main'
import { playgroundProps } from './partsProps'
import {
  AddTag,
  ClearSignature,
  PlaygroundCoreProgram,
  ResetPlaygroundAction,
  RunBurst,
  SelectTab,
  SetBio,
  SetDisplayName,
  SetRating,
  SetSlider,
  ToggleCheckbox,
  ToggleSwitch,
  applySyncedSliceToModel,
  encodeSyncedSliceJson,
  extractSyncedSlice,
  initialSyncedPlaygroundModel,
  playgroundCatalog,
} from './playgroundCore'
import { initialModel, stepBoundField, stepPart } from './state'

const dispatchTouchDrag = (
  element: Element,
  points: ReadonlyArray<Readonly<{ clientX: number; clientY: number }>>,
): void => {
  const maybeFirst = Array.head(points)
  if (Option.isNone(maybeFirst)) {
    return
  }
  const first = maybeFirst.value
  const rest = Array.drop(points, 1)
  element.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 7,
      pointerType: 'touch',
      clientX: first.clientX,
      clientY: first.clientY,
    }),
  )
  for (const point of rest) {
    element.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: 'touch',
        clientX: point.clientX,
        clientY: point.clientY,
      }),
    )
  }
  const last = Option.getOrElse(Array.last(rest), () => first)
  element.dispatchEvent(
    new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId: 7,
      pointerType: 'touch',
      clientX: last.clientX,
      clientY: last.clientY,
    }),
  )
}

describe('Playground live browser boot', () => {
  it('enforces mobile touch-action and 16px coarse-pointer input rules in CSS and HTML', () => {
    const css = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8')
    const html = readFileSync(
      resolve(import.meta.dirname, '..', 'index.html'),
      'utf8',
    )

    expect(html).toContain('viewport-fit=cover')
    expect(css).toContain('touch-action: manipulation;')
    expect(css).toContain('-webkit-tap-highlight-color: transparent;')
    expect(css).toContain('@media (pointer: coarse), (max-width: 768px)')
    expect(css).toContain('font-size: 16px;')
    expect(css).toContain('@media (hover: hover) and (pointer: fine)')

    // App-local touchMount.ts is deleted; zero raw DOM listeners in playground source.
    expect(existsSync(resolve(import.meta.dirname, 'touchMount.ts'))).toBe(
      false,
    )
    const srcFiles = [
      ...readdirSync(import.meta.dirname)
        .filter(name => /\.(ts|tsx)$/u.test(name) && !name.includes('.test.'))
        .map(name => resolve(import.meta.dirname, name)),
      ...readdirSync(resolve(import.meta.dirname, 'views'))
        .filter(name => /\.(ts|tsx)$/u.test(name))
        .map(name => resolve(import.meta.dirname, 'views', name)),
    ]
    for (const filePath of srcFiles) {
      const source = readFileSync(filePath, 'utf8')
      expect(source).not.toContain('addEventListener')
      expect(source).not.toContain('setPointerCapture')
    }
  })

  it('mounts all 54 cards via Runtime.embed and handles desktop & mobile touch gestures', async () => {
    document.body.innerHTML = ''
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    const handle = Runtime.embed(makePlaygroundApp(root))
    try {
      await vi.waitFor(
        () => {
          expect(document.body.textContent).toContain(
            'Foldkit Core UI Playground',
          )
        },
        { timeout: 3000 },
      )

      expect(document.body.textContent).toContain('54 / 54 Core Parts')

      for (const entry of catalog) {
        expect(document.getElementById(`part-${entry.key}`)).not.toBeNull()
      }

      // Zero inline font-size overrides on inputs/textareas/selects that could re-trigger iOS focus zoom.
      const formFields = globalThis.Array.from(
        document.body.querySelectorAll('input, textarea, select'),
      )
      expect(formFields.length).toBeGreaterThan(0)
      for (const field of formFields) {
        expect(field.getAttribute('style') ?? '').not.toContain('font-size')
      }

      // Theme switch + burst test
      const themeBtn = globalThis.Array.from(
        document.body.querySelectorAll('button'),
      ).find(btn => btn.textContent?.includes('Light Mode'))
      expect(themeBtn).toBeDefined()
      themeBtn?.click()
      await vi.waitFor(() => {
        expect(document.documentElement.getAttribute('data-fk-mode')).toBe(
          'Light',
        )
      })

      const burstBtn = globalThis.Array.from(
        document.body.querySelectorAll('button'),
      ).find(btn => btn.textContent?.includes('Run 16-Event Burst'))
      expect(burstBtn).toBeDefined()
      burstBtn?.click()
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain('Local: 16')
      })

      // Core Slot projections emit data-slot-drag, inputmode, enterkeyhint, and autocomplete
      expect(
        document
          .querySelector('#part-splitter .pg-split-wrap')
          ?.getAttribute('data-slot-drag'),
      ).toBe('horizontal')
      expect(
        document
          .querySelector('#part-colorPicker .pg-color-area')
          ?.getAttribute('data-slot-drag'),
      ).toBe('plane')
      expect(
        document
          .querySelector('#part-signaturePad svg')
          ?.getAttribute('data-slot-drag'),
      ).toBe('plane')
      const pinCell = document.querySelector('#part-pinInput input')
      expect(pinCell?.getAttribute('inputmode')).toBe('numeric')
      expect(pinCell?.getAttribute('autocomplete')).toBe('one-time-code')

      // Two-browser mobile touch tap-to-toggle on Tooltip:
      // 1) Chrome Android sequence: pointerdown(touch) -> pointermove(touch) -> focus -> click
      const tooltipCard = document.getElementById('part-tooltip')
      const tooltipTrigger = tooltipCard?.querySelector('button')
      expect(tooltipTrigger).not.toBeNull()
      tooltipTrigger?.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerType: 'touch',
        }),
      )
      tooltipTrigger?.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerType: 'touch',
        }),
      )
      tooltipTrigger?.dispatchEvent(new FocusEvent('focus'))
      // Focus after touch press must NOT prematurely open before click
      expect(tooltipCard?.querySelector('[role="tooltip"]')).toBeNull()
      tooltipTrigger?.click()
      await vi.waitFor(() => {
        expect(tooltipCard?.querySelector('[role="tooltip"]')).not.toBeNull()
      })
      // 2) iOS Safari sequence (no focus on button tap): pointerdown(touch) -> pointermove(touch) -> click
      tooltipTrigger?.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerType: 'touch',
        }),
      )
      tooltipTrigger?.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerType: 'touch',
        }),
      )
      tooltipTrigger?.click()
      await vi.waitFor(() => {
        expect(tooltipCard?.querySelector('[role="tooltip"]')).toBeNull()
      })
      // 3) Keyboard focus (without preceding pointerdown) opens Tooltip; blur closes it
      tooltipTrigger?.dispatchEvent(new FocusEvent('blur'))
      tooltipTrigger?.dispatchEvent(new FocusEvent('focus'))
      await vi.waitFor(() => {
        expect(tooltipCard?.querySelector('[role="tooltip"]')).not.toBeNull()
      })
      tooltipTrigger?.dispatchEvent(new FocusEvent('blur'))
      await vi.waitFor(() => {
        expect(tooltipCard?.querySelector('[role="tooltip"]')).toBeNull()
      })

      // Mobile touch tap-to-toggle on HoverCard
      const hoverCard = document.getElementById('part-hoverCard')
      const hoverTrigger = hoverCard?.querySelector('button')
      expect(hoverTrigger).not.toBeNull()
      hoverTrigger?.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerType: 'touch',
        }),
      )
      hoverTrigger?.click()
      await vi.waitFor(() => {
        expect(hoverCard?.textContent).toContain('Foldkit Core')
      })

      // Real finger stroke on #47 SignaturePad SVG
      const sigSvg = document.querySelector('#part-signaturePad svg')
      expect(sigSvg).not.toBeNull()
      if (sigSvg !== null) {
        vi.spyOn(sigSvg, 'getBoundingClientRect').mockReturnValue(
          new DOMRect(0, 0, 260, 104),
        )
        dispatchTouchDrag(sigSvg, [
          { clientX: 20, clientY: 20 },
          { clientX: 90, clientY: 55 },
          { clientX: 160, clientY: 40 },
        ])
        await vi.waitFor(() => {
          expect(
            document.getElementById('part-signaturePad')?.textContent,
          ).toContain('1 stroke(s)')
          expect(sigSvg.querySelectorAll('path').length).toBe(1)
        })
      }

      // Real finger rotation on #42 AngleSlider dial
      const dial = document.querySelector('#part-angleSlider .pg-dial')
      expect(dial).not.toBeNull()
      if (dial !== null) {
        const angleBefore = dial.getAttribute('aria-valuenow')
        vi.spyOn(dial, 'getBoundingClientRect').mockReturnValue(
          new DOMRect(0, 0, 84, 84),
        )
        dispatchTouchDrag(dial, [
          { clientX: 80, clientY: 42 },
          { clientX: 42, clientY: 80 },
        ])
        await vi.waitFor(() => {
          const angleAfter = dial.getAttribute('aria-valuenow')
          expect(angleAfter).not.toBe(angleBefore)
          expect(angleAfter).toBe('180')
        })
      }

      // Real finger drag on #43 ColorPicker 2D area
      const colorArea = document.querySelector(
        '#part-colorPicker .pg-color-area',
      )
      expect(colorArea).not.toBeNull()
      if (colorArea !== null) {
        vi.spyOn(colorArea, 'getBoundingClientRect').mockReturnValue(
          new DOMRect(0, 0, 200, 100),
        )
        const thumbBefore = colorArea
          .querySelector('.pg-color-thumb')
          ?.getAttribute('style')
        dispatchTouchDrag(colorArea, [
          { clientX: 40, clientY: 80 },
          { clientX: 180, clientY: 15 },
        ])
        await vi.waitFor(() => {
          const thumbAfter = colorArea
            .querySelector('.pg-color-thumb')
            ?.getAttribute('style')
          expect(thumbAfter).not.toBe(thumbBefore)
          expect(thumbAfter).toContain('left: 90%')
        })
      }

      // Real finger drag on #41 Splitter
      const splitterWrap = document.querySelector(
        '#part-splitter .pg-split-wrap',
      )
      expect(splitterWrap).not.toBeNull()
      if (splitterWrap !== null) {
        vi.spyOn(splitterWrap, 'getBoundingClientRect').mockReturnValue(
          new DOMRect(0, 0, 200, 64),
        )
        dispatchTouchDrag(splitterWrap, [
          { clientX: 80, clientY: 32 },
          { clientX: 140, clientY: 32 },
        ])
        await vi.waitFor(() => {
          expect(
            document.getElementById('part-splitter')?.textContent,
          ).not.toContain('40%⋮60%')
        })
      }

      // Backdrop scrim tap-to-dismiss on #2 Dialog and #26 Drawer
      const openDialogBtn = globalThis.Array.from(
        document.querySelectorAll<HTMLButtonElement>('#part-dialog button'),
      ).find(btn => btn.textContent?.includes('Open Modal Dialog'))
      openDialogBtn?.click()
      await vi.waitFor(() => {
        expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      })
      const dialogScrim = document.querySelector('.pg-overlay-scrim')
      expect(dialogScrim).not.toBeNull()
      dialogScrim?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await vi.waitFor(() => {
        expect(document.querySelector('[role="dialog"]')).toBeNull()
      })

      const openDrawerBtn = globalThis.Array.from(
        document.querySelectorAll<HTMLButtonElement>('#part-drawer button'),
      ).find(btn => btn.textContent?.includes('Open Slide Drawer'))
      openDrawerBtn?.click()
      await vi.waitFor(() => {
        expect(document.querySelector('.pg-drawer-sheet')).not.toBeNull()
      })
      const drawerScrim = document.querySelector('.pg-overlay-scrim')
      expect(drawerScrim).not.toBeNull()
      drawerScrim?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await vi.waitFor(() => {
        expect(document.querySelector('.pg-drawer-sheet')).toBeNull()
      })
    } finally {
      handle.dispose()
    }
  })

  it('declares Playground CLI Catalog cleanly and syncs 52 Parts while keeping Secrets & Hover Device-only', async () => {
    for (const declaration of Catalog.declarationsOf(playgroundCatalog)) {
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    }

    const baseCore = initialSyncedPlaygroundModel()
    const sampleMessages = [
      SetDisplayName({ name: 'Michael' }),
      SetBio({ bio: 'Synced live across web and CLI' }),
      SetSlider({ value: 88 }),
      ToggleSwitch(),
      ToggleCheckbox(),
      SelectTab({ tab: 'sync' }),
      SetRating({ rating: 5 }),
      AddTag({ tag: 'instantdb' }),
      ClearSignature(),
      RunBurst(),
      ResetPlaygroundAction(),
    ]
    expect(
      Catalog.undeclaredTouches(
        playgroundCatalog,
        PlaygroundCoreProgram.update,
        [baseCore],
        sampleMessages,
      ),
    ).toEqual([])

    // Verify Device-only isolation across extractSyncedSlice / applySyncedSliceToModel
    let deviceA = initialModel()
    deviceA = {
      ...deviceA,
      mode: 'Light',
      query: 'slider',
      isInspectorOpen: true,
    }
    deviceA = stepBoundField(
      deviceA,
      'apiToken',
      BoundField.ChangeFieldDraft({ value: 'sk_live_device_only_secret' }),
      100,
    )
    deviceA = stepPart(deviceA, 'tooltip', Tooltip.ShowTooltip(), 110)

    let deviceB = initialModel()
    deviceB = stepPart(
      deviceB,
      'slider',
      Slider.SetSliderValue({ value: 91 }),
      200,
    )
    deviceB = stepBoundField(
      deviceB,
      'displayName',
      BoundField.ChangeFieldDraft({ value: 'Synced Author' }),
      210,
    )
    deviceB = stepBoundField(
      deviceB,
      'displayName',
      BoundField.BlurField(),
      220,
    )
    const remoteSlice = extractSyncedSlice(deviceB, 3, 'device-b')
    expect(encodeSyncedSliceJson(remoteSlice)).not.toContain(
      'sk_live_device_only_secret',
    )

    const mergedOnA = applySyncedSliceToModel(deviceA, remoteSlice)
    expect(mergedOnA.parts.slider.values).toEqual([91])
    expect(mergedOnA.profile.profile.displayName).toBe('Synced Author')
    // Device-only state on A remains completely untouched!
    expect(mergedOnA.profile.profile.apiToken).toBe(
      deviceA.profile.profile.apiToken,
    )
    expect(BoundField.draftOf(mergedOnA.profileStates.apiToken)).toBe(
      'sk_live_device_only_secret',
    )
    expect(mergedOnA.parts.tooltip._tag).toBe('Open')
    expect(mergedOnA.mode).toBe('Light')
    expect(mergedOnA.query).toBe('slider')
    expect(mergedOnA.isInspectorOpen).toBe(true)

    // Verify live makePlaygroundApp({ sync: 'Memory' }) + Reset to Default button
    document.body.innerHTML = ''
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    const syncedHandle = Runtime.embed(
      makePlaygroundApp(root, { sync: 'Memory' }),
    )
    try {
      await vi.waitFor(() => {
        expect(
          document.querySelector('[data-testid="playground-sync-status"]')
            ?.textContent,
        ).toContain('InstantDB Live Sync')
      })

      const burstBtn = globalThis.Array.from(
        document.querySelectorAll('button'),
      ).find(btn => btn.textContent?.includes('Run 16-Event Burst'))
      burstBtn?.click()
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain('Local: 16')
      })

      const resetBtn = document.querySelector<HTMLButtonElement>(
        '[data-testid="playground-reset"]',
      )
      expect(resetBtn?.textContent).toContain('Reset to Default')
      resetBtn?.click()
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain('Local: 0')
      })
      const [defaultSlider] = Slider.chart.transition(
        Slider.initial,
        Slider.SetSliderValue({ value: 64 }),
        playgroundProps.slider,
      )
      expect(defaultSlider.values).toEqual([64])
    } finally {
      syncedHandle.dispose()
    }
  })
})
