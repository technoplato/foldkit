'use strict'

// SCHEDULER GUARD
//
// An Expo config plugin: `"@foldkit/react-native/plugin/schedulerGuard.cjs"`
// in an app's `plugins`. React Native 0.86 can paint through a scheduler
// whose delegate is already gone, when the React instance is torn down
// while a paint is queued, and the app stops with a bad memory access. It
// has a guard for that behind the feature flag
// `enableSchedulerDelegateInvalidation`, which the stable release level
// leaves off. This plugin adds one Objective-C++ file to the app that turns
// that one flag on and leaves every other flag as the stable release has it.
//
// Delete it, and its entry in each app's `plugins`, once the React Native
// the fork uses has enableSchedulerDelegateInvalidation defaults to true
// in its stable release level (it is false in 0.86.2 and true only in the
// experimental level there).

const schedulerGuardFile = 'FoldkitSchedulerGuard.mm'

const schedulerGuardSource = `// foldkit: scheduler guard
// Added by @foldkit/react-native. Delete once the React Native in use has
// enableSchedulerDelegateInvalidation defaults to true in its stable level.
#import <Foundation/Foundation.h>
#import <objc/runtime.h>

#include <memory>

#include <react/featureflags/ReactNativeFeatureFlags.h>
#include <react/featureflags/ReactNativeFeatureFlagsOverridesOSSStable.h>

namespace {

// Every flag as the stable release has it, and the one guard on.
class FoldkitStableFlagsWithSchedulerGuard
    : public facebook::react::ReactNativeFeatureFlagsOverridesOSSStable {
 public:
  bool enableSchedulerDelegateInvalidation() override
  {
    return true;
  }
};

bool FoldkitAppAsksForStableLevel()
{
  id level = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"ReactNativeReleaseLevel"];
  return ![level isKindOfClass:[NSString class]] ||
      [[(NSString *)level lowercaseString] isEqualToString:@"stable"];
}

} // namespace

// React Native's factory sets its flags once, in the method named below,
// before anything reads one. For an app on the stable level, that one call
// is given these flags instead. An app on another level, or a React Native
// that no longer has the method, is left as it is.
__attribute__((constructor)) static void FoldkitInstallSchedulerGuard(void)
{
  if (!FoldkitAppAsksForStableLevel()) {
    return;
  }
  Class factory = NSClassFromString(@"RCTReactNativeFactory");
  SEL selector = NSSelectorFromString(@"_setUpFeatureFlags:");
  Method method = factory == Nil ? NULL : class_getInstanceMethod(factory, selector);
  if (method == NULL) {
    return;
  }
  IMP guarded = imp_implementationWithBlock(^(__unused id factoryInstance, __unused NSInteger releaseLevel) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
      facebook::react::ReactNativeFeatureFlags::override(
          std::make_unique<FoldkitStableFlagsWithSchedulerGuard>());
      NSLog(@"foldkit: React Native scheduler guard is on");
    });
  });
  method_setImplementation(method, guarded);
}
`

/**
 * The config plugin: writes the guard's file into the app's native
 * project and adds it to the app's sources. Generating the project again
 * writes the same file and adds it once.
 *
 * @example
 * ```json
 * { "expo": { "plugins": ["@foldkit/react-native/plugin/schedulerGuard.cjs"] } }
 * ```
 */
const withSchedulerGuard = config => {
  const fs = require('node:fs')
  const path = require('node:path')
  const { IOSConfig, withDangerousMod, withXcodeProject } = require(
    require.resolve('expo/config-plugins', {
      paths: [process.cwd(), __dirname],
    }),
  )
  const written = withDangerousMod(config, [
    'ios',
    modded => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(
        modded.modRequest.projectRoot,
      )
      fs.writeFileSync(
        path.join(
          modded.modRequest.platformProjectRoot,
          projectName,
          schedulerGuardFile,
        ),
        schedulerGuardSource,
      )
      return modded
    },
  ])
  return withXcodeProject(written, modded => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(
      modded.modRequest.projectRoot,
    )
    const filepath = `${projectName}/${schedulerGuardFile}`
    if (!modded.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: modded.modResults,
      })
    }
    return modded
  })
}

module.exports = withSchedulerGuard
module.exports.schedulerGuardFile = schedulerGuardFile
module.exports.schedulerGuardSource = schedulerGuardSource
