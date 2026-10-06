$ErrorActionPreference = 'Stop'
$orbitRoot = 'C:\Users\IKUN\Documents\Codex\2026-10-04\referenced-chatgpt-conversation-this-is-an-3\outputs\music-universe'
$orbitOutput = 'C:\Users\IKUN\Documents\Codex\2026-10-04\referenced-chatgpt-conversation-this-is-an-3\outputs\music-universe-source.zip'
$orbitRoot = (Resolve-Path -LiteralPath $orbitRoot).Path
$orbitFiles = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
foreach ($orbitDirectory in @('src', 'public', 'tests')) {
    Get-ChildItem -LiteralPath (Join-Path $orbitRoot $orbitDirectory) -Recurse -File | ForEach-Object { $orbitFiles.Add($_) }
}
foreach ($orbitName in @('README.md', 'package.json', 'package-lock.json', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', '.gitignore', '.env.example')) {
    $orbitPath = Join-Path $orbitRoot $orbitName
    if (Test-Path -LiteralPath $orbitPath -PathType Leaf) { $orbitFiles.Add((Get-Item -LiteralPath $orbitPath)) }
}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$orbitStream = [System.IO.File]::Open($orbitOutput, [System.IO.FileMode]::Create)
$orbitArchive = [System.IO.Compression.ZipArchive]::new($orbitStream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($orbitFile in $orbitFiles) {
        if (-not $orbitFile.FullName.StartsWith($orbitRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'File outside source directory.' }
        $orbitRelative = $orbitFile.FullName.Substring($orbitRoot.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($orbitArchive, $orbitFile.FullName, ('music-universe/' + $orbitRelative), [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $orbitArchive.Dispose()
    $orbitStream.Dispose()
}
$orbitCheck = [System.IO.Compression.ZipFile]::OpenRead($orbitOutput)
try {
    foreach ($orbitRequired in @('src/components/SceneInteraction.tsx', 'src/hooks/useGalaxyNavigation.ts', 'src/lib/galaxyNavigation.ts', 'src/lib/albumRotationPhysics.ts', 'src/lib/spaceCamera.ts', 'src/lib/sceneInput.ts', 'public/media/space-motion-background.png', 'tests/interactions.mjs', 'tests/navigation.test.ts', 'tests/rotation.mjs', 'tests/rotation.test.ts', 'tests/camera.mjs', 'tests/spaceCamera.test.ts', 'README.md')) {
        if (-not $orbitCheck.GetEntry('music-universe/' + $orbitRequired)) { throw ('Archive missing ' + $orbitRequired) }
    }
    if ($orbitCheck.Entries.FullName -match 'node_modules|/dist/|\.env\.local') { throw 'Unexpected files in source archive.' }
    [PSCustomObject]@{Files = $orbitCheck.Entries.Count; Bytes = (Get-Item -LiteralPath $orbitOutput).Length; Archive = $orbitOutput} | ConvertTo-Json
} finally { $orbitCheck.Dispose() }
