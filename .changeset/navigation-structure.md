---
'foldkit': minor
---

Add `foldkit/navigation/structure` for state-driven presentation stacks.
A NavigationStack pairs one root destination with presented entries,
each carrying a PresentationStyle such as Push, Sheet, Dialog, Popover,
or DrawerFromRight. stackInstructions diffs two stacks into ordered
SetRoot, Push, Pop, and ReplaceTop instructions, and
applyStackInstructions reduces them back, so Clients can replay
navigation changes as data.
