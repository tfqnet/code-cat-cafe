# Changelog

## 0.2.0 (2026-10-26)

- **Renamed** the display name to Code Cat Office (the repo, package name, `~/.code-cat-cafe` folder, hook marker and `CAFE_PORT` keep their old names so existing setups keep working).
- **Project labels.** The page shows which project each event, order and bell comes from, with a chip per project that lights up while it is active.
- **One command.** `code-cat-office` starts the office; `code-cat-office setup` connects the current folder; `npx github:tfqnet/code-cat-cafe` works without cloning.
- **`doctor` command** checks Node, curl, the built page, the server, the hooks and whether events are arriving.
- `/health` now reports the version, event count and time of the last event.
- The lead cat wanders when idle and stays at the counter while Claude is working.
- MIT license.

## 0.1.0 (2026-10-25)

- First version: hooks, bridge, pixel office page, agent team kit.
