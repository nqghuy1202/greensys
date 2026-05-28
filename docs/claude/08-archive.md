# Archive — Reference Only

Stable configuration reference. Rarely changed.

## Oracle Prerequisites (one-time, run as DBA)

```sql
GRANT CHANGE NOTIFICATION TO DEV24;

BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => '172.25.10.38', lower_port => 3141, upper_port => 3141,
    ace  => xs$ace_type(privilege_list => xs$name_list('connect'),
                        principal_name => 'DEV24',
                        principal_type => xs_acl.ptype_db)
  );
  COMMIT;
END;
/

-- Remove stale CQN subscription if ORA-29970 occurs
BEGIN DBMS_CQ_NOTIFICATION.DEREGISTER(
  (SELECT regid FROM user_change_notification_regs
   WHERE table_name = 'DEV24.USER_NOTIFICATIONS' FETCH FIRST 1 ROW ONLY));
END;
/

-- Verify ACL and CQN subscription
SELECT host, lower_port, upper_port, privilege, principal_name
FROM   dba_network_acl_privileges JOIN dba_network_acls USING (acl);

SELECT regid, callback FROM user_change_notification_regs;
```

## ORDS Scalability — Known Bottleneck

Each active user holds **2 ORDS worker threads** simultaneously (notificationWait + chatEvents). Default ORDS pool: 20–50 threads → ~15 users saturates it.

**Quick fix:** Increase `jdbc.MaxLimit` to 100 in `settings.xml` on Server A (no code change).

**Architectural fix:** Merge both polls into single `/api/events/:aus_id` endpoint (halves thread usage). Full plan: `docs/ords-scalability-solutions.md`.

| Config | Max concurrent users |
|--------|---------------------|
| Default (50 threads) | ~10 |
| jdbc.MaxLimit=100 | ~25 |
| Merged poll endpoint | ~50 |
