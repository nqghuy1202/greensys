# Tree Grid trên Interactive Grid — DANH SÁCH CHỨC NĂNG CHƯA PHÂN QUYỀN

Page **10012010203**. Region IG static ID: **`irgDSKhongThuoc`**.

Cây 3 cấp: **Module (L1) → Group Function (L2) → Menu (L3)**. Expand/collapse bằng cách
click caret; trạng thái "node nào đang mở" lưu trong page item `PARA` (danh sách quoted).
Mỗi lần toggle → cập nhật `PARA` ở **session server** → refresh IG → query nguồn đọc lại `PARA`.

> **Nguyên tắc cốt lõi của lỗi sort cũ:** Interactive Grid **bỏ qua `ORDER BY` trong SQL nguồn**.
> Muốn cây đúng thứ tự, phải (1) select `SORT_KEY` thành cột, (2) đặt **default sort của IG** theo
> cột đó qua *Saved Report*. Xem mục 6.

---

## 1. Page Items (hidden)

| Item | Type | Mục đích |
|------|------|----------|
| `P10012010203_PARA` | Hidden, **Value Protected = No** | Danh sách node đang mở: `'x10','x10.1002'` |
| `P10012010203_GUS_ID` | Hidden | Nhóm quyền đích đang gán (lọc menu CHƯA gán) |
| `P10012010203_ACTION` | Hidden | `'YES'` = hiện tất cả menu (bỏ lọc theo responsibilities của người đang đăng nhập) |
| `P10012010203_REFRESH` | Hidden | (tuỳ chọn) cờ điều khiển refresh |

`G_GUS_ID` là Application Item (nhóm quyền của người đang đăng nhập) — đã có sẵn trong session.

> Bỏ item `P10012010203_V_NODE` của cách cũ — bản này truyền node qua `x01`, không cần item.

---

## 2. Region Source — Function Returning SQL

Region IG (`irgDSKhongThuoc`) → **Source > Type = SQL Query**, **Use Generic Column Names**,
hoặc Type = *Function Body returning SQL Query*. Dán nguyên hàm dưới đây.

**Sửa so với bản cũ:** thêm `SORT_KEY` vào danh sách cột `SELECT` cuối (bắt buộc để IG sort được).

