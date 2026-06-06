# CRM Module

ERP module for `KHTN` (Khách hàng tiềm năng / Leads). Opens as a **drawer page** via iframe — not inline content.

## Drawer Page Structure

Loads a separate APEX page inside `<iframe>` (URL: `/ords/r/dev/.../thông-tin-khách-hàng-tiềm-năng`).

- Buttons (`#Btn_Delete`, `#Btn_Save_Cle` etc.) are **inside the iframe document** — not in parent page DOM
- Moving buttons to the dialog titlebar requires the proxy pattern — see `moveDrawerButtons` (iframe variant) in `05-apex-patterns.md`
- Page item prefix: `P210401102_` (drawer page), `p21040110205_` (iframe URL params)

## CrmLeads Class Pattern

```javascript
// Separate field lists even if currently identical — they will diverge
const CLE_CREATE_FIELDS = ['cle_id', 'cle_code', 'ven_id', ...];
const CLE_UPDATE_FIELDS = ['cle_id', 'cle_code', 'ven_id', ...];

class CrmLeads {
    static #genItems(fields) {
        return globalGenItems('string', '#', pageId, ...fields);
    }
    static async create(hasChanges) { /* returns { behavior:'insert', state, id, message } */ }
    static async update(hasChanges, id) { /* returns { behavior:'update', state, id, message } */ }
    static async fetchAfterSave(behavior, id) { /* second round-trip: audit fields only */ }
}
```

`fetchAfterSave` is a mandatory second DB round-trip — the insert/update callbacks only return `{ state, id, message }`, not audit fields (`created_by`, `create_date`, `modified_by`, `modify_date`).

## Status Constants

```javascript
const CLOSED_STATUSES = ['3', '4']; // '3' = Chuyển thành cơ hội, '4' = Loại
const STATUS_CONVERTED = '3';       // show Btn_Convert only when status is '3'
```

Status `'3'` is simultaneously **closed** (hides Save/Delete) **and** converted (shows Btn_Convert) — these are not contradictory.

## saveCrmLeads Conventions

- `cleId = $v(...)` — value of the ID item, not a boolean
- `hasChanges = apex.gFormChange === 'Y'` — direct equality, not `['Y'].includes(...)`
- `fetchAfterSave` called only inside `state === 'success'` block, not on every result
- Returns `true` when no changes (not an error — form simply unchanged)
