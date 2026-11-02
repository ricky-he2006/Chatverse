$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtime = Get-Command node -ErrorAction SilentlyContinue
$demoNode = if ($runtime) { $runtime.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $demoNode)) { throw 'Node.js 24 is required.' }
& $demoNode node_modules/typescript/bin/tsc --noEmit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $demoNode node_modules/vite/bin/vite.js build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $demoNode --import tsx scripts/judge-demo.ts
