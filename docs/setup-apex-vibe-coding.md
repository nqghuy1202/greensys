# Setup Apex Vibe Coding — Tổng hợp tiến độ

> Ngày: 2026-05-20 | Trạng thái: **Đang thực hiện**

---

## Mục tiêu

Dùng **Claude CLI + apex-component-modifier skill** để vibe coding cho hệ thống Oracle APEX 24.2, kết nối qua môi trường mạng nội bộ.

---

## Kiến trúc hệ thống thực tế

```
Máy local (Windows)
│  - Claude CLI 2.1.142
│  - Java JDK 26
│  - SQLcl (latest)
│  - apex-component-modifier (cloned)
│
│  (RDP)
▼
Jump host: 103.109.xx.xx (Windows Server)
│  - PL/SQL Developer (đã cài)
│  - Oracle Client 19c (đã cài, trong PATH)
│  - Có thể reach mạng nội bộ
│
│  (SSH)
▼
Internal server: 172.25.xx.xx (Linux)
  - Oracle Database 23ai
  - Oracle APEX 24.2
  - ORDS (chạy trên port tùy chỉnh)
```

---

## Những gì đã hoàn thành ✅

### 1. Kết nối RDP vào jump host
- Dùng `mstsc` → `103.109.xx.xx`
- SSH từ jump host → `172.25.xx.xx` (internal server)
- Port SSH thực: không phải 22 (đã tìm được port đúng)

### 2. Tạo SSH tunnel cho APEX
Chạy trong RDP session:
```bash
ssh -L <port>:localhost:<apex_port> user@172.25.xx.xx -N
```
→ Truy cập APEX từ browser trong RDP session qua `localhost:<port>`

### 3. Clone apex-component-modifier
```powershell
cd C:\nodejs-apex-oracle
git clone https://github.com/avhrst/apex-component-modifier
```
Skill được copy vào `.claude/skills/apex/`

### 4. Cài SQLcl
- Download SQLcl latest từ Oracle
- Giải nén vào `C:\Users\PC\Downloads\sqlcl-latest\sqlcl\`
- Java JDK 26 đã cài tại `C:\Program Files\Java\jdk-26.0.1`

### 5. Kết nối Oracle DB 23ai thành công
Lệnh hoạt động (chạy từ jump host, qua Z: drive):
```powershell
$env:ORACLE_HOME = ""  # Quan trọng: tắt OCI mode
.\sql.exe dev24/password@jdbc:oracle:thin:@//172.25.xx.xx:1521/orclpdb1
```
**Lưu ý:** Phải xóa `ORACLE_HOME` vì jump host có Oracle Client 19c → SQLcl tự động dùng OCI mode → lỗi `no ocijdbc23`.

### 6. Sửa apex skill bỏ alias
File: `C:\nodejs-apex-oracle\.claude\skills\apex\SKILL.md`

Thay đổi: bỏ `-name` flag, dùng full connection string:
```bash
# Trước
sql -S -name $SQLCL_CONNECTION <<'EOF'

# Sau
sql -S $SQLCL_CONNECTION <<'EOF'
```

### 7. Cấu hình settings
**`.claude/settings.json`:**
```json
"env": {
  "SQLCL_CONNECTION": "DEV24",
  "APEX_APP_ID": "???",        ← cần điền
  "APEX_WORKSPACE": "???",     ← cần điền
  "DB_USER": "DEV24",
  "DB_CONNECT_STRING": "172.25.xx.xx:1521/orclpdb1"
}
```

**`.claude/settings.local.json`** (gitignored — chứa credentials):
```json
"env": {
  "SQLCL_CONNECTION": "dev24/password@jdbc:oracle:thin:@//172.25.xx.xx:1521/orclpdb1"
}
```

---

## Vấn đề đang gặp ⚠️

### Vấn đề 1: Máy local không reach Oracle DB
```
Máy local → 172.25.xx.xx:1521 ✗ BỊ CHẶN (firewall mạng nội bộ)
Jump host  → 172.25.xx.xx:1521 ✓ OK
```
→ Claude CLI trên local **không thể** gọi SQLcl kết nối DB

### Vấn đề 2: Chạy Claude CLI từ jump host bị hết RAM
Claude CLI (claude.exe) chạy từ Z: (network share) → 162,137 page faults → Out of Memory

---

## Giải pháp chưa thực hiện 🔲

### Phương án A: Copy claude.exe vào local disk của jump host (nhanh nhất)
```powershell
mkdir C:\Temp\claude -Force
copy "Z:\Users\PC\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude-code\2.1.142\claude.exe" "C:\Temp\claude\claude.exe"

