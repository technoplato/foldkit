# Response | UI v1 | Round 3 | 2026-11-20

The auditor's verdict: "Agreed: no Blocker or Major is left, slices 1 and 2
can start." The five Minors are answered in the plan's text.

| Id    | Answer                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U3-01 | Fixed. The plan says `isTab`, says what was already declared through `Session.compose`, and marks the web and the terminals "no change". Only the phone changes                                         |
| U3-02 | Fixed. The frozen Dock, the profile's cover, the profile's own scroll place and the header title are listed as things to look for on a phone                                                            |
| U3-03 | Fixed. Slice 2's tests read the `scrollTo` calls against faked rects; the "just finished" row says no mechanism is designed and its test comes first; the ratchet counts are checked when slice 3 lands |
| U3-04 | Fixed. The gate compares with the previous commit, and a fair rise passes only with a written entry saying why                                                                                          |
| U3-05 | Fixed. The UI mark is derived from an Action's `mutates` and `triggers`, not its category, and the resulting list goes to the owner with open decision 4                                                |

The nit: `presentScreen` no longer accepts `isTab`.