```sql
declare
  v_para varchar2(4000) := :P10012010203_PARA;
  v_l2   varchar2(500);
  v_l3   varchar2(500);
begin
  if v_para is null then
    v_l2 := '1=0';
    v_l3 := '1=0';
  else
    v_l2 := q'['x' || tree_mod in (]' || v_para || ')';
    v_l3 := q'['x' || tree_grp in (]' || v_para || ')';
  end if;

  return '
with obj as (
  SELECT MEN.MENU_LABLE,
         MEN.MEN_ID,
         MEN.M_MODULE,
         MEN.M_G_FUNCTION,
         MEN.MEN_SIP,
         mol.module_name,
         gfu.group_name,
         TO_CHAR(MEN.M_MODULE)                                    tree_mod,
         TO_CHAR(MEN.M_MODULE)||''.''||TO_CHAR(MEN.M_G_FUNCTION) tree_grp
    FROM MENUS MEN, Modules mol, Group_Functions gfu
   WHERE men.m_module     = mol.module_id
     AND men.m_g_function = gfu.gfu_id
     AND (EXISTS (SELECT 1 FROM responsibilities res
                   WHERE res.gus_id = :G_GUS_ID
                     AND res.men_id = men.men_id)
          OR :P10012010203_ACTION = ''YES'')
     AND NOT EXISTS (SELECT 1 FROM responsibilities res
                      WHERE res.gus_id = :P10012010203_GUS_ID
                        AND res.men_id = men.men_id)
     AND MEN.ISWEB IN (''Y'',''B'')
     AND MEN.DISPLAY = ''Y''
),
l1 as (
  select distinct M_MODULE, module_name, TO_CHAR(M_MODULE) tree_mod
    from obj
),
l2 as (
  select distinct M_MODULE, M_G_FUNCTION, group_name, tree_mod,
         tree_mod||''.''||TO_CHAR(M_G_FUNCTION) tree_grp
    from obj
),
combined as (
  -- Level 1: Module
  select 1                                                              WBS_LEVEL,
         tree_mod                                                       NODE_TREE,
         module_name                                                    LABEL_TEXT,
         ''<span>''||module_name||''</span>''                          V_LABEL,
         0                                                              LEVEL_SPACE,
         null                                                           MEN_ID,
         null                                                           MEN_SIP,
         case when ' || v_l2 || '
              then ''<span class="fa fa-caret-down  menu-tree-icon" style="cursor:pointer;color:#0079d3" data-node="''||tree_mod||''"></span>''
              else ''<span class="fa fa-caret-right menu-tree-icon" style="cursor:pointer;color:#0079d3" data-node="''||tree_mod||''"></span>''
         end                                                            V_ICON,
         LPAD(M_MODULE, 10, ''0'')                                     SORT_KEY
    from l1
  union all
  -- Level 2: Group Function
  select 2,
         tree_grp,
         group_name,
         ''<span style="padding-left:16px">''||group_name||''</span>'',
         16, null, null,
         case when ' || v_l3 || '
              then ''<span class="fa fa-caret-down  menu-tree-icon" style="cursor:pointer;color:#5c6975" data-node="''||tree_grp||''"></span>''
              else ''<span class="fa fa-caret-right menu-tree-icon" style="cursor:pointer;color:#5c6975" data-node="''||tree_grp||''"></span>''
         end,
         LPAD(M_MODULE, 10, ''0'')||''.''||LPAD(M_G_FUNCTION, 10, ''0'')
    from l2
   where ' || v_l2 || '
  union all
  -- Level 3: Menu
  select 3,
         tree_grp||''.''||TO_CHAR(MEN_ID),
         MENU_LABLE,
         ''<span style="padding-left:32px">''||MENU_LABLE||''</span>'',
         32, MEN_ID, MEN_SIP,
         ''<span class="fa fa-file-o" style="color:#aaa"></span>'',
         LPAD(M_MODULE, 10, ''0'')||''.''||LPAD(M_G_FUNCTION, 10, ''0'')||''.''||LPAD(MEN_ID, 10, ''0'')
    from obj
   where ' || v_l3 || '
)
select WBS_LEVEL, NODE_TREE, LABEL_TEXT, V_LABEL,
       LEVEL_SPACE, MEN_ID, MEN_SIP, V_ICON,
       SORT_KEY                                   -- ✅ thêm cột để IG sort được
  from combined
 order by SORT_KEY';                              --   (giữ lại; IG vẫn cần default sort ở mục 6)
end;
```

**Vì sao `SORT_KEY` cho thứ tự cây đúng (pre-order traversal):** LPAD về cùng độ rộng 10 + nối dấu
chấm khiến so sánh chuỗi đặt cha trước con, con nằm gọn dưới cha:

```
0000000010                          ← Module 10
0000000010.0000001002               ← Group 10.1002
0000000010.0000001002.0001001120    ← Menu  10.1002.1001120
0000000021                          ← Module 21
```

---

## 3. Cấu hình các cột IG (Page Designer → region columns)

| Column | Type | Ghi chú |
|--------|------|---------|
| `V_ICON` | Display Only / HTML Expression | **Escape special characters = No** (chứa `<span>` + `data-node`) |
| `V_LABEL` | Display Only | **Escape special characters = No** (chứa span padding) |
| `LABEL_TEXT` | Hidden | text thuần (search/export) |
| `NODE_TREE` | Hidden | khoá node |
| `WBS_LEVEL`, `LEVEL_SPACE`, `MEN_ID`, `MEN_SIP` | Hidden | dữ liệu phụ |
| `SORT_KEY` | **Hidden** | dùng để sort, không hiển thị |

- IG → **Attributes > Edit = Off** (cây chỉ đọc), hoặc bật chọn dòng tuỳ nhu cầu gán quyền.
- IG → **Attributes > Page Items to Submit**: **KHÔNG** đưa `P10012010203_PARA` vào đây.
  Nếu đưa, refresh sẽ ghi đè PARA bằng giá trị (cũ) ở browser → mất trạng thái vừa toggle.
  PARA chỉ được cập nhật phía server (mục 4).

---

## 4. Ajax Callback Process — `TREE_TOGGLE`

Page Process → **Type = Execute Code (Ajax Callback)**, **Name = `TREE_TOGGLE`**.
(Đổi tên từ `collap/expand` cũ — tránh dấu `/` trong tên process.)

