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
}

module.exports = config
