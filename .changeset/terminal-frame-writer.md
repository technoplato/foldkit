---
'foldkit': patch
---

Share one terminal frame writer across `runCliTuiView`, `writeCliFollow`, `runProgramTui`, and `runProgramWatch`. Each frame writes cursor-home, lines truncated by display width with erase-to-end-of-line, and trailing erase-below inside synchronized output (`ESC[?2026h` ... `ESC[?2026l`) with autowrap disabled during paint, eliminating `ESC[2J` full-screen clears, wide-character wrap drift, and scrollback growth in `books follow`. Non-TTY pipes receive zero escape sequences.