Toggle thuần trên `PARA`. Các node có caret luôn có con (do `l1/l2` dựng từ `obj`), nên **bỏ** phần
đếm con tốn kém của bản cũ. Đóng node thì xoá luôn mọi node con (prefix `node.`).

```sql
declare
  v_node  varchar2(200)          := apex_application.g_x01;       -- node click, vd '10.1002'
  v_para  varchar2(4000)         := :P10012010203_PARA;
  c_q     constant varchar2(1)   := chr(39);                      -- dấu nháy đơn '
  v_key   varchar2(210)          := chr(39) || 'x' || apex_application.g_x01 || chr(39);
  v_parts apex_t_varchar2;
  v_new   varchar2(4000);
  v_token varchar2(200);
begin
  if v_node is null then
    return;
  end if;

  if nvl(instr(v_para, v_key), 0) = 0 then
    ----------------------------------------------------------------
    -- Chưa mở → MỞ: thêm token  'xNODE'
    ----------------------------------------------------------------
    :P10012010203_PARA :=
        case when v_para is not null then v_para || ',' end
        || c_q || 'x' || v_node || c_q;
  else
    ----------------------------------------------------------------
    -- Đang mở → ĐÓNG: bỏ chính node + mọi node con (prefix "NODE.")
    ----------------------------------------------------------------
    v_parts := apex_string.split(v_para, ',');
    v_new   := null;
    for i in 1 .. v_parts.count loop
      -- token 'x10.1002' → bỏ nháy → 'x10.1002' → bỏ 'x' → '10.1002'
      v_token := substr(replace(v_parts(i), c_q), 2);
      if v_token <> v_node
         and instr(v_token, v_node || '.') <> 1 then
        v_new := v_new
              || case when v_new is not null then ',' end
              || v_parts(i);
      end if;
    end loop;
    :P10012010203_PARA := v_new;
  end if;

exception
  when others then
    -- Lỗi bất kỳ → reset an toàn (cây thu gọn hết)
    :P10012010203_PARA := null;
end;
```

> So khớp node bằng `'xNODE'` (kèm cả 2 nháy đơn) nên không bị "khớp nhầm tiền tố"
> (vd `'10.100'` không match `'10.1002'`).

---

## 5. Dynamic Action — click caret để toggle

Page → **Dynamic Action**:
- **Event:** Click
- **Selection Type:** jQuery Selector
- **jQuery Selector:** `.menu-tree-icon`
- **Event Scope:** Dynamic (vì IG render lại DOM mỗi lần refresh)
- **Fire on Initialization:** No

**True Action → Execute JavaScript Code:**

```javascript
var node = this.triggeringElement.getAttribute('data-node');
if (!node) return;

apex.server.process(
  'TREE_TOGGLE',
  { x01: node },                       // PARA/GUS_ID/ACTION đã ở session — không cần gửi
  {
    dataType: 'text',
    success: function () {
      apex.region('irgDSKhongThuoc').refresh();
    },
    error: function (xhr) {
      console.error('Tree toggle error:', xhr.responseText);
    }
  }
);
```

> Icon lá (Level 3) dùng class `fa fa-file-o` (không có `menu-tree-icon`, không có `data-node`)
> nên DA không bắn trên lá — đúng ý.
>
> Nếu `GUS_ID`/`ACTION` có thể đổi phía client (vd qua select list) mà chưa submit, thêm:
> `pageItems: globalGenItems('string', '#', pageId, 'gus_id', 'action')` vào tham số thứ 2.

---

## 6. Đặt default sort của IG theo `SORT_KEY` (BẮT BUỘC — đây là phần sửa lỗi sort)

`ORDER BY` trong SQL nguồn **không đủ** với IG. Làm runtime một lần:

1. Mở page 10012010203 trên trình duyệt (đã có dữ liệu).
2. Tạm bỏ ẩn cột `SORT_KEY` (nếu cần) → click header `SORT_KEY` → **Sort Ascending**.
3. **Actions → Report → Save** → lưu vào **Primary** (Default report).
   (Hoặc Actions → Save Default Report Settings nếu app cho phép.)
4. Ẩn lại cột `SORT_KEY` (**Hide**). Sort theo cột ẩn vẫn giữ.
5. Lưu lại lần nữa nếu APEX yêu cầu.

