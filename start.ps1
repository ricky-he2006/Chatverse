param([switch]$Dev)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtime = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($runtime) { $runtime.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Install Node.js 24 LTS, then run this script again.' }
if (-not (Test-Path -LiteralPath 'node_modules\tsx')) { throw 'Install dependencies first: pnpm install (or npm install).' }
if ($Dev) { & $nodePath scripts/dev.mjs } else {
  if (-not (Test-Path -LiteralPath 'dist\index.html')) { & $nodePath node_modules/typescript/bin/tsc --noEmit; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & $nodePath node_modules/vite/bin/vite.js build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
  & $nodePath --import tsx server/index.ts
}
