// The settings of an Expo app that takes newer code over the air from its
// own server, signed.
//
// In the app's app.config.js:
//
//   const { withSignedUpdates } = require('@foldkit/react-native/plugin/signedUpdates.cjs')
//   module.exports = ({ config }) =>
//     withSignedUpdates(config, {
//       url: process.env.MY_UPDATES_URL,
//       certificate: process.env.MY_UPDATES_CERTIFICATE,
//       projectRoot: __dirname,
//     })
//
// `url` is where the app asks for its manifest (`foldkit-expo-updates serve`
// answers there) and `certificate` is the file of the code signing
// certificate whose private key that server signs with. Both come from the
// machine that builds, so neither a private address nor a key is written in
// a repository.
//
// The app asks on open and starts at once on the code it has; newer code is
// fetched in the background and runs from the next open, never while the
// app is in use. An update is for the native app it was built for: the
// runtime is the fingerprint of the native project, so code is never handed
// to an app whose native side differs. With no `url` the app has no
// updates. A `url` without a certificate, or not on https, is refused: the
// app would otherwise run whatever answered at that address.
const { relative } = require('node:path')

const withSignedUpdates = (config, { url, certificate, projectRoot }) => {
  if (url === undefined || url === '') {
    return { ...config, updates: { enabled: false } }
  }
  if (!url.startsWith('https://')) {
    throw new Error('signed updates: the address must be https')
  }
  if (certificate === undefined || certificate === '') {
    throw new Error(
      'signed updates: an address was given without a code signing certificate',
    )
  }
  return {
    ...config,
    runtimeVersion: { policy: 'fingerprint' },
    updates: {
      enabled: true,
      url,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      // NOTE: Expo reads this path from the project's folder.
      codeSigningCertificate: relative(projectRoot, certificate),
      codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
    },
  }
}

module.exports = { withSignedUpdates }
