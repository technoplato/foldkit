---
'foldkit': patch
---

A CLI daemon no longer stops answering when a connection closes while it answers another. Clients check that a daemon listens by connecting and closing at once, such as before `books pause`; if that check arrived while the daemon was answering an earlier command, the daemon waited on it forever and every later command hung. The daemon now reads each request as soon as its connection arrives and answers them in order.
