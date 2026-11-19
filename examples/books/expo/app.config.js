// The Books app's settings: app.json, and over-the-air updates when the
// machine that builds names its updates server and that server's code
// signing certificate. Neither is written here: an address on a private
// network and a key's certificate belong to whoever builds.
const {
  withSignedUpdates,
} = require('@foldkit/react-native/plugin/signedUpdates.cjs')

module.exports = ({ config }) =>
  withSignedUpdates(config, {
    url: process.env.BOOKS_UPDATES_URL,
    certificate: process.env.BOOKS_UPDATES_CERTIFICATE,
    projectRoot: __dirname,
  })
