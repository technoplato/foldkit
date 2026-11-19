import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

type GuardPlugin = Readonly<{
  schedulerGuardFile: string
  schedulerGuardSource: string
}>

const plugin: GuardPlugin = createRequire(import.meta.url)(
  '../../plugin/schedulerGuard.cjs',
)

describe('the guard React Native has against painting through a scheduler that is gone', () => {
  it('turns on the one flag, and keeps every other flag as the stable release has it', () => {
    expect(plugin.schedulerGuardSource).toContain(
      'bool enableSchedulerDelegateInvalidation() override',
    )
    expect(plugin.schedulerGuardSource).toContain(
      'public facebook::react::ReactNativeFeatureFlagsOverridesOSSStable',
    )
    expect(
      plugin.schedulerGuardSource.match(/\(\) override/g) ?? [],
    ).toHaveLength(1)
  })

  it('leaves an app alone that asks React Native for another release level', () => {
    expect(plugin.schedulerGuardSource).toContain('ReactNativeReleaseLevel')
  })

  it('does nothing where React Native no longer sets its flags that way', () => {
    expect(plugin.schedulerGuardSource).toContain('if (method == NULL)')
  })

  it('is one Objective-C++ file of the app, named for what it is', () => {
    expect(plugin.schedulerGuardFile).toBe('FoldkitSchedulerGuard.mm')
  })

  it('says which React Native makes it unnecessary', () => {
    expect(plugin.schedulerGuardSource).toContain(
      'enableSchedulerDelegateInvalidation defaults to true',
    )
  })
})
