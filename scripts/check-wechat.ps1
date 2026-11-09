[CmdletBinding()]
param([string]$ToolRoot = '')

$ErrorActionPreference = 'Stop'
$fitnessProjectRoot = Split-Path -Parent $PSScriptRoot
$fitnessAuditRoot = Join-Path $fitnessProjectRoot '.audit'
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

$projects = @(
    @{ Name = 'product'; Root = (Join-Path $fitnessProjectRoot 'miniprogram') },
    @{ Name = 'optical-demo'; Root = (Join-Path $fitnessProjectRoot 'experiments\optical-demo') }
)
foreach ($project in $projects) {
    $outputRoot = Join-Path $fitnessAuditRoot $project.Name
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
    Push-Location $project.Root
    try {
        $wxmlFiles = @(Get-ChildItem -LiteralPath $project.Root -Filter '*.wxml' -Recurse -File | Sort-Object FullName | ForEach-Object {
            './' + $_.FullName.Substring($project.Root.Length + 1).Replace('\', '/')
        })
        if ($wxmlFiles.Count -eq 0) { throw ('No WXML files found: ' + $project.Name) }
        & $wxmlCompiler -o (Join-Path $outputRoot 'compiled-wxml.js') @wxmlFiles
        if ($LASTEXITCODE -ne 0) { throw ('WXML compilation failed: ' + $project.Name) }
        $wxssFiles = @(Get-ChildItem -LiteralPath $project.Root -Filter '*.wxss' -Recurse -File | Sort-Object FullName | ForEach-Object {
            './' + $_.FullName.Substring($project.Root.Length + 1).Replace('\', '/')
        })
        # Pass the complete file map so @import can resolve shared styles.
        & $wxssCompiler -o (Join-Path $outputRoot 'compiled-wxss.js') @wxssFiles
        if ($LASTEXITCODE -ne 0) { throw ('WXSS compilation failed: ' + $project.Name) }
        Write-Output ('PASS ' + $project.Name + ': ' + $wxmlFiles.Count + ' WXML, ' + $wxssFiles.Count + ' WXSS.')
    } finally {
        Pop-Location
    }
}
Write-Output 'GUI runtime, native component behavior and Android/iPhone hardware are still unverified.'
Write-Output ('Compiler folder: ' + $compilerDir)
