// @vitest-environment happy-dom
import { Runtime } from 'foldkit'
import { describe, expect, it, vi } from 'vitest'

import { catalog } from './catalog'
import { makePlaygroundApp } from './main'

describe('Playground live browser boot', () => {
  it('mounts all 54 cards via Runtime.embed and handles live DOM clicks', async () => {
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

      const themeBtn = Array.from(
        document.body.querySelectorAll('button'),
      ).find(btn => btn.textContent?.includes('Light Mode'))
      expect(themeBtn).toBeDefined()
      themeBtn?.click()
      await vi.waitFor(() => {
        expect(document.documentElement.getAttribute('data-fk-mode')).toBe(
          'Light',
        )
      })

      const burstBtn = Array.from(
        document.body.querySelectorAll('button'),
      ).find(btn => btn.textContent?.includes('Run 16-Event Burst'))
      expect(burstBtn).toBeDefined()
      burstBtn?.click()
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain('Local: 16')
      })
    } finally {
      handle.dispose()
    }
  })
})
