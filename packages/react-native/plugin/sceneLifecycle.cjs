'use strict'

// SCENE LIFE CYCLE
//
// An Expo config plugin: `"@foldkit/react-native/plugin/sceneLifecycle.cjs"`
// in an app's `plugins`. Beginning in iOS 27, an app built with the iOS 27
// SDK must adopt the scene-based life cycle or it fails to launch. Expo 57
// puts neither a scene manifest nor a scene delegate into an app; Expo 58's
// template does. This plugin adds both when the native project is
// generated, and leaves alone an app that already has them.
//
// Delete it, and its entry in each app's `plugins`, once the fork is on
// Expo 58.

const mark = '// foldkit: scene life cycle'

/**
 * The scene manifest Apple documents for an app with one window: one
 * window scene, delegated to the app's `SceneDelegate`.
 */
const sceneManifest = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
}

/**
 * An Info.plist with the scene manifest. One that already declares its
 * scenes comes back as it is.
 *
 * @example
 * ```js
 * withSceneManifest({ CFBundleName: 'App' }).UIApplicationSceneManifest // sceneManifest
 * ```
 */
const withSceneManifest = infoPlist =>
  infoPlist.UIApplicationSceneManifest === undefined
    ? { ...infoPlist, UIApplicationSceneManifest: sceneManifest }
    : infoPlist

// NOTE: The app delegate still makes the window and starts React Native,
// as Expo 57's template has it. The scene delegate only shows that window
// in the scene, and passes on what iOS tells a scene and no longer the app:
// links, activities, and the app coming to the front and leaving it. A link
// that starts the app cold reaches the app as a link event, not as its
// launch link.
const sceneDelegate = `${mark}
// Added by @foldkit/react-native. iOS 27 does not launch an app built with
// its SDK unless the app adopts the scene-based life cycle.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }
    let appWindow = (UIApplication.shared.delegate as? AppDelegate)?.window
    appWindow?.windowScene = windowScene
    appWindow?.makeKeyAndVisible()
    window = appWindow
    open(connectionOptions.urlContexts)
    connectionOptions.userActivities.forEach(resume)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    open(URLContexts)
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    resume(userActivity)
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    UIApplication.shared.delegate?.applicationDidBecomeActive?(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    UIApplication.shared.delegate?.applicationWillResignActive?(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    UIApplication.shared.delegate?.applicationDidEnterBackground?(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    UIApplication.shared.delegate?.applicationWillEnterForeground?(UIApplication.shared)
  }

  private func open(_ contexts: Set<UIOpenURLContext>) {
    let application = UIApplication.shared
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
      if let source = context.options.sourceApplication {
        options[.sourceApplication] = source
      }
      _ = application.delegate?.application?(application, open: context.url, options: options)
    }
  }

  private func resume(_ activity: NSUserActivity) {
    let application = UIApplication.shared
    _ = application.delegate?.application?(
      application,
      continue: activity,
      restorationHandler: { _ in })
  }
}
`

/**
 * An app delegate's Swift source with the scene delegate after it. A
 * source that already has a scene delegate comes back as it is, so
 * generating the project again adds nothing.
 *
 * @example
 * ```js
 * withSceneDelegate(appDelegateSwift).includes('class SceneDelegate') // true
 * ```
 */
const withSceneDelegate = appDelegate =>
  /\bclass\s+SceneDelegate\b/.test(appDelegate)
    ? appDelegate
    : `${appDelegate.trimEnd()}\n\n${sceneDelegate}`

/**
 * The config plugin: adds the scene manifest to the app's Info.plist and
 * the scene delegate to its app delegate's file.
 *
 * @example
 * ```json
 * { "expo": { "plugins": ["@foldkit/react-native/plugin/sceneLifecycle.cjs"] } }
 * ```
 */
const withSceneLifecycle = config => {
  const { withAppDelegate, withInfoPlist } = require(
    require.resolve('expo/config-plugins', {
      paths: [process.cwd(), __dirname],
    }),
  )
  return withAppDelegate(
    withInfoPlist(config, plist => ({
      ...plist,
      modResults: withSceneManifest(plist.modResults),
    })),
    delegate => {
      if (delegate.modResults.language !== 'swift') {
        throw new Error(
          'The scene life cycle plugin needs a Swift app delegate, as Expo generates.',
        )
      }
      return {
        ...delegate,
        modResults: {
          ...delegate.modResults,
          contents: withSceneDelegate(delegate.modResults.contents),
        },
      }
    },
  )
}

module.exports = withSceneLifecycle
module.exports.sceneManifest = sceneManifest
module.exports.withSceneManifest = withSceneManifest
module.exports.withSceneDelegate = withSceneDelegate
