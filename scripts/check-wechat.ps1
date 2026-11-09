[CmdletBinding()]
param([string]$ToolRoot = '')

$ErrorActionPreference = 'Stop'
$phase0ProjectRoot = Split-Path -Parent $PSScriptRoot
$phase0AuditRoot = Join-Path $phase0ProjectRoot '.audit'
$compilerSubdir = 'resources\app.asar.unpacked\node_modules\wcc-exec'
if (-not $ToolRoot) {
    $searchRoots = @(${env:ProgramFiles(x86)}, $env:ProgramFiles) | Where-Object { $_ }
    foreach ($searchRoot in $searchRoots) {
        $tencentRoot = Join-Path $searchRoot 'Tencent'
        if (-not (Test-Path -LiteralPath $tencentRoot)) { continue }
        foreach ($folder in (Get-ChildItem -LiteralPath $tencentRoot -Directory)) {
            if (Test-Path -LiteralPath (Join-Path $folder.FullName ($compilerSubdir + '\wcc.exe'))) {
                $ToolRoot = $folder.FullName
                break
            }
        }
        if ($ToolRoot) { break }
    }
}
if (-not $ToolRoot) { throw 'WeChat DevTools not found. Pass -ToolRoot with its installation folder.' }
$compilerDir = Join-Path $ToolRoot $compilerSubdir
$wxmlCompiler = Join-Path $compilerDir 'wcc.exe'
$wxssCompiler = Join-Path $compilerDir 'wcsc.exe'
if (-not (Test-Path -LiteralPath $wxmlCompiler) -or -not (Test-Path -LiteralPath $wxssCompiler)) {
    throw 'This DevTools installation does not contain wcc-exec native compilers.'
}
New-Item -ItemType Directory -Path $phase0AuditRoot -Force | Out-Null
Push-Location (Join-Path $phase0ProjectRoot 'experiments\optical-demo')
try {
    & $wxmlCompiler -o (Join-Path $phase0AuditRoot 'compiled-wxml.js') './pages/index/index.wxml'
    if ($LASTEXITCODE -ne 0) { throw 'WXML compilation failed.' }
    & $wxssCompiler -o (Join-Path $phase0AuditRoot 'compiled-app-wxss.js') './app.wxss'
    if ($LASTEXITCODE -ne 0) { throw 'App WXSS compilation failed.' }
    & $wxssCompiler -o (Join-Path $phase0AuditRoot 'compiled-page-wxss.js') './pages/index/index.wxss'
    if ($LASTEXITCODE -ne 0) { throw 'Page WXSS compilation failed.' }
} finally {
    Pop-Location
}
Write-Output 'PASS: native WXML and both WXSS files compiled using installed WeChat DevTools.'
Write-Output 'GUI runtime, native component behavior and Android/iPhone hardware are still unverified.'
Write-Output ('Compiler folder: ' + $compilerDir)
