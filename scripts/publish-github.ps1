$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) is not installed or not on PATH. Install it, then run: gh auth login"
}

$repo = "Jenil005/roomshift"

gh auth status

# Private-first for safety. Change --private to --public if the team wants immediate public visibility.
gh repo create $repo --private --source . --remote origin --push

Write-Host "Created and pushed: https://github.com/$repo"
Write-Host "Add teammates in GitHub > Settings > Collaborators."
