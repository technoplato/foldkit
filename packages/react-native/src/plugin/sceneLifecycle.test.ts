import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

type ScenePlugin = Readonly<{
  sceneManifest: unknown
  withSceneManifest: (
    infoPlist: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>
  withSceneDelegate: (appDelegate: string) => string
}>

const plugin: ScenePlugin = createRequire(import.meta.url)(
  '../../plugin/sceneLifecycle.cjs',
)

const appDelegate = `internal import Expo
import React

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
}
`

describe('the scene life cycle iOS 27 asks of every app', () => {
  it('declares one window scene and its delegate, as Apple’s manifest does', () => {
    expect(plugin.withSceneManifest({ CFBundleName: 'App' })).toEqual({
      CFBundleName: 'App',
      UIApplicationSceneManifest: {
        UIApplicationSupportsMultipleScenes: false,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [
            {
              UISceneConfigurationName: 'Default Configuration',
              UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
            },
          ],
        },
      },
    })
  })

  it('leaves alone an app that already declares its scenes', () => {
    const own = { UIApplicationSceneManifest: { UISceneConfigurations: {} } }
    expect(plugin.withSceneManifest(own)).toBe(own)
  })

  it('adds a scene delegate that shows the window the app already made', () => {
    const source = plugin.withSceneDelegate(appDelegate)
    expect(source.startsWith(appDelegate.trimEnd())).toBe(true)
    expect(source).toContain(
      'class SceneDelegate: UIResponder, UIWindowSceneDelegate',
    )
    expect(source).toContain('.windowScene = windowScene')
    expect(source).toContain('makeKeyAndVisible()')
  })

  it('passes on what iOS now tells the scene and no longer the app: links, activities and coming and going', () => {
    const source = plugin.withSceneDelegate(appDelegate)
    for (const told of [
      'openURLContexts',
      'continue userActivity',
      'sceneDidBecomeActive',
      'sceneWillResignActive',
      'sceneDidEnterBackground',
      'sceneWillEnterForeground',
    ]) {
      expect(source).toContain(told)
    }
  })

  it('adds it once, however often the project is generated', () => {
    const once = plugin.withSceneDelegate(appDelegate)
    expect(plugin.withSceneDelegate(once)).toBe(once)
  })

  it('leaves alone an app that already has a scene delegate', () => {
    const own = `${appDelegate}\nclass SceneDelegate: ExpoAppSceneDelegate {}\n`
    expect(plugin.withSceneDelegate(own)).toBe(own)
  })
})
