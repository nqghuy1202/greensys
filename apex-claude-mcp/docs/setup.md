# Setup Guide — Claude Code ↔ Oracle APEX 26

## Thông số kết nối

| Thành phần | Giá trị |
|------------|---------|
| VM (jump host) | `103.109.xx.xx:xxxx` |
| Oracle DB host | `172.25.xx.xx:1521/orclpdb1` |
| Oracle user | `dev24` |
| APEX workspace | `DEV` |
| Local tunnel port | `localhost:1521` |

---

## Phase 0 — Cài đặt từng bước

### Bước 1: Enable OpenSSH Server trên VM (làm 1 lần trên VM qua RDP)

Mở PowerShell **Admin** trên VM:

```powershell
# Kiểm tra SSH đã cài chưa
Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'

# Cài nếu chưa có
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0

# Start và set auto-start
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic

# Mở firewall port 22 (hoặc port custom)
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
```

> Nếu VM dùng port SSH khác (ví dụ xxxx như trong config), sửa `-LocalPort 22` thành port đó và cấu hình `sshd_config`:
> `C:\ProgramData\ssh\sshd_config` → `Port xxxx`

---

### Bước 2: Tạo SSH key pair trên máy cá nhân

Mở PowerShell trên **máy cá nhân**:

```powershell
# Tạo key (nếu chưa có)
ssh-keygen -t rsa -b 4096 -C "apex-claude-tunnel" -f "$env:USERPROFILE\.ssh\id_rsa"

# Xem public key để copy lên VM
Get-Content "$env:USERPROFILE\.ssh\id_rsa.pub"
```

Copy nội dung public key, paste lên VM tại:
`C:\Users\<vm-user>\.ssh\authorized_keys`

---

### Bước 3: Test SSH từ máy cá nhân

```powershell
ssh -p xxxx Administrator@103.109.xx.xx
```

Nếu vào được VM → SSH OK.

---

### Bước 4: Cài SQLcl 25.1+ trên máy cá nhân

1. Download: https://www.oracle.com/database/sqldeveloper/technologies/sqlcl/download/
2. Giải nén vào `C:\sqlcl\`
3. Thêm `C:\sqlcl\bin` vào PATH:

```powershell
[Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";C:\sqlcl\bin", "User")
```

4. Verify:
```powershell
sql -version
# Expected: SQLcl: Release 25.1.x ...
```

---

### Bước 5: Mở SSH tunnel và test Oracle

```powershell
# Điền IP thật vào script trước (sửa xx.xx)
# Mở tunnel
.\scripts\apex-tunnel.ps1 start

# Kiểm tra
.\scripts\apex-tunnel.ps1 test

# Kết nối Oracle
sql dev24@localhost:1521/orclpdb1
```

---

### Bước 6: Tạo saved SQLcl connection

```powershell
# Mở tunnel trước, rồi:
sql -save APEX26 -savepwd -user dev24@localhost:1521/orclpdb1
# Nhập password khi được hỏi
```

Test saved connection:
```powershell
sql -name APEX26
# Prompt: SQL>  ← thành công
```

---

### Bước 7: Cấu hình Claude Code skill

Sửa file `.claude/settings.json` (tạo nếu chưa có):

```json
{
  "env": {
    "SQLCL_CONNECTION": "APEX26",
    "APEX_APP_ID": "YOUR_APP_ID",
    "APEX_WORKSPACE": "DEV",
    "APEX_SCHEMA": "DEV24"
  }
}
```

> `APEX_APP_ID`: lấy trong APEX Builder → App ID của app bạn muốn vibe code.

---

### Bước 8: Copy skill vào Claude Code

```powershell
# Tạo thư mục skills nếu chưa có
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills"

# Copy skill từ repo
Copy-Item -Recurse "C:\greensys\apex-component-modifier\.claude\skills\apex" `
    "$env:USERPROFILE\.claude\skills\apex"
```

---

### Bước 9: Test vibe coding lần đầu

Mở Claude Code tại thư mục project, chạy:

```
/apex PAGE:1 -- show me the page structure
```

Kết quả mong đợi: Claude xuất cấu trúc page từ APEX 26.

---

## Workflow hàng ngày

```powershell
# 1. Mở tunnel (trước khi dùng Claude Code với APEX)
.\scripts\apex-tunnel.ps1 start

# 2. Vibe coding
# /apex PAGE:100 -- thêm region báo cáo doanh thu

# 3. Đóng tunnel khi xong
.\scripts\apex-tunnel.ps1 stop
```

---

## Troubleshooting

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| `Connection refused localhost:1521` | Tunnel chưa mở | `.\apex-tunnel.ps1 start` |
| `ORA-12514: service not found` | Service name sai | Kiểm tra `/orclpdb1` đúng chưa |
| `Permission denied (publickey)` | Key chưa copy lên VM | Làm lại Bước 2 |
| `sql: command not found` | SQLcl chưa trong PATH | Khởi động lại terminal sau khi thêm PATH |
| `Process not found` APEX | `APEX_APP_ID` sai | Kiểm tra App ID trong APEX Builder |
