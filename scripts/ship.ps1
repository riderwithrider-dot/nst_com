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
Write-Host "=== Changed files ===" -ForegroundColor Yellow
git status --short
Write-Host ""

# 2. Read commit message
Write-Host "=== Commit message (just Enter = auto generated) ===" -ForegroundColor Yellow
Write-Host "  ex: Step 2.7 history expand + image + line 12px" -ForegroundColor DarkGray
$msg = Read-Host "Message"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"

if ([string]::IsNullOrWhiteSpace($msg)) {
    $msg = "update " + (Get-Date -Format "yyyy-MM-dd-HH-mm")
    Write-Host "  -> auto: $msg" -ForegroundColor DarkGray
} else {
    Write-Host "  -> message: $msg" -ForegroundColor DarkGray
}

# 3. Update CHANGELOG.md (insert new entry under "# Changelog")
Write-Host ""
Write-Host "=== Updating CHANGELOG.md ===" -ForegroundColor Yellow

$entry = "- [$timestamp] $msg"

if (-not (Test-Path "CHANGELOG.md")) {
    "# Changelog`r`n" | Set-Content -Path "CHANGELOG.md" -Encoding UTF8 -NoNewline
    Write-Host "  -> CHANGELOG.md created" -ForegroundColor DarkGray
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
Write-Host "  added: $entry" -ForegroundColor Green

# 4. Git add + commit
Write-Host ""
Write-Host "=== git add + commit ===" -ForegroundColor Yellow
git add .
git commit -m "$msg"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Commit failed (no changes or other error)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# 5. Git push
Write-Host ""
Write-Host "=== git push origin main ===" -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Push failed. Check error above" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "  Done. Vercel deploy starts in ~1 min" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to close"
