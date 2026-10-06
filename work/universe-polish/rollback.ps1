param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$taskManifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'rollback-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function Test-TaskPath($Root, $Relative) {
  $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\','/')
  $resolvedTarget = [IO.Path]::GetFullPath((Join-Path $resolvedRoot $Relative))
  if (-not $resolvedTarget.StartsWith($resolvedRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "Path outside task root: $Relative" }
  $taskAncestor = $resolvedTarget
  while ($taskAncestor -and $taskAncestor.Length -ge $resolvedRoot.Length) {
    if (Test-Path -LiteralPath $taskAncestor) {
      if ((Get-Item -LiteralPath $taskAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point in task path: $Relative" }
    }
    $taskAncestor = [IO.Path]::GetDirectoryName($taskAncestor)
  }
  return $resolvedTarget
}
# Preflight every target before any changes. Stop if someone edited a source later.
$taskOperations = foreach ($taskEntry in $taskManifest.files) {
  $taskRoot = $taskManifest.roots.($taskEntry.root)
  if (-not $taskRoot) { throw 'Unknown project root' }
  $taskTarget = Test-TaskPath $taskRoot $taskEntry.relative
  if (-not (Test-Path -LiteralPath $taskTarget -PathType Leaf)) { throw "Missing source: $($taskEntry.relative)" }
  if ((Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash -ne $taskEntry.afterSha256) { throw "Later source edits detected: $($taskEntry.relative)" }
  $taskBackup = $null
  if ($taskEntry.action -eq 'restore') {
    $taskBackup = Test-TaskPath $PSScriptRoot $taskEntry.backup
    if ((Get-FileHash -LiteralPath $taskBackup -Algorithm SHA256).Hash -ne $taskEntry.beforeSha256) { throw "Backup mismatch: $($taskEntry.relative)" }
  } elseif ($taskEntry.action -ne 'remove') { throw 'Invalid rollback operation' }
  [PSCustomObject]@{ Action=$taskEntry.action; Target=$taskTarget; Backup=$taskBackup }
}
if (-not $Apply) {
  $taskOperations | Select-Object Action,Target | Format-Table -AutoSize
  Write-Output 'Preview only. Run with -Apply to restore these sources after stopping development servers.'
  exit 0
}
foreach ($taskOperation in $taskOperations) {
  if ($taskOperation.Action -eq 'restore') { Copy-Item -LiteralPath $taskOperation.Backup -Destination $taskOperation.Target }
  else { Remove-Item -LiteralPath $taskOperation.Target }
}
Write-Output 'Source rollback finished. Databases, secrets and generated builds were preserved. Rebuild before restarting.'
