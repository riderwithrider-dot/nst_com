[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'

Set-Location (Join-Path $PSScriptRoot '..')

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  Git push + Vercel auto-deploy" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# 1. Show changed files
Write-Host "=== 변경된 파일 ===" -ForegroundColor Yellow
git status --short
Write-Host ""

# 2. Read commit message
Write-Host "=== 커밋 메시지 (그냥 Enter = 자동 생성) ===" -ForegroundColor Yellow
Write-Host "  예: Step 2.5 작성자 칩 + KPI 그룹 정렬" -ForegroundColor DarkGray
$msg = Read-Host "메시지"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$autoUsed = $false

if ([string]::IsNullOrWhiteSpace($msg)) {
    $msg = "update " + (Get-Date -Format "yyyy-MM-dd-HH-mm")
    $autoUsed = $true
    Write-Host "  -> 자동 메시지: $msg" -ForegroundColor DarkGray
} else {
    Write-Host "  -> 메시지: $msg" -ForegroundColor DarkGray
}

# 3. Update CHANGELOG.md (insert new entry under "# Changelog")
Write-Host ""
Write-Host "=== CHANGELOG.md 갱신 ===" -ForegroundColor Yellow

$entry = "- [$timestamp] $msg"

if (-not (Test-Path "CHANGELOG.md")) {
    "# Changelog`r`n" | Set-Content -Path "CHANGELOG.md" -Encoding UTF8 -NoNewline
    Write-Host "  -> CHANGELOG.md 새로 생성" -ForegroundColor DarkGray
}

$existing = Get-Content "CHANGELOG.md" -Raw -Encoding UTF8
if ($null -eq $existing -or $existing.Length -eq 0) {
    $existing = "# Changelog`r`n"
}

# Split lines, insert new entry right after "# Changelog" header
$lines = $existing -split "`r?`n"
$result = New-Object System.Collections.Generic.List[string]
$inserted = $false

foreach ($line in $lines) {
    [void]$result.Add($line)
    if (-not $inserted -and $line -match '^#\s*Changelog') {
        [void]$result.Add('')
        [void]$result.Add($entry)
        $inserted = $true
    }
}

if (-not $inserted) {
    # No header found, prepend full structure
    $result.Insert(0, '')
    $result.Insert(0, $entry)
    $result.Insert(0, '')
    $result.Insert(0, '# Changelog')
}

($result -join "`r`n") | Set-Content -Path "CHANGELOG.md" -Encoding UTF8 -NoNewline
Write-Host "  ✓ 추가됨: $entry" -ForegroundColor Green

# 4. Git add + commit
Write-Host ""
Write-Host "=== git add + commit ===" -ForegroundColor Yellow
git add .
git commit -m "$msg"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "커밋 실패 (변경사항 없거나 다른 오류)" -ForegroundColor Red
    Read-Host "Enter를 눌러 종료"
    exit 1
}

# 5. Git push
Write-Host ""
Write-Host "=== git push origin main ===" -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "푸시 실패. 위 오류 확인" -ForegroundColor Red
    Read-Host "Enter를 눌러 종료"
    exit 1
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "  ✓ 완료. Vercel 배포 ~1분 후 시작" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Read-Host "Enter를 눌러 닫기"
