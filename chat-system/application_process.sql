-- 1. chatHeartbeat
declare
    l_aus_id number;
begin
    owa_util.mime_header('application/json', true, 'UTF-8');
    -- :G_AUS_ID không tin cậy trong Application Process → ưu tiên g_x01 (global.js gửi
    -- x01 = $v('P0_AUS_ID')), fallback :G_AUS_ID. Convert trong begin để lỗi rơi vào WHEN OTHERS.
    l_aus_id := coalesce(nullif(to_number(apex_application.g_x01), 0), to_number(:G_AUS_ID));
    if l_aus_id is null or l_aus_id = 0 then
        apex_json.open_object;
        apex_json.write('state','skip');
        apex_json.close_object;
        return;
    --   HTP.p('{"status":"skip"}'); RETURN;
    end if;
    merge into chat_user_online o
    using (select l_aus_id as aus_id from dual) src
      on  (o.aus_id = src.aus_id)
    when matched     then update set last_seen = systimestamp
    when not matched then insert (aus_id, last_seen) values (src.aus_id, systimestamp);
    commit;
    apex_json.open_object;
    apex_json.write('state','ok');
    apex_json.close_object;
    -- HTP.p('{"status":"ok"}');
exception
    when others then
        rollback;
        apex_json.open_object;
        apex_json.write('state','error');
        apex_json.write('msg', replace(sqlerrm, '"', '\"'));
        apex_json.close_object;
        -- HTP.p('{"status":"error","msg":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
end;


-- 2. getUrlNodeJs
declare
    v_url varchar2(1000);
begin
    select t.value 
      into v_url
      from system_paras t 
     where t.code = 'NODEJS';
    
    apex_json.open_object;
    apex_json.write('state', 'success');
    apex_json.write('url', v_url);
    apex_json.close_object;
exception
    when others then 
        apex_json.open_object;
        apex_json.write('state', 'error');
        apex_json.write('message', sqlerrm);
        apex_json.close_object;
end;

-- 3. loadAppConfig
begin
    select value into :G_SSE_SECRET
      from chat_config
     where key = 'SSE_SECRET';
exception
    when no_data_found  then null;   -- chưa cấu hình secret → sseToken sẽ trả rỗng gọn gàng
    when too_many_rows  then null;   -- key trùng (data lỗi) → bỏ qua, không 500
end;

--4. notificationCount
declare
    l_aus_id number;
    l_count  number := 0;
begin
    owa_util.mime_header('application/json', true, 'UTF-8');

    if :APP_USER is null or :APP_USER in ('nobody', 'NOBODY') then
        apex_json.open_object;
        apex_json.write('state', 'success');
        apex_json.write('count', '0');
        apex_json.close_object;
        -- htp.p('{"count":0}');
        return;
    end if;

    begin
        select aus_id
          into l_aus_id
          from app_users
         where lower(user_name) = lower(:APP_USER);
    exception
        when no_data_found then
            apex_json.open_object;
            apex_json.write('state', 'success');
            apex_json.write('count', '0');
            apex_json.close_object;
            -- htp.p('{"count":0}');
            return;
    end;

    select count(1)
      into l_count
      from app_notifications ano
     inner join user_notifications uno
        on uno.ano_id = ano.ano_id
     where uno.deleted = 'N'
       and uno.read = 'N'
       and uno.aus_id = l_aus_id
       -- Sargable (bỏ TRUNC trên cột để dùng được index):
       --   trunc(from_date) <= trunc(sysdate)  ⟺  from_date < trunc(sysdate)+1
       --   trunc(to_date)   >= trunc(sysdate)  ⟺  to_date   >= trunc(sysdate)
       and ano.from_date < trunc(sysdate) + 1
       and (ano.to_date is null or ano.to_date >= trunc(sysdate));


    apex_json.open_object;
    apex_json.write('state', 'success');
    apex_json.write('count', to_char(l_count));
    apex_json.close_object;
    -- htp.p('{"count":' || to_char(l_count) || '}');
exception
    when others then
        apex_json.open_object;
        apex_json.write('state', 'error');
        apex_json.write('message', sqlerrm);
        apex_json.write('count', '0');
        apex_json.close_object;
        -- htp.p('{"count":0}');
end;

-- 5. sseToken
declare
    l_aus_id  number;
    l_exp     number;
    l_body    varchar2(200);
    l_sig_raw raw(32);
    l_sig     varchar2(100);
    l_secret  varchar2(200) := :G_SSE_SECRET;

    function to_base64url(p_raw in raw) return varchar2 is
        l_v varchar2(200);
    begin
        l_v := utl_raw.cast_to_varchar2(utl_encode.base64_encode(p_raw));
        l_v := replace(replace(l_v, chr(13), ''), chr(10), '');
        l_v := replace(replace(replace(l_v, '+', '-'), '/', '_'), '=', '');
        return l_v;
    end;
begin
    owa_util.mime_header('text/plain', true, 'UTF-8');
    -- :G_AUS_ID không tin cậy trong Application Process → ưu tiên g_x01 (global.js gửi
    -- x01 = $v('P0_AUS_ID')), fallback :G_AUS_ID. Convert đặt trong begin để exception
    -- (nếu g_x01 phi số) rơi vào WHEN OTHERS thay vì ném ở DECLARE.
    l_aus_id := coalesce(nullif(to_number(apex_application.g_x01), 0), to_number(:G_AUS_ID));
    if l_aus_id is null or l_aus_id = 0 then
        htp.p(''); return;
    end if;
    if l_secret is null then
        htp.p(''); return;
    end if;
    l_exp := floor(
      (cast(sys_extract_utc(systimestamp) as date) - date '1970-01-01') * 86400
    ) + 120;
    l_body := to_base64url(utl_raw.cast_to_raw(to_char(l_aus_id) || '|' || to_char(l_exp)));
    l_sig_raw := dbms_crypto.mac(
      src => utl_raw.cast_to_raw(l_body),
      typ => 3,
      key => utl_raw.cast_to_raw(l_secret)
    );
    l_sig := to_base64url(l_sig_raw);
    htp.p(l_body || '.' || l_sig);
exception
    when others then
        htp.p('');
end;