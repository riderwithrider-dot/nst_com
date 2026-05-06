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

# 2. 커밋 분류 선택
Write-Host "=== 커밋 분류 (Enter = 일반업데이트) ===" -ForegroundColor Yellow
Write-Host "  1) [기능추가] - 새 기능"
Write-Host "  2) [기능개선] - 기존 기능 향상"
Write-Host "  3) [버그수정] - 오류 수정"
Write-Host "  4) [UI개선]   - 디자인/레이아웃"
Write-Host "  5) [리팩토링] - 코드 정리, 동작 변화 없음"
Write-Host "  6) [문서]     - README/CHANGELOG/주석"
Write-Host "  7) [설정]     - 빌드/배포/환경설정"
Write-Host "  8) [핫픽스]   - 긴급 수정 (자동 git tag)"
$kindChoice = Read-Host "번호 선택 (1-8) 또는 Enter"

$kindTag = switch ($kindChoice) {
    "1" { "[기능추가]" }
    "2" { "[기능개선]" }
    "3" { "[버그수정]" }
    "4" { "[UI개선]" }
    "5" { "[리팩토링]" }
    "6" { "[문서]" }
    "7" { "[설정]" }
    "8" { "[핫픽스]" }
    default { "" }
}

# 3. Read commit message
Write-Host ""
Write-Host "=== 커밋 메시지 (Enter = 자동 생성) ===" -ForegroundColor Yellow
Write-Host "  ex: 흐름도 노드 클릭 메뉴에 삭제·KPI 끊기 추가" -ForegroundColor DarkGray
$msg = Read-Host "메시지"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"

if ([string]::IsNullOrWhiteSpace($msg)) {
    $msg = "업데이트 " + (Get-Date -Format "yyyy-MM-dd-HH-mm")
    Write-Host "  -> 자동: $msg" -ForegroundColor DarkGray
}

# 분류 태그를 메시지 앞에 붙임
if (-not [string]::IsNullOrWhiteSpace($kindTag)) {
    $msg = "$kindTag $msg"
}
Write-Host "  -> 최종 메시지: $msg" -ForegroundColor Green

# 4. 주요 마일스톤 태그 입력 (선택)
Write-Host ""
Write-Host "=== 마일스톤 태그 (선택, Enter = 건너뛰기) ===" -ForegroundColor Yellow
Write-Host "  주요 업무 완료 시 git tag도 같이 달려면 입력. 예: v0.3-흐름도-스냅샷"
Write-Host "  형식: v{버전}-{한글설명} (공백 대신 하이픈, 한글 OK)"
$milestoneTag = Read-Host "태그명 (선택)"

# 핫픽스인 경우 자동 태그 제안
if ($kindTag -eq "[핫픽스]" -and [string]::IsNullOrWhiteSpace($milestoneTag)) {
    $autoHotfix = "hotfix-" + (Get-Date -Format "yyyyMMdd-HHmm")
    Write-Host "  핫픽스 자동 태그 제안: $autoHotfix" -ForegroundColor DarkGray
    $useAuto = Read-Host "사용? (Y/n)"
    if ($useAuto -ne "n" -and $useAuto -ne "N") {
        $milestoneTag = $autoHotfix
    }
}

# 5. Update CHANGELOG.md
Write-Host ""
Write-Host "=== CHANGELOG.md 업데이트 ===" -ForegroundColor Yellow

$entry = "- [$timestamp] $msg"
if (-not [string]::IsNullOrWhiteSpace($milestoneTag)) {
    $entry = "- [$timestamp] $msg  **(태그: $milestoneTag)**"
}

if (-not (Test-Path "CHANGELOG.md")) {
    "# Changelog`r`n" | Set-Content -Path "CHANGELOG.md" -Encoding UTF8 -NoNewline
    Write-Host "  -> CHANGELOG.md 생성됨" -ForegroundColor DarkGray
}

$existing = Get-Content "CHANGELOG.md" -Raw -Encoding UTF8
if ($null -eq $existing -or $existing.Length -eq 0) {
    $existing = "# Changelog`r`n"
}

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
    $result.Insert(0, '')
    $result.Insert(0, $entry)
    $result.Insert(0, '')
    $result.Insert(0, '# Changelog')
}

($result -join "`r`n") | Set-Content -Path "CHANGELOG.md" -Encoding UTF8 -NoNewline
Write-Host "  추가: $entry" -ForegroundColor Green

# 6. Git add + commit
Write-Host ""
Write-Host "=== git add + commit ===" -ForegroundColor Yellow
git add .
git commit -m "$msg"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "커밋 실패 (변경사항 없음 또는 기타 오류)" -ForegroundColor Red
    Read-Host "Enter 키로 종료"
    exit 1
}

# 7. Git tag (if specified)
if (-not [string]::IsNullOrWhiteSpace($milestoneTag)) {
    Write-Host ""
    Write-Host "=== git tag 생성: $milestoneTag ===" -ForegroundColor Yellow
    git tag -a "$milestoneTag" -m "$msg"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "태그 생성 실패. 이미 같은 이름의 태그가 있을 수 있습니다." -ForegroundColor Red
    } else {
        Write-Host "  태그 '$milestoneTag' 생성됨" -ForegroundColor Green
    }
}

# 8. Git push (commit + tags)
Write-Host ""
Write-Host "=== git push origin main ===" -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Push 실패. 위 오류 확인" -ForegroundColor Red
    Read-Host "Enter 키로 종료"
    exit 1
}

if (-not [string]::IsNullOrWhiteSpace($milestoneTag)) {
    Write-Host ""
    Write-Host "=== git push --tags ===" -ForegroundColor Yellow
    git push origin "$milestoneTag"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "태그 push 실패. 수동으로: git push origin $milestoneTag" -ForegroundColor Red
    } else {
        Write-Host "  태그 push 완료" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "  완료. Vercel 배포 약 1분 후 시작" -ForegroundColor Green
if (-not [string]::IsNullOrWhiteSpace($milestoneTag)) {
    Write-Host "  마일스톤 태그: $milestoneTag" -ForegroundColor Green
}
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Read-Host "Enter 키로 닫기"
