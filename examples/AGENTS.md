# Examples | Agent Notes

Hosted Foldkit examples on `*.knophy.com` authenticate with Cloudflare Access.
That is the WAN login for browsers and native apps. Do not add a second HTTP
auth scheme (Basic Auth, Caddy `basicauth`, app-owned OAuth) in front of a
hosted example.

`examples/auth` is a Foldkit session Program. It is not the knophy.com gate.

Access is identity. Instant is the data plane. Instant must consume Foldkit
Auth, not the other way around. Once Access has the Google email, the origin
behind Caddy signs that email into Instant automatically. The user does not
log in a second time.

## Cloudflare Access

One Access application covers every `*.knophy.com` host. Google login as
`halfjew22@gmail.com`. New example subdomains inherit that policy. Team domain:
`chimaeramedia.cloudflareaccess.com`.

Unauthenticated `curl` to a hosted example must 302 to Access, not 200 from the
origin. After Google login, the same JWT works on every subdomain until it
expires.

Canonical identity dump: `https://whoami.knophy.com` (JSON at `/api/me`). Claims
include `email`. That email is the Foldkit Auth subject.

Do not add Access Bypass policies unless the user asks.

## Headers

Browsers get `CF_Authorization` as a cookie after the Access Google login.

Native and API clients send the same JWT on each `*.knophy.com` request:

```
CF-Access-Token: <jwt>
Cookie: CF_Authorization=<jwt>
Authorization: Bearer <jwt>
```

Cloudflare injects `Cf-Access-Jwt-Assertion` toward the origin after Access
accepts the call. That assertion is the trusted identity at Caddy. Clients do
not set it. Origins bind `127.0.0.1` and are reached only through Caddy, so
they may take `email` from the injected assertion. Do not trust those headers
if the origin is ever bound to `0.0.0.0`.

Do not use service-token headers (`CF-Access-Client-Id` /
`CF-Access-Client-Secret`) for the Google identity.

## Knophy Access (Expo)

Voice transcripts that say "Nofi Access" mean Knophy Access.

Working Expo Client: `/Users/laptop/Development/knophy-access-expo`
(scheme `knophy-whoami`, bundle `com.knophy.whoami`). It demonstrates getting
the Access JWT and sending it as headers. It is not a Foldkit example and not
the Instant sign-in.

In-app login: open `https://whoami.knophy.com/mobile/start?redirect_uri=…`
(allowlisted custom scheme). Store the returned JWT and reuse it for every
`*.knophy.com` fetch, including the Instant mint endpoint below.

## Foldkit Auth

Foldkit Auth is core identity, not an Instant feature. Access headers are the
credential. The Model subject is the Access email (and later a stable subject
id derived from it). Commands load identity. Messages are facts such as
`SucceededAccessIdentity`. Side effects stay in Commands.

`@foldkit/instant` consumes that identity. Instant `$users` is a projection of
Foldkit Auth, not a second login. Instant permissions (`auth.email`, `auth.id`)
are the database boundary. Access does not protect Instant websocket traffic.

Intended hosted flow:

1. Cloudflare Access Google login yields a JWT whose claims include `email`.
2. The Client presents that JWT as the headers above. Browsers send the cookie
   automatically on same-origin fetches.
3. A trusted origin behind Caddy reads `Cf-Access-Jwt-Assertion` or
   `Cf-Access-Authenticated-User-Email`, takes `email`, and calls Instant Admin
   `createToken({ email })` at `/__foldkit/hosted-identity/session`. The admin
   token never leaves the origin.
4. The Client calls Instant `signInWithToken` with the minted refresh token.
   Instant `$users` is that Access email. No magic code, no Instant Google
   OAuth, no guest row for hosted knophy identity.

Mint on the Instant app that example uses. Each product has its own Instant
app (`~/.config/<product>-knophy/instant.env`). `whoami.knophy.com` dumps
Access claims. It does not mint Instant tokens for other apps.

Status: Access headers, the Expo credential Client, Foldkit hosted-identity
minting, and Instant `signInWithToken` are wired. Hosted Instant examples
acquire Access identity in the Client resources Layer before subscriptions
start. Local preview without Access still allows guest sign-in where that
Client already had it (books). `@foldkit/instant` Auth includes
`signInWithToken`. The origin keeps `INSTANT_APP_ADMIN_TOKEN` for minting and
never prefixes it `VITE_`.

## Non-web Clients (CLI, TUI, Expo)

Browsers send the Access cookie automatically on same-origin mint fetches.
CLI, TUI, and Expo do not. They present the same JWT as request headers and
mint against the public origin (`https://ideas.knophy.com`, and so on).

`@foldkit/instant` helpers:

- `accessRequestHeaders(jwt)` builds `Authorization`, `CF-Access-Token`, and
  `Cookie: CF_Authorization`.
- `accessTokenFromEnv` reads `CF_AUTHORIZATION`, `CF_ACCESS_TOKEN`, or
  `KNOPHY_ACCESS_TOKEN`.
- `accessTokenFromCallbackUrl` reads `cf_authorization` from a Knophy Access
  redirect.
- `knophyAccessStartUrl(redirectUri)` opens `whoami.knophy.com/mobile/start`.
- `withHostedIdentity(resources, database, { accessToken, sessionOrigin })`
  merges mint into the Client resources Layer. Runtime and React acquire that
  Layer before subscriptions start.
- `hostedIdentityLayer(database, options)` is the same acquire without a
  product service. Use it when the host has no resources Layer to merge.
- `ensureHostedInstantSession` is the mid-session primitive after a Client
  already started, for example an Expo Access button.

CLI and TUI: export the JWT, then run the usual Instant env wrapper.

```
export CF_AUTHORIZATION="$(cat ~/.config/knophy-access/token)"
# optional override; ideas/transcribe/orbit default to their knophy host
export FOLDKIT_HOSTED_IDENTITY_ORIGIN=https://ideas.knophy.com
```

Without a JWT, those hosts do not call the Access-gated WAN mint. Public-read
catalogs still load unsigned.

Expo: Sign in with Access stores the JWT and mints against the product origin.
`EXPO_PUBLIC_HOSTED_IDENTITY_ORIGIN` overrides the default. Instant-counter
has no default origin; set that env to a host that mints for the same Instant
app. Redirect schemes `knophy-ideas`, `knophy-transcribe`,
`foldkit-instant-counter`, and Expo `exp` are allowlisted on whoami.

Do not:

- Prompt Instant magic codes or Instant Google OAuth on a hosted knophy
  example once Access has already identified the user.
- Put `INSTANT_APP_ADMIN_TOKEN` in a browser, Expo app, or public env.
- Treat `examples/auth` as this gate.
- Invent a second IdP in Caddy or in the example origin.

## Publishing an example

Use the global `/host` skill. The origin must be a KeepAlive LaunchAgent bound
to `127.0.0.1`. Routing is one Caddyfile site block. Do not add hostnames to
`~/.cloudflared/config.yml`.
