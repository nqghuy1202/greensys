# Notification System

## CQN + Long-poll

**`chat-server/cqn.js`** — standalone module, `require('./cqn')` in `server.js`. Exports `startCQN(emitFn)`.

**Internal state:**
- `rowidCache` Map (rowid → aus_id) — loaded from DB on startup; INSERT adds, DELETE reads-and-removes
- `RETRY_INTERVAL_MS = 15s` auto-reconnect on CQN subscription failure
- Calls `emitFn(ausId)` which maps to `notifyWaiters` in `server.js`

**CQN rules:**
- Uses `ipAddress/port` callback — `clientInitiated: true` requires Oracle 19.4+, not available here
- CQN connection has `events: true`; DB queries use a **separate pool connection** — never query on the CQN connection
- Message structure: `message.queries[0].tables[0].rows[k].rowid` (SUBSCR_QOS_QUERY layout)
- When Oracle delivers >80 ROWIDs in one transaction it sends none — `handleFullScan()` is fallback
- `table.operation & oracledb.CQN_OPCODE_DELETE` distinguishes DELETE from INSERT

**Long-poll push flow:**
CQN fires → `notifyWaiters(ausId)` → resolves pending `/api/wait/:aus_id` response → browser refreshes bell → immediately polls again.

**`waiters`** Map in `server.js`: `aus_id(string) → [{ res, timeout }]` — resolved on CQN event or 25s timeout. `req.on('close')` cleans up early if browser navigates away.

**Graceful shutdown:** `server.js` handles `SIGTERM`/`SIGINT` — drains all pending long-poll waiters (sends `timeout` response), closes HTTP server, then closes DB pool. pm2 sends `SIGTERM` on restart.

## APEX Ajax Callbacks

### notificationWait (Page 0 — runs on every page)

```sql
DECLARE
    l_url    VARCHAR2(500);
    l_req    UTL_HTTP.REQ;
    l_resp   UTL_HTTP.RESP;
    l_body   VARCHAR2(32767) := '';
    l_buffer VARCHAR2(32767);
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
    IF :G_AUS_ID IS NULL THEN
        HTP.p('{"status":"timeout"}');
        RETURN;
    END IF;
    l_url := 'http://172.25.10.38:3410/api/wait/' || :G_AUS_ID;
    UTL_HTTP.SET_TRANSFER_TIMEOUT(28);
    l_req  := UTL_HTTP.BEGIN_REQUEST(l_url, 'GET', 'HTTP/1.1');
    UTL_HTTP.SET_HEADER(l_req, 'Connection', 'close');
    l_resp := UTL_HTTP.GET_RESPONSE(l_req);
    BEGIN
        LOOP
            UTL_HTTP.READ_TEXT(l_resp, l_buffer, 32767);
            l_body := l_body || l_buffer;
        END LOOP;
    EXCEPTION
        WHEN UTL_HTTP.END_OF_BODY THEN NULL;
    END;
    UTL_HTTP.END_RESPONSE(l_resp);
    HTP.p(l_body);
EXCEPTION
    WHEN OTHERS THEN
        BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
        HTP.p('{"status":"timeout"}');
END;
```

### chatHeartbeat (Page 0 — every 20s from global.js)

```sql
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  IF :G_AUS_ID IS NULL THEN
    HTP.p('{"status":"skip"}'); RETURN;
  END IF;
  MERGE INTO CHAT_USER_ONLINE o
  USING (SELECT :G_AUS_ID AS aus_id FROM DUAL) src
    ON  (o.aus_id = src.aus_id)
  WHEN MATCHED     THEN UPDATE SET last_seen = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (aus_id, last_seen) VALUES (src.aus_id, SYSTIMESTAMP);
  COMMIT;
  HTP.p('{"status":"ok"}');
END;
```

**Note:** `:G_AUS_ID` is reliable in these page-level callbacks (Page 0 session state is reliably sent). In Application Processes use `:APP_USER` instead — see `07-pitfalls.md`.

## Browser Poll Loop (APEX Theme global.js)

Paste into `Shared Components → Themes → Edit → JavaScript` (runs on every page):

```javascript
(function () {
    'use strict';
    if (window._notifyPoll) return;

    $(document).ready(function () {
        var ausId = $v('P0_AUS_ID');
        if (!ausId) return;

        window._notifyPoll = true;
        var _backoff = 5000;

        function poll() {
            apex.server.process('notificationWait', {}, {
                dataType: 'json',
                success: function (data) {
                    _backoff = 5000;
                    if (data && data.status === 'new_notification') {
                        apex.region('notification-menu').refresh();
                    }
                    poll();
                },
                error: function () {
                    setTimeout(poll, _backoff);
                    _backoff = Math.min(_backoff * 2, 60000);
                }
            });
        }
        poll();

        apex.server.process('chatHeartbeat', {});
        setInterval(function () { apex.server.process('chatHeartbeat', {}); }, 20000);
    });
})();
```

**`P0_AUS_ID`** is a Page 0 hidden item (has a DOM element, so `$v()` works). Do NOT use `$v('G_AUS_ID')` — always returns `""` because `G_AUS_ID` is an Application Item with no DOM element.
