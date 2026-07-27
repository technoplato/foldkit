# Client matrix contract

## Taxonomy

Use `Client` as the umbrella term for one runnable Program adapter. Do not use
`medium` as a catch-all.

| Axis                | Meaning                               | Examples                                                            |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| Interaction surface | How a person or caller interacts      | Graphical, Terminal UI, line terminal, one-shot CLI, server request |
| Renderer            | Presentation technology               | React, Foldkit view, React Native, OpenTUI React, text, none        |
| Platform            | Execution environment                 | Web, Node, iOS, Android, server                                     |
| Host                | Composition and launch owner          | Vite app, Expo app, Effect Platform process, server process         |
| URI carrier         | Host wrapper around the portable path | HTTPS URL, custom-scheme URL, command-line argument, request URL    |

Expo is a host and toolchain. React Native is a renderer and runtime. iOS,
Android, web, and Node are platforms. GUI and TUI are interaction surfaces.

## Portable route laws

For every state, replay, or intent router, test:

```text
parse(print(value)) = value
print(parse(uri)) = canonicalize(uri)
canonicalize(canonicalize(uri)) = canonicalize(uri)
```

The parser must consume the complete relevant relative path and query. Every
printable value has one canonical URI. Hosts may accept aliases, but they print
one canonical ordering and spelling.

## Matrix cell contract

Every matrix cell carries:

- canonical Program identity and version;
- state, replay frame, or domain intent identity;
- portable relative URI;
- complete client carrier or reproducible launch command;
- current capability: implemented, adapter-ready, Program-only, planned, or
  explicitly unsupported;
- evidence: focused test, automated capture, source inspection, simulator,
  emulator, physical device, or no evidence;
- limitation and next missing seam;
- screenshot or text capture when the client renders output.

Do not reuse one renderer's screenshot as evidence for another. A representative
image may illustrate client identity only when it is labeled as representative
and not as proof of the current domain or route.

## Intent intake

A domain intent URI such as:

```text
/wallet/intent/send/eth?mode=testnet&amount=1000000000000000&to=0x...
```

parses into a typed value. It does not send money. The Client supplies that
value as startup input or a factual Message. update decides whether to compose
a draft, request a preview, or reject the capability, and then returns the
finite Commands. Unsupported live or mainnet intents must not silently fall
back to a test Layer.

## Image protocol

Generate an image from a real client at a named Program state and portable URI.
Record the capture command, dimensions, platform, client, and evidence date.
Keep stable file names derived from state and client identifiers. Verify alt
text, aspect ratio, broken links, and horizontal overflow in the matrix app.
