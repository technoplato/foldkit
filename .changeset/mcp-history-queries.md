---
'foldkit': minor
'@foldkit/devtools-mcp': minor
---

Add Model-anchored history queries to the DevTools MCP server. `foldkit_list_messages` gains `changed_paths_match` (server-side filtering by changed Model paths, where patterns compare segment by segment for the length of the shorter side and `*` matches one segment) and `from_end` (read the latest entries without discovering the total count first). New `foldkit_count_messages_by_tag` returns a tag histogram with no payloads for cheap reconnaissance before paging detail. New `foldkit_diff_models` returns a path-level Model diff between two history indices, each side reported as `Present` with a summarized value or `Absent` when the path does not exist there. `foldkit_get_model_at`, `foldkit_diff_models`, and `foldkit_replay_to_keyframe` now reject indices the runtime cannot answer for, returning the readable bounds, instead of silently resolving the wrong Model from a fallback keyframe. Patterns not anchored at `root` are rejected with a clear error rather than silently matching nothing. The history diff now records removed record keys and truncated array elements as changed paths.
