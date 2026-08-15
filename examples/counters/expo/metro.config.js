const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

const nodeOnlyModules = new Set([
  '@instantdb/admin',
  'crypto',
  'fs',
  'fs/promises',
  'node:crypto',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:os',
  'node:path',
  'node:url',
  'path',
])

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (nodeOnlyModules.has(moduleName)) {
    return { type: 'empty' }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
