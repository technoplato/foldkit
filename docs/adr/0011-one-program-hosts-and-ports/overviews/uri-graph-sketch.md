# URI graph as static data — sketch (2026-08-26, superseded in part)

Their goal: the application as a statically declared URI graph,
framework-agnostic, root `/` = the Program's own namespace, composition
by mount (child `/` becomes `/counter/<id>` in the parent), ADTs so
impossible states are impossible; app Model = domain + navigation +
runtime context.

Kept from this sketch: mount law and typed prefixes
(`schemaSegment(CounterId)`); parent root stays List (no auto-forward:
selection is Model truth expressed by being at the mounted destination);
URI never stored (`uri === print(top of stack)`); branded CounterId;
session gate wraps; derives into the shipped seam (ProgramNavigation,
HistoryPort, makeUriSync).

Killed in review: "modes". Settings-style places are routes; fine-grained
edit machines are Model ADTs, not URIs. See
`q118-canonical-counter-gallery.md`.
