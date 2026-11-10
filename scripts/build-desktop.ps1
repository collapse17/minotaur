$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $output = Join-Path $root 'releases'
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    $manifest = Join-Path $output 'versions.json'
    $versions = @()
    if (Test-Path -LiteralPath $manifest) {
        $versions = @(Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json)
    }
    $commit = $null
    $changelog = @()
    $gitRoot = Join-Path $root '.git'
    if ((Get-Command git -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $gitRoot)) {
        $commit = & git rev-parse HEAD
        if ($LASTEXITCODE -ne 0) { throw 'Cannot read Git HEAD' }
        $range = $commit
        if ($versions.Count -gt 0 -and $versions[0].commit) {
            & git cat-file -e "$($versions[0].commit)^{commit}" 2>$null
            if ($LASTEXITCODE -ne 0) { throw 'Previous release commit is missing from Git history' }
            $range = "$($versions[0].commit)..$commit"
        }
        $changelog = @(& git -c core.quotepath=false log --encoding=UTF-8 '--format=%H%x09%s' $range | ForEach-Object {
            $parts = $_ -split "`t", 2
            [ordered]@{ commit = $parts[0]; message = $parts[1] }
        })
        if ($LASTEXITCODE -ne 0) { throw 'Cannot read Git changelog' }
    } else {
        Write-Warning 'Git repository is unavailable; changelog will be empty.'
    }
    & "$root/node_modules/.bin/tauri.cmd" build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "Desktop build failed ($LASTEXITCODE)" }

    $config = Get-Content "$root/src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $name = "munotaur+$($config.version)+$stamp"
    $app = Join-Path $output $name
    New-Item -ItemType Directory -Path $app | Out-Null

    $target = Join-Path $root 'src-tauri/target'
    if ($env:CARGO_TARGET_DIR) {
        $target = $env:CARGO_TARGET_DIR
        if (-not [IO.Path]::IsPathRooted($target)) { $target = Join-Path $root $target }
    }
    $built = Join-Path $target 'release'
    Copy-Item -LiteralPath "$built/minotaur.exe" -Destination $app
    Get-ChildItem -LiteralPath $built -Filter '*.dll' -File | Copy-Item -Destination $app
    foreach ($directory in @('config', 'dist')) {
        Copy-Item -LiteralPath "$root/public/$directory" -Destination $app -Recurse
    }
    # Keep runtime scripts, excluding this build helper.
    $runtimeScripts = New-Item -ItemType Directory -Path "$app/scripts"
    Get-ChildItem -LiteralPath $PSScriptRoot | Where-Object Name -ne 'build-desktop.ps1' |
        Copy-Item -Destination $runtimeScripts.FullName -Recurse

    # ZipFile supports archives larger than Compress-Archive's per-file limit.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = Join-Path $output "$name.zip"
    [IO.Compression.ZipFile]::CreateFromDirectory($app, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)
    $entry = [ordered]@{
        version = $config.version
        bundle = "./$name.zip"
        date = [DateTimeOffset]::Now.ToString('o')
        commit = $commit
        changelog = @($changelog)
    }
    $json = ConvertTo-Json -InputObject @($entry; $versions) -Depth 10
    $temporaryManifest = "$manifest.tmp"
    [IO.File]::WriteAllText($temporaryManifest, $json, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporaryManifest -Destination $manifest -Force
    Write-Host "Application: $app"
    Write-Host "ZIP: $zip"
} finally {
    Pop-Location
}
