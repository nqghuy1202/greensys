# apex-tunnel.ps1
# Mở SSH tunnel từ máy cá nhân → VM → Oracle DB 26
# Usage:
#   .\apex-tunnel.ps1 start   — mở tunnel (background)
#   .\apex-tunnel.ps1 stop    — đóng tunnel
#   .\apex-tunnel.ps1 status  — kiểm tra tunnel đang chạy không
#   .\apex-tunnel.ps1 test    — test kết nối Oracle qua tunnel

param(
    [Parameter(Position=0)]
    [ValidateSet('start','stop','status','test')]
    [string]$Action = 'status'
)

# ── CONFIG ─────────────────────────────────────────────────────────────────────
$VM_HOST      = "103.109.xx.xx"       # IP máy ảo — thay xx bằng số thật
$VM_PORT      = "xxxx"                # SSH port của VM — thay bằng port thật
$VM_USER      = "Administrator"       # Windows user trên VM — đổi nếu khác
$SSH_KEY      = "$env:USERPROFILE\.ssh\id_rsa"   # SSH private key

$ORACLE_HOST  = "172.25.xx.xx"        # IP Oracle server (internal) — thay xx
$ORACLE_PORT  = "1521"
$LOCAL_PORT   = "1521"                # Port lắng nghe trên localhost

$TUNNEL_TAG   = "apex-oracle-tunnel"  # Tag để tìm process sau
# ───────────────────────────────────────────────────────────────────────────────

function Start-Tunnel {
    $existing = Get-Process ssh -ErrorAction SilentlyContinue |
                Where-Object { $_.CommandLine -like "*$TUNNEL_TAG*" }
    if ($existing) {
        Write-Host "[INFO] Tunnel already running (PID $($existing.Id))" -ForegroundColor Yellow
        return
    }

    $sshArgs = @(
        "-N",                                            # no command, tunnel only
        "-f",                                            # background
        "-o", "StrictHostKeyChecking=no",
        "-o", "ServerAliveInterval=30",
        "-o", "ServerAliveCountMax=3",
        "-o", "ExitOnForwardFailure=yes",
        "-i", $SSH_KEY,
        "-p", $VM_PORT,
        "-L", "${LOCAL_PORT}:${ORACLE_HOST}:${ORACLE_PORT}",
        # Tag ẩn trong comment để tìm lại process
        "-o", "ControlPath=none",
        "${VM_USER}@${VM_HOST}"
    )

    Write-Host "[INFO] Opening tunnel: localhost:$LOCAL_PORT → $ORACLE_HOST:$ORACLE_PORT via VM" -ForegroundColor Cyan
    $proc = Start-Process ssh -ArgumentList $sshArgs -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 2

    if (Get-NetTCPConnection -LocalPort $LOCAL_PORT -ErrorAction SilentlyContinue) {
        Write-Host "[OK] Tunnel is UP on localhost:$LOCAL_PORT (PID $($proc.Id))" -ForegroundColor Green
        $proc.Id | Out-File "$env:TEMP\apex-tunnel.pid" -Encoding ascii
    } else {
        Write-Host "[ERROR] Tunnel failed to start. Check SSH key and VM connectivity." -ForegroundColor Red
    }
}

function Stop-Tunnel {
    $pidFile = "$env:TEMP\apex-tunnel.pid"
    if (Test-Path $pidFile) {
        $pid = Get-Content $pidFile
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Remove-Item $pidFile
        Write-Host "[OK] Tunnel stopped (PID $pid)" -ForegroundColor Green
    } else {
        # Fallback: kill tất cả ssh process có forward port này
        Get-Process ssh -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like "*${LOCAL_PORT}*${ORACLE_HOST}*" } |
            ForEach-Object { $_.Kill(); Write-Host "[OK] Killed PID $($_.Id)" -ForegroundColor Green }
    }
}

function Get-TunnelStatus {
    $conn = Get-NetTCPConnection -LocalPort $LOCAL_PORT -LocalAddress 127.0.0.1 -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "[UP] Tunnel active on localhost:$LOCAL_PORT" -ForegroundColor Green
    } else {
        Write-Host "[DOWN] No tunnel on localhost:$LOCAL_PORT" -ForegroundColor Red
    }
}

function Test-OracleConnection {
    Get-TunnelStatus
    Write-Host "`n[TEST] Pinging Oracle listener on localhost:$LOCAL_PORT ..." -ForegroundColor Cyan
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $tcp.Connect("127.0.0.1", [int]$LOCAL_PORT)
        Write-Host "[OK] Oracle listener reachable" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next step — run SQLcl:" -ForegroundColor White
        Write-Host "  sql dev24@localhost:$LOCAL_PORT/orclpdb1" -ForegroundColor Yellow
    } catch {
        Write-Host "[FAIL] Cannot reach Oracle: $_" -ForegroundColor Red
    } finally {
        $tcp.Close()
    }
}

switch ($Action) {
    'start'  { Start-Tunnel }
    'stop'   { Stop-Tunnel }
    'status' { Get-TunnelStatus }
    'test'   { Test-OracleConnection }
}
