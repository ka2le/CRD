# Publishing CRD

This project has two Git workflows:

1. the local workspace repo, which includes private agent/workspace continuity files
2. the public GitHub repo, which must receive only a sanitized game-source snapshot

Do **not** add `https://github.com/ka2le/CRD` as a remote on this local workspace repo or push this repo history directly. The local history tracks files such as `MEMORY.md`, `USER.md`, `.openclaw/`, and `memory/`.

## Public URLs

- Repository: `https://github.com/ka2le/CRD`
- Static site: `https://ka2le.github.io/CRD/`
- Pages workflow: `.github/workflows/pages.yml`

## Local Commit

Use this when committing normal workspace progress locally.

```powershell
git status --short
npm run build
git add .
git commit -m "Describe the change"
```

Optional targeted checks for the Python-to-Node headless path:

```powershell
npx eslint src/game/headlessGame.js scripts/headless-worker.mjs
python python/random_headless_smoke.py --mode five-hand-discard --seed 7 --reveal-opponent
python python/random_headless_smoke.py --mode draft --seed 7 --reveal-opponent
```

## Verify GitHub Pages Build Locally

The deployed site is served from `/CRD/`, so verify with the Pages base path before publishing.

```powershell
$env:GITHUB_PAGES = 'true'
npm run build
Remove-Item Env:\GITHUB_PAGES
```

## Create A Sanitized Public Snapshot

This creates a clean copy outside the private workspace and excludes agent/memory files.

```powershell
$public = Join-Path $env:TEMP 'CRD-public'
Remove-Item -Recurse -Force $public -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $public | Out-Null

$dirs = @('.github', 'data', 'docs', 'public', 'python', 'scripts', 'src')
$files = @(
  '.gitignore',
  'eslint.config.js',
  'index.html',
  'package-lock.json',
  'package.json',
  'PROJECT.md',
  'README.md',
  'vite.config.js'
)

foreach ($dir in $dirs) {
  Copy-Item -Path $dir -Destination $public -Recurse
}

foreach ($file in $files) {
  Copy-Item -Path $file -Destination $public
}

Remove-Item -Force -ErrorAction SilentlyContinue `
  (Join-Path $public 'docs\CODING_START.md'), `
  (Join-Path $public 'docs\SESSION_HANDOFF.md')

Set-Content -Path (Join-Path $public '.publish-source.txt') `
  -Value "Sanitized public snapshot generated from local CRD workspace on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'). Private agent memory/workspace files are intentionally excluded."
```

Before pushing, scan the snapshot for private workspace references:

```powershell
rg -n -i --glob '!docs/PUBLISHING.md' "openclaw|session key|session id|memory\.md|\bmemory/|token|secret|password|SOUL.md|USER.md|AGENTS.md" $public
```

Expected matches should be ordinary code terms only, such as package-lock `js-tokens` or card rendering token names. Investigate anything that points to agent files, private notes, local paths, auth material, or memory files.

## Commit And Push The Public Snapshot

First-time setup if the snapshot has no `.git` folder:

```powershell
Set-Location $public
git init -b master
git remote add origin https://github.com/ka2le/CRD.git
```

For normal updates:

```powershell
Set-Location $public
npm ci
npm run build
$env:GITHUB_PAGES = 'true'
npm run build
Remove-Item Env:\GITHUB_PAGES

git status --short
git add .
git commit -m "Publish CRD update"
git push -u origin master
```

If the public snapshot already tracks `origin/master`, `git push` is enough after the commit.

## GitHub Pages Deployment

GitHub Pages deploys automatically when `master` is pushed to the public repo. The workflow builds with:

```powershell
$env:GITHUB_PAGES = 'true'
npm run build
```

Check the latest workflow run:

```powershell
gh run list --repo ka2le/CRD --limit 3
gh run watch <run-id> --repo ka2le/CRD --exit-status
```

Verify the deployed page and JS asset:

```powershell
$html = Invoke-WebRequest -Uri 'https://ka2le.github.io/CRD/' -UseBasicParsing -TimeoutSec 30
$html.StatusCode
$html.Content -match 'CRD \| Critters Robots Dragons'

$asset = [regex]::Match($html.Content, 'src="([^"]+\.js)"').Groups[1].Value
$assetUrl = [Uri]::new([Uri]'https://ka2le.github.io', $asset).AbsoluteUri
Invoke-WebRequest -Uri $assetUrl -UseBasicParsing -TimeoutSec 30 | Select-Object StatusCode
```

## Update Repo Metadata

If the public repo homepage is ever missing:

```powershell
gh repo edit ka2le/CRD --homepage https://ka2le.github.io/CRD/
```

If Pages ever needs to be re-enabled:

```powershell
gh api -X POST repos/ka2le/CRD/pages -f build_type=workflow
```
