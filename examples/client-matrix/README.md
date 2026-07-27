# Client Matrix

The Client Matrix derives four Multiple Counters screen modes from the shared
Navigation union and route parser-printer. It compares those modes across eight
real client surfaces. Every cell shows the client carrier and a checked-in
capture of that client rendering the same canonical application state.

The React and Foldkit captures open their public browser clients in an
interactive iframe inside the selected cell. The live client starts from that
cell's exact portable URI and can navigate independently until **Return to
capture** closes it. Expo Web captures link to its public browser carrier. Expo
iOS and Android captures link to the corresponding `foldkit://showcase` deep
link. Terminal, TUI, and raw CLI cells remain capture evidence with their
reproducible launch command.

The matrix is published at `https://matrixdemo.knophy.com`. Its browser carriers
use `https://countersdemo.knophy.com`, `https://foldkitdemo.knophy.com`, and
`https://expodemo.knophy.com`. Native custom-scheme links require an installed
development or production build. Expo Go does not register the Showcase's
`foldkit` scheme.

Run it with:

```sh
pnpm dev:example:client-matrix
```

The orientation control switches between screen modes as rows and clients as
rows. Selecting a mode updates the live Navigation, application Model, portable
URI, and presentation destination inspector. Opening an embedded client also
selects its originating mode, which keeps the inspector aligned with the
iframe's initial deep link.