Từ giờ mỗi `region.refresh()` sau toggle, IG áp lại sort `SORT_KEY ASC` đã lưu → cây luôn đúng
thứ tự cha-con.

> Nếu muốn cố định cứng không cho user đổi: IG → Attributes → tắt **Allow Sorting** trên các cột
> hiển thị, chỉ giữ sort mặc định `SORT_KEY`.

---

---

# Grid B — `ig_pq` (chức năng ĐÃ phân quyền, editable)

Cùng page 10012010203. Nguồn: view **`V_MEN_RES_V6`** (đã trả sẵn `WBS_LEVEL` 1/2/3).
Dùng **bộ item/process/class RIÊNG** để 2 cây độc lập:

| Thành phần | Grid A (KHÔNG thuộc) | Grid B (ig_pq) |
|------------|----------------------|----------------|
| PARA item | `P10012010203_PARA` | `P10012010203_PARA_PQ` |
| Caret class | `menu-tree-icon` | `menu-tree-icon-pq` |
| Toggle process | `TREE_TOGGLE` | `TREE_TOGGLE_PQ` |
| Region static id | `irgDSKhongThuoc` | `ig_pq` |

⚠️ **ig_pq editable:** toggle = server refresh → mất checkbox đang sửa chưa lưu. **Save trước khi toggle.**

## B1. Function Returning SQL (region ig_pq)

```sql
declare
  v_para varchar2(4000) := :P10012010203_PARA_PQ;
  v_l2   varchar2(500);
  v_l3   varchar2(500);
begin
  if v_para is null then
    v_l2 := '1=0';
    v_l3 := '1=0';
  else
    v_l2 := q'['x' || tree_mod in (]' || v_para || ')';
    v_l3 := q'['x' || tree_grp in (]' || v_para || ')';
  end if;

  return '
with base as (
  select t.WBS_LEVEL, t.RESP_ID,
         t.INSERTED, t.UPDATED, t.APPROVED, t.UN_APPROVED,
         t.POST, t.UN_POST, t.PRINT, t.DELETED,
         t.MODIFY_DATE, t.MODIFIED_BY,
         t.M_MODULE, t.M_G_FUNCTION, t.MEN_SIP, t.MENU_LABLE,
         TO_CHAR(t.M_MODULE)                                   tree_mod,
         TO_CHAR(t.M_MODULE)||''.''||TO_CHAR(t.M_G_FUNCTION)  tree_grp
    from V_MEN_RES_V6 t
   where t.gus_id = :P10012010203_GUS_ID
),
calc as (
  select b.*,
         case b.WBS_LEVEL
           when 1 then b.tree_mod
           when 2 then b.tree_grp
           else b.tree_grp||''.''||TO_CHAR(b.MEN_SIP)
         end                                                   NODE_TREE,
         case
           when b.WBS_LEVEL = 1 then
             case when ' || v_l2 || '
                  then ''<span class="fa fa-caret-down  menu-tree-icon-pq" style="cursor:pointer;color:var(--primary-color, #15674C);font-size:20px;" data-node="''||b.tree_mod||''"></span>''
                  else ''<span class="fa fa-caret-right menu-tree-icon-pq" style="cursor:pointer;color:var(--primary-color, #15674C);font-size:20px;" data-node="''||b.tree_mod||''"></span>''
             end
           when b.WBS_LEVEL = 2 then
             case when ' || v_l3 || '
                  then ''<span class="fa fa-caret-down  menu-tree-icon-pq" style="padding-left:16px;cursor:pointer;color:var(--primary-color, #15674C);font-size:20px;" data-node="''||b.tree_grp||''"></span>''
                  else ''<span class="fa fa-caret-right menu-tree-icon-pq" style="padding-left:16px;cursor:pointer;color:var(--primary-color, #15674C);font-size:20px;" data-node="''||b.tree_grp||''"></span>''
             end
           else ''<span class="fa fa-file-o" style="padding-left:32px;color:#aaa"></span>''
         end                                                   V_ICON,
         case b.WBS_LEVEL
           when 1 then LPAD(b.M_MODULE,10,''0'')
           when 2 then LPAD(b.M_MODULE,10,''0'')||''.''||LPAD(b.M_G_FUNCTION,10,''0'')
           else LPAD(b.M_MODULE,10,''0'')||''.''||LPAD(b.M_G_FUNCTION,10,''0'')||''.''||LPAD(NVL(b.MEN_SIP,0),10,''0'')
         end                                                   SORT_KEY
    from base b
)
select WBS_LEVEL, RESP_ID,
       INSERTED, UPDATED, APPROVED, UN_APPROVED,
       POST, UN_POST, PRINT, DELETED,
       MODIFY_DATE, MODIFIED_BY,
       M_MODULE, M_G_FUNCTION, MEN_SIP,
       NODE_TREE, V_ICON,
       case when WBS_LEVEL = 2 then ''<span style="padding-left:16px">''||MENU_LABLE||''</span>''
            when WBS_LEVEL = 3 then ''<span style="padding-left:32px">''||MENU_LABLE||''</span>''
            else ''<span>''||MENU_LABLE||''</span>'' end       MENU_LABLE,
       SORT_KEY
  from calc
 where WBS_LEVEL = 1
    or (WBS_LEVEL = 2 and ' || v_l2 || ')
    or (WBS_LEVEL = 3 and ' || v_l3 || ')
 order by SORT_KEY';
end;
```

