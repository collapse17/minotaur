#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [string]$ComputerName,
    [string]$SoftwareDirectory = (Join-Path $PSScriptRoot '../../dist/dist'),
    [string]$ReportDirectory = (Join-Path $PSScriptRoot '../../reports')
)
$ErrorActionPreference = 'Stop'
if (-not $ComputerName) { $ComputerName = Read-Host 'Computer name' }
if ($ComputerName -notmatch '^(?![0-9]+$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,13}[A-Za-z0-9])?$') {
    throw 'Computer name must contain 1-15 Latin letters, digits or hyphens, and cannot be numeric only.'
}
$software = (Resolve-Path -LiteralPath $SoftwareDirectory).Path
$files = @(Get-ChildItem -LiteralPath $software -File | Sort-Object @{Expression={ if ($_.Name -match '^(\d+)') { [int]$Matches[1] } else { [int]::MaxValue } }},Name)
if (-not ($files | Where-Object Extension -in '.exe','.msi')) { throw 'No installers found.' }
New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$results = [System.Collections.Generic.List[object]]::new()
$report = [ordered]@{ profile='Общий'; startedAt=(Get-Date).ToString('o'); requestedName=$ComputerName; originalName=$env:COMPUTERNAME; rebootRequired=$false; steps=$results }
function Record([string]$Action,[string]$Status,[string]$Detail) {
    $results.Add([pscustomobject]@{time=(Get-Date).ToString('o');action=$Action;status=$Status;detail=$Detail})
    Write-Host "$Action : $Status $Detail"
}
try {
    if ($env:COMPUTERNAME -ine $ComputerName) {
        Rename-Computer -NewName $ComputerName -Force
        $report.rebootRequired = $true
    }
    Record 'Computer name' 'Success' $ComputerName
    $user = Get-LocalUser -Name EasySchool -ErrorAction SilentlyContinue
    if ($user) { throw 'EasySchool already exists. Existing account was preserved; verify it before preparing this PC.' }
    $user = New-LocalUser -Name EasySchool -NoPassword -Description 'EasySchool standard local account'
    $users = Get-LocalGroup -SID 'S-1-5-32-545'
    Add-LocalGroupMember -Group $users -Member $user
    Record 'EasySchool' 'Success' 'Standard Users group; no password'
    foreach ($file in $files) {
        if ($file.Extension -notin '.exe','.msi') {
            Record $file.Name 'Skipped' 'Auxiliary file; no automatic execution'
            continue
        }
        try {
            Write-Host "Installing $($file.Name). Complete and close the installer to continue."
            if ($file.Extension -eq '.msi') {
                $process = Start-Process msiexec.exe -ArgumentList @('/i',('"{0}"' -f $file.FullName),'/norestart') -Wait -PassThru
            } else {
                $process = Start-Process -FilePath $file.FullName -WorkingDirectory $software -Wait -PassThru
            }
            if ($process.ExitCode -in 0,1641,3010) {
                if ($process.ExitCode -in 1641,3010) { $report.rebootRequired = $true }
                Record $file.Name 'Completed' "Installer exit code: $($process.ExitCode); installation not independently verified"
            } else { Record $file.Name 'Failed' "Installer exit code: $($process.ExitCode)" }
        } catch { Record $file.Name 'Failed' $_.Exception.Message }
    }
} catch { Record 'Preparation' 'Failed' $_.Exception.Message }
finally {
    $report.finishedAt = (Get-Date).ToString('o')
    $report.actualName = $env:COMPUTERNAME
    $report.status = if ($results.status -contains 'Failed') { 'Failed' } else { 'Completed' }
    try {
        $report.hardware = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,TotalPhysicalMemory
        $report.os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version
    } catch { Record 'Inventory' 'Failed' $_.Exception.Message; $report.status = 'Failed' }
    $base = Join-Path $ReportDirectory "$ComputerName-$stamp"
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$base.json" -Encoding UTF8
    $summary = "Profile: General; Computer: $ComputerName; Status: $($report.status); Reboot required: $($report.rebootRequired)"
    $results | ConvertTo-Html -Title 'Preparation report' -PreContent "<h1>$summary</h1>" | Set-Content -LiteralPath "$base.html" -Encoding UTF8
    Write-Host "Reports: $base.json and $base.html"
}
if ($report.status -eq 'Failed') { exit 1 }