# Chạy Claude với env đầy đủ
$env:ORACLE_HOME = ""
$env:Path = "Z:\Users\PC\Downloads\sqlcl-latest\sqlcl\bin;" + $env:Path
$env:JAVA_HOME = "Z:\Program Files\Java\jdk-26.0.1"
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path

cd Z:\nodejs-apex-oracle
C:\Temp\claude\claude.exe
```

### Phương án B: Xin VPN từ admin IT (giải pháp lâu dài)
- VPN → máy local join mạng nội bộ → reach thẳng `172.25.xx.xx:1521`
- SQLcl local kết nối trực tiếp, không cần jump host
- Claude CLI local + apex skill hoạt động hoàn toàn

### Phương án C: netsh portproxy trên jump host (cần admin)
```powershell
netsh interface portproxy add v4tov4 listenport=1521 listenaddress=0.0.0.0 connectport=1521 connectaddress=172.25.xx.xx
New-NetFirewallRule -DisplayName "Oracle 1521" -Direction Inbound -Protocol TCP -LocalPort 1521 -Action Allow
```
→ SQLcl local kết nối qua `103.109.xx.xx:1521`

---

## Việc cần làm khi tiếp tục 📋

1. **Thực hiện Phương án A** (copy claude.exe vào C:\Temp\claude)
2. **Điền APEX_APP_ID và APEX_WORKSPACE thực** vào `settings.json`
3. **Verify SQLcl hoạt động** trong Claude CLI session: hỏi `sql -V`
4. **Test apex skill**: `/apex PAGE:1 -- mô tả thay đổi`

---

## Lệnh hay dùng

### Kết nối SQLcl từ jump host (không bị OCI error)
```powershell
$env:ORACLE_HOME = ""
cd Z:\Users\PC\Downloads\sqlcl-latest\sqlcl\bin
.\sql.exe dev24/password@jdbc:oracle:thin:@//172.25.xx.xx:1521/orclpdb1
```

### Map Z: drive trong Admin PowerShell
```powershell
net use Z: \\tsclient\C
```

### Set Java cho SQLcl từ Z: drive
```powershell
$env:JAVA_HOME = "Z:\Program Files\Java\jdk-26.0.1"
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path
```

### Kiểm tra MAX_WEBSERVICE_REQUESTS (lỗi PWA push notification)
```sql
-- Chạy với SYS hoặc APEX Admin
SELECT WORKSPACE_NAME, MAX_WEBSERVICE_REQUESTS
FROM APEX_WORKSPACES;

-- Fix: set unlimited
BEGIN
  APEX_INSTANCE_ADMIN.SET_WORKSPACE_PARAMETER(
    p_workspace => 'TÊN_WORKSPACE',
    p_parameter => 'MAX_WEBSERVICE_REQUESTS',
    p_value     => '0'
  );
END;
/
```

---

## Lỗi thường gặp và cách xử lý

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| `no ocijdbc23 in java.library.path` | Oracle Client 19c trong PATH → SQLcl dùng OCI mode | `$env:ORACLE_HOME = ""` |
| `Error storing properties file dbtools.properties` | Jump host không có quyền ghi AppData | Bỏ alias, dùng full connection string |
| `Unknown connection DEV24` | Alias chưa được lưu | Đã fix: skill dùng full connection string |
| `Bun has run out of memory` | Chạy claude.exe từ Z: (network share) | Copy claude.exe vào C:\Temp\claude\ |
| `ORA-20001: exceeded web service requests` | APEX workspace hit giới hạn | Tăng MAX_WEBSERVICE_REQUESTS |
| `channel 2: open failed: connect failed` | SSH tunnel đúng nhưng port APEX sai | Tìm đúng port APEX bằng `ss -tlnp` |
| `kex_exchange_identification: Connection reset` | Port đó không phải SSH | Thử port khác |