## B2. Page Item
- `P10012010203_PARA_PQ` — Hidden, Value Protected = No.

## B3. Ajax Callback Process — `TREE_TOGGLE_PQ`

```sql
declare
  v_node  varchar2(200)        := apex_application.g_x01;
  v_para  varchar2(4000)       := :P10012010203_PARA_PQ;
  c_q     constant varchar2(1) := chr(39);
  v_key   varchar2(210)        := chr(39) || 'x' || apex_application.g_x01 || chr(39);
  v_parts apex_t_varchar2;
  v_new   varchar2(4000);
  v_token varchar2(200);
begin
  if v_node is null then return; end if;

  if nvl(instr(v_para, v_key), 0) = 0 then
    :P10012010203_PARA_PQ :=
        case when v_para is not null then v_para || ',' end
        || c_q || 'x' || v_node || c_q;
  else
    v_parts := apex_string.split(v_para, ',');
    v_new   := null;
    for i in 1 .. v_parts.count loop
      v_token := substr(replace(v_parts(i), c_q), 2);
      if v_token <> v_node
         and instr(v_token, v_node || '.') <> 1 then
        v_new := v_new || case when v_new is not null then ',' end || v_parts(i);
      end if;
    end loop;
    :P10012010203_PARA_PQ := v_new;
  end if;
exception
  when others then
    :P10012010203_PARA_PQ := null;
end;
```

## B4. Dynamic Action — click `.menu-tree-icon-pq`
Event: Click | Selector: `.menu-tree-icon-pq` | Event Scope: **Dynamic** | Fire on Init: No

```javascript
var node = this.triggeringElement.getAttribute('data-node');
if (!node) return;

apex.server.process(
  'TREE_TOGGLE_PQ',
  { x01: node },
  {
    dataType: 'text',
    success: function () { apex.region('ig_pq').refresh(); },
    error: function (xhr) { console.error('Tree PQ toggle error:', xhr.responseText); }
  }
);
```

## B5. Cấu hình cột ig_pq
- `V_ICON`, `MENU_LABLE`: Escape special characters = **No**.
- `SORT_KEY`: Hidden + default sort ASC (Save report — xem mục 6).
- `NODE_TREE`, `WBS_LEVEL`, `M_MODULE`, `M_G_FUNCTION`, `MEN_SIP`: Hidden.
- **Page Items to Submit: KHÔNG** chứa `P10012010203_PARA_PQ`.
- Cột checkbox giữ editable. Save trước khi toggle.

---

## 7. Checklist nghiệm thu

- [ ] `SORT_KEY` có trong `SELECT` cuối của Function Returning SQL.
- [ ] Cột `V_ICON`, `V_LABEL`: Escape special characters = **No**.
- [ ] `P10012010203_PARA` **không** nằm trong "Page Items to Submit" của IG.
- [ ] Process `TREE_TOGGLE` là Ajax Callback, đọc `apex_application.g_x01`.
- [ ] DA click `.menu-tree-icon` Event Scope = **Dynamic**.
- [ ] Đã Save default report với sort `SORT_KEY ASC`, rồi Hide cột.
- [ ] Click module → xổ group; click group → xổ menu; click lại → thu gọn cả nhánh con.
```
