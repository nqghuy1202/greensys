# Oracle DB Schema

## Chat Tables

Tables: `CHAT_CONVERSATIONS`, `CHAT_PARTICIPANTS`, `CHAT_MESSENGERS`, `CHAT_MESSENGER_READS`, `CHAT_USER_ONLINE`

Full DDL: `docs/chat_ddl.sql`.

**Insert conventions:**
- `conv_id` uses `CONV_SEQ.NEXTVAL`, `msg_id` uses `MSG_SEQ.NEXTVAL` — always explicit, never DEFAULT
- `create_date` uses `SYSDATE` explicit in INSERT — do not rely on table DEFAULT
- `created_by VARCHAR2(100)` = `:G_USER_NAME` (username string, not aus_id number)
- Soft delete on `CHAT_MESSENGERS`: set `delete_date = SYSTIMESTAMP`, never DELETE rows

**CHAT_MESSENGERS column semantics:**

| Column | Type | Meaning | Source |
|--------|------|---------|--------|
| `from_aus_id` | NUMBER NOT NULL | sender's aus_id | `:G_AUS_ID` — used for `isMine` check |
| `aus_id` | NUMBER NULL | DM partner's aus_id; NULL for CHANNEL | `x04` from frontend |
| `created_by` | VARCHAR2(100) NOT NULL | username string | `:G_USER_NAME` — audit |

Frontend: `Number(row.from_aus_id) === currentAusId` determines if message is "mine".

**CHAT_CONVERSATIONS — doc-chat columns:**

| Column | Type | Meaning |
|--------|------|---------|
| `doc_type` | VARCHAR2(50) NULL | SO, PXK, HD… `NULL` = general |
| `doc_no` | VARCHAR2(100) NULL | e.g. `SO-2601/010`. `NULL` = general |

`doc_type IS NULL AND doc_no IS NULL` → general Messenger conversation.
`doc_type IS NOT NULL` → document-scoped, only shown in Doc Chat Modal.

**CHAT_USER_ONLINE:**

| Column | Type | Notes |
|--------|------|-------|
| `aus_id` | NUMBER PK | No FK — APP_USERS is a remote table |
| `last_seen` | TIMESTAMP | Updated by `chatHeartbeat` MERGE every 20s |

`last_seen >= SYSTIMESTAMP - INTERVAL '35' SECOND` = online.

DDL (run once as DEV24):
```sql
ALTER TABLE CHAT_CONVERSATIONS ADD (doc_type VARCHAR2(50), doc_no VARCHAR2(100));
CREATE INDEX idx_chat_conv_doc ON CHAT_CONVERSATIONS(doc_type, doc_no);
CREATE TABLE CHAT_USER_ONLINE (
  aus_id    NUMBER    NOT NULL,
  last_seen TIMESTAMP NOT NULL,
  CONSTRAINT pk_chat_user_online PRIMARY KEY (aus_id)
);
```

## Remote Tables via DB Link — Critical

`APP_USERS`, `EMPLOYEES`, `DEPARTMENTS`, `POSITIONS` live in a separate Oracle instance via `DBLINK.GIACAT.VN`. Three consequences:

1. **FK constraints across DB link are illegal.** `CHAT_USER_ONLINE` has no FK to `APP_USERS`.
2. **SQL functions on remote columns are pushed to the remote server** → `ORA-02000 / ORA-02063`. Affected: `REGEXP_REPLACE`, `INTERVAL` literals in SQL.
3. **VISCII encoding** — some employee name bytes are control characters (<0x20) → `SyntaxError: Bad control character` in JSON.

### MATERIALIZE Pattern (required for remote text columns)

```sql
WITH remote_data AS (
  SELECT /*+ MATERIALIZE */
         u.aus_id,
         NVL(e.full_name, 'Unknown') AS full_name,
         u.user_name
  FROM   APP_USERS u
  JOIN   EMPLOYEES e ON e.emp_id = u.emp_id
  WHERE  ...
)
SELECT JSON_ARRAYAGG(
    JSON_OBJECT(
      'full_name' VALUE REGEXP_REPLACE(r.full_name, '[[:cntrl:]]', ''),
      ...
    )
    RETURNING CLOB
  )
FROM   remote_data r
LEFT JOIN local_table lt ON lt.aus_id = r.aus_id;
```

`/*+ MATERIALIZE */` forces CTE to execute against the remote DB first, storing results locally before the outer query runs.

### RETURNING CLOB on JSON_ARRAYAGG

Always add `RETURNING CLOB` for lists with > ~10 items. Do NOT declare `l_result CLOB` and pass to `HTP.p()` — Oracle wraps CLOB in quotes, turning `{"key":[...]}` into `{"key":"[...]"}`.

### PL/SQL INTERVAL Bind Variable

```sql
DECLARE
  l_online_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;
BEGIN
  -- l_online_cutoff is a bind value — not a literal pushed to the remote server
  SELECT ... WHERE o.last_seen >= l_online_cutoff ...
```

## Schema Corrections (column names)

- `DEPARTMENTS.dep_name` — display name (**not** `d.name` — common mistake)
- `POSITIONS.position_name` — role display name
- `APP_USERS.user_name` — login name with underscore (**not** `username`)
- Joins: `EMPLOYEES.dep_id → DEPARTMENTS.dep_id`, `EMPLOYEES.emp_position → POSITIONS.pos_id`

## User Display Name

```sql
SELECT e.full_name
FROM   app_users u
JOIN   employees e ON e.emp_id = u.emp_id
WHERE  u.aus_id = :aus_id
```

`app_users.emp_id` → FK to `employees.emp_id` (PK). `employees.full_name` is the display name.
