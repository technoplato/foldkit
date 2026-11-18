const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../../..')
const config = getDefaultConfig(projectRoot)
const watched = config.watchFolders ?? []
config.watchFolders = [...watched, workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  foldkit: path.resolve(workspaceRoot, 'packages/foldkit'),
  '@foldkit/react': path.resolve(workspaceRoot, 'packages/react'),
  '@foldkit/react-native': path.resolve(workspaceRoot, 'packages/react-native'),
}

// The workspace's cores ship one entry for Node, which may spawn a
// process, and one for a browser, which a phone can run too. A phone asks
// for the browser's.
const isWorkspaceCore = moduleName =>
  /-example(\/|$)/.test(moduleName) || moduleName.startsWith('@foldkit/instant')

config.resolver.resolveRequest = (context, moduleName, platform) =>
  context.resolveRequest(
    isWorkspaceCore(moduleName)
      ? {
          ...context,
          unstable_conditionNames: [
            'browser',
            ...context.unstable_conditionNames,
          ],
        }
      : context,
    moduleName,
    platform,
  )

module.exports = config
