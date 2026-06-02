# Báo cáo Review — <Scope> (<YYYY-MM-DD>)

> Dùng template này cho review lớn (nhiều file / cả một luồng / ≥ ~6 phát hiện).
> Lưu mặc định: `docs/reviews/REVIEW-<scope>-<YYYY-MM-DD>.md`.

## 1. Phạm vi & luồng đã dựng (Pha 1)

- **Đối tượng review:** <file/feature/nhánh>
- **Luồng thực tế (Browser → APEX → UTL_HTTP → Node → DB → về):**

```
<vẽ chuỗi bước thực tế ở đây>
```

- **Anh em ruột so sánh (Pha 2):** <feature đã có + đường dẫn code>

## 2. Tổng quan phát hiện

| # | Mức | Mỏ neo | Vị trí | Tóm tắt |
|---|-----|--------|--------|---------|
| 1 | 🔴 Chặn | A8 | `file:line` | … |
| 2 | 🟡 Lệch | A2 | `file:line` | … |
| 3 | 🟢 Tiến hóa | A5 | `file:line` | … |

Tổng: 🔴 _n_ · 🟡 _n_ · 🔵 _n_ · 🟢 _n_

## 3. Chi tiết phát hiện

### [🔴 Chặn] #1 — <tiêu đề> (`file:line`)

- **Hiện trạng:** <code/đoạn trích đang có>
- **Lệch khỏi:** <mỏ neo Ax / anh em ruột nào>
- **Vì sao quan trọng:** <giải thích why, dẫn pitfall/tài liệu>
- **Đề xuất sửa:**
```sql
-- hoặc js
<đoạn sửa cụ thể>
```

### [🟡 Lệch] #2 — <tiêu đề> (`file:line`)

- **Hiện trạng:** …
- **Anh em ruột làm thế nào:** <trích cách feature cũ làm>
- **Phán quyết Pha 4:** ☐ Kéo code mới về convention ☐ Tiến hóa convention ☐ Hai cách hợp lệ
- **Đề xuất:** …

## 4. Đề xuất thống nhất (kết quả Pha 4)

Tổng hợp các quyết định "gom về một mối / cho tiến hóa". Đây là mục quan trọng nhất với người dùng.

### 4a. Kéo về convention cũ
- <điểm lệch> → sửa thành <cách chuẩn>. Lý do: <why>.

### 4b. Tiến hóa convention (cách mới tốt hơn)
- <điểm> — cách mới tốt hơn vì <why>.
  - **Cập nhật tài liệu:** `docs/claude/<file>.md` mục <…>
  - **Migrate các chỗ cũ cho đồng bộ:** <liệt kê file:line các nơi đang dùng cách cũ>

### 4c. Ranh giới cần ghi lại
- Khi nào dùng cách A vs cách B: <…> → đề xuất ghi vào <tài liệu>.

## 5. Bug / Security / Performance (Pha 5)

| # | Mức | Loại | Vị trí | Mô tả + sửa |
|---|-----|------|--------|-------------|
| | 🔴 | SQL injection / bind | | |
| | 🟡 | Rò rỉ connection | | |

## 6. Việc cần làm (gợi ý thứ tự)

1. [ ] <ưu tiên 🔴 trước>
2. [ ] <🟡 lệch>
3. [ ] <cập nhật tài liệu nếu chọn tiến hóa>
