---
title: 'Namespace SSE identity by dbKey (multi-DB Phase 2, step 1)'
type: 'refactor'
created: '2026-07-01'
status: 'done'
baseline_commit: 'ec844efa7e2ec8afd71cabb3df95636d3f2eb8b8'
context: ['{project-root}/chat-server/docs/multi-db-research.md', '{project-root}/docs/pitfalls.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** chat-server sắp phục vụ nhiều schema/instance Oracle, mỗi schema có dãy `aus_id` riêng. SSE hiện định danh user bằng bare `aus_id` (`events.js`) và token chỉ mã hoá `<aus_id>|<exp>` (`token.js`) → user 5 ở schema A và user 5 ở schema B đụng key → giao chéo notification (rò rỉ dữ liệu chéo tenant).

**Approach:** Nâng định danh SSE thành composite `dbKey:ausId` xuyên token → verify → registry → deliver. Giữ tương thích ngược: token 2 phần (cũ) map về `DEFAULT_DB_KEY`. Bước này CQN vẫn 1 DB nên `notifyUser` dùng dbKey mặc định, đánh dấu TODO cho bước tách worker.

## Boundaries & Constraints

**Always:** Giữ nguyên thuật toán HMAC-SHA256 (crypto, khớp APEX `DBMS_CRYPTO typ=>3`); HMAC ký toàn bộ body; giữ middleware `res.json()` escape `charCodeAt` (không regex Unicode); giữ nguyên logic buffer/replay/seq của events.js; `dbKey` mặc định lấy từ `process.env.DEFAULT_DB_KEY || 'default'`.

**Ask First:** Nếu phát hiện consumer khác của `notifyUser`/`deliverToUser`/`registerSSE` ngoài `server.js`+`cqn.js`+`chat.js` mà việc thêm tham số dbKey làm vỡ chữ ký; nếu APEX `sseToken` cần đổi (thuộc phạm vi paste tay của user, chỉ ghi TODO).

**Never:** Không đổi thuật toán/khóa HMAC; không refactor ngoài phạm vi namespacing; không tách gateway/worker ở bước này; không đụng chat.js message routing (bước sau); không xoá phần tương thích ngược token cũ.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Token mới hợp lệ | body `dbKey\|ausId\|exp`, chữ ký đúng, chưa hết hạn | `verifyToken` → `{ dbKey, ausId }` | — |
| Token cũ 2 phần | body `ausId\|exp`, chữ ký đúng | `{ dbKey: DEFAULT_DB_KEY, ausId }` | — |
| Token sai chữ ký | body bất kỳ, sig sai | `null` | reject 401 (đã có) |
| Token hết hạn | exp < now | `null` | reject 401 |
| Body rỗng/thiếu field | thiếu ausId hoặc exp | `null` | reject 401 |
| 2 user cùng ausId khác dbKey | dbA:5 và dbB:5 cùng online | 2 SSE entry riêng biệt, không ghi đè nhau | — |
| notifyUser (CQN 1 DB) | gọi `notifyUser(ausId)` từ cqn.js | deliver tới `DEFAULT_DB_KEY:ausId` | — |

</frozen-after-approval>

## Code Map

- `chat-server/token.js` -- mint/verify HMAC token; đổi body sang 3 phần + fallback 2 phần. `verifyToken` trả `{dbKey, ausId}`.
- `chat-server/events.js` -- Map `sseConnections`/`eventBuffer` key bare ausId; đổi sang composite key; `registerSSE`/`deliverToUser`/`notifyUser` nhận `dbKey`.
- `chat-server/server.js` -- `/api/sse` gọi `verifyToken` rồi `registerSSE`; truyền `dbKey`. `startCQN(notifyUser)` — notifyUser giờ cần dbKey mặc định (TODO worker split).
- `chat-server/cqn.js` -- gọi `_emitFn(ausId)`; giữ nguyên (notifyUser tự gán DEFAULT_DB_KEY), chỉ thêm comment TODO nếu cần.

## Tasks & Acceptance

**Execution:**
- [x] `chat-server/token.js` -- Body thành `<dbKey>|<ausId>|<exp>`; `verifyToken` split, nếu 3 phần lấy dbKey, nếu 2 phần dùng `DEFAULT_DB_KEY`; trả `{dbKey, ausId}`; giữ timing-safe compare + HMAC nguyên vẹn.
- [x] `chat-server/events.js` -- Thêm helper `keyOf(dbKey, ausId)` = `dbKey+':'+ausId`; `registerSSE(dbKey, ausId, res, lastEventId)`, `deliverToUser(dbKey, ausId, payload)`, `notifyUser(ausId, dbKey)` (dbKey optional → default); mọi truy cập Map dùng composite key; buffer/replay/seq không đổi.
- [x] `chat-server/server.js` -- `/api/sse`: dùng `{dbKey, ausId}` từ verifyToken, gọi `registerSSE(dbKey, ausId, res, ...)`; log kèm dbKey.
- [x] `chat-server/chat.js` -- (Ask First đã duyệt) `deliverToConv` truyền `DEFAULT_DB_KEY` vào `deliverToUser` để không vỡ chữ ký; thêm TODO(multi-db). Không đổi routing logic.
- [x] Test I/O matrix -- Không có test harness sẵn; xác minh bằng `node --check` (4 file OK) + trace token 3/2-phần/sai-sig/hết-hạn/thiếu-field/4-phần + key distinct — tất cả pass.

**Acceptance Criteria:**
- Given 2 SSE client cùng `ausId` khác `dbKey`, when cả hai kết nối, then `sseConnections` giữ 2 entry riêng và event của dbA không tới dbB.
- Given token cũ 2 phần đang lưu ở client, when reconnect, then vẫn verify thành công với `dbKey=DEFAULT_DB_KEY` (không buộc user login lại).
- Given `notifyUser(ausId)` gọi từ cqn.js (CQN 1 DB), when fire, then deliver đúng `DEFAULT_DB_KEY:ausId`.

## Design Notes

Composite key là string `dbKey:ausId` để tái dùng nguyên cơ chế Map/buffer hiện có (ít thay đổi nhất). `notifyUser(ausId, dbKey = DEFAULT_DB_KEY)` đặt dbKey làm tham số thứ 2 optional để chữ ký `startCQN(notifyUser)` (gọi `_emitFn(ausId)` 1 tham số) không vỡ — TODO: khi tách CQN worker, worker truyền dbKey thật.

Tương thích ngược token: split theo `|`; `parts.length === 3` → `[dbKey, ausId, exp]`; `=== 2` → `[ausId, exp]` + dbKey mặc định; khác → null.

## Verification

**Commands:**
- `node --check chat-server/token.js` -- expected: no output (syntax OK)
- `node --check chat-server/events.js` -- expected: no output
- `node --check chat-server/server.js` -- expected: no output

**Manual checks:**
- Trace `verifyToken` với 3 input: token 3-phần, token 2-phần, token sai sig → khớp I/O matrix.
- Trace 2 `registerSSE` cùng ausId khác dbKey → 2 key khác nhau trong `sseConnections`.

## Suggested Review Order

**Định danh token (nguồn dbKey)**

- Entry point — parse body 2/3-phần + fallback DEFAULT_DB_KEY, trả `{dbKey, ausId}`; HMAC không đổi
  [`token.js:39`](../../chat-server/token.js#L39)

**Namespacing registry SSE**

- Helper composite key + hằng default — nền tảng của toàn bộ thay đổi
  [`events.js:6`](../../chat-server/events.js#L6)

- `registerSSE`/`deliverToUser` đổi key `String(ausId)` → `keyOf(dbKey, ausId)`
  [`events.js:53`](../../chat-server/events.js#L53)

- `notifyUser(ausId, dbKey=default)` — thứ tự tham số ngược có chủ đích (giữ chữ ký CQN `_emitFn`)
  [`events.js:98`](../../chat-server/events.js#L98)

**Đầu vào (call sites)**

- `/api/sse` lấy `dbKey` từ token, truyền vào `registerSSE`
  [`server.js:87`](../../chat-server/server.js#L87)

- `deliverToConv` truyền `DEFAULT_DB_KEY` (Ask First đã duyệt) — không đổi routing
  [`chat.js:68`](../../chat-server/chat.js#L68)
