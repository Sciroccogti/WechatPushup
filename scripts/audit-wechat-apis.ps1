[CmdletBinding()]
param(
    [ValidatePattern('^(latest|\d+\.\d+\.\d+)$')]
    [string]$Version = 'latest'
)

$ErrorActionPreference = 'Stop'
$phase0ProjectRoot = Split-Path -Parent $PSScriptRoot
$phase0AuditRoot = Join-Path $phase0ProjectRoot '.audit'
New-Item -ItemType Directory -Path $phase0AuditRoot -Force | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)

$registryUrl = 'https://registry.npmjs.org/miniprogram-api-typings/' + $Version
$metadata = Invoke-RestMethod -Uri $registryUrl -TimeoutSec 30
$archivePath = Join-Path $phase0AuditRoot ('typings-' + $metadata.version + '.tgz')
Invoke-WebRequest -Uri $metadata.dist.tarball -OutFile $archivePath -UseBasicParsing -TimeoutSec 30

$sha512 = [System.Security.Cryptography.SHA512]::Create()
try {
    $actualIntegrity = 'sha512-' + [Convert]::ToBase64String($sha512.ComputeHash([System.IO.File]::ReadAllBytes($archivePath)))
} finally {
    $sha512.Dispose()
}
if ($actualIntegrity -ne $metadata.dist.integrity) { throw 'Official npm tarball integrity mismatch.' }

# Read a single declaration member; never execute package scripts or extract arbitrary paths.
$declarationLines = & tar -xOf $archivePath package/types/wx/lib.wx.api.d.ts
if ($LASTEXITCODE -ne 0) { throw 'Unable to read typings archive. Install/use Windows tar.exe.' }
$declarations = $declarationLines -join "`n"
[System.IO.File]::WriteAllText((Join-Path $phase0AuditRoot 'lib.wx.api.d.ts'), $declarations, $utf8)
$terms = '["AmbientLight", "LightSensor", "startLight", "onLight", "\u73af\u5883\u5149", "\u5149\u7167"]' | ConvertFrom-Json
$matches = [ordered]@{}
foreach ($term in $terms) { $matches[$term] = [regex]::Matches($declarations, [regex]::Escape($term)).Count }

$documents = [ordered]@{
    camera = 'https://developers.weixin.qq.com/miniprogram/dev/component/camera.html'
    frame = 'https://developers.weixin.qq.com/miniprogram/dev/api/media/camera/CameraContext.onCameraFrame.html'
    start = 'https://developers.weixin.qq.com/miniprogram/dev/api/media/camera/CameraFrameListener.start.html'
    stop = 'https://developers.weixin.qq.com/miniprogram/dev/api/media/camera/CameraFrameListener.stop.html'
    privacy = 'https://developers.weixin.qq.com/miniprogram/dev/api/open-api/privacy/wx.requirePrivacyAuthorize.html'
}
foreach ($entry in $documents.GetEnumerator()) {
    $response = Invoke-WebRequest -Uri $entry.Value -UseBasicParsing -TimeoutSec 30
    [System.IO.File]::WriteAllText((Join-Path $phase0AuditRoot ($entry.Key + '.html')), $response.Content, $utf8)
}
$report = [ordered]@{
    checkedAt = (Get-Date).ToString('o')
    requestedVersion = $Version
    publishedVersion = $metadata.version
    registry = $registryUrl
    integrityVerified = $true
    integrity = $actualIntegrity
    ambientTermMatches = $matches
    onCameraFrameFound = $declarations.Contains('onCameraFrame(')
    cameraListenerFound = $declarations.Contains('interface CameraFrameListener')
    officialDocuments = $documents
    hardwareValidation = 'Pending physical Android and iPhone tests; declaration matches are not hardware proof.'
}
$json = $report | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText((Join-Path $phase0AuditRoot 'report.json'), $json, $utf8)
Write-Output $json
Write-Output ('Audit files: ' + $phase0AuditRoot)
