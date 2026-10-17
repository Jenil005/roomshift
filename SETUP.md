# First 10 Minutes

## 1. Publish repo
From this directory:

### Windows PowerShell
```powershell
./scripts/publish-github.ps1
```

### Git Bash / macOS / Linux
```bash
./scripts/publish-github.sh
```

If GitHub CLI is not authenticated:
```bash
gh auth login
```

## 2. Add teammates
GitHub → repository → Settings → Collaborators → invite teammates.

## 3. Create branches
```bash
git checkout -b feature/frontend
git push -u origin feature/frontend

git checkout main
git checkout -b feature/backend
git push -u origin feature/backend

git checkout main
git checkout -b feature/ar
git push -u origin feature/ar

git checkout main
```

## 4. Assign ownership
- Jenil: integration + frontend support + Gemini/Photon + deployment
- Teammate 1: backend / DeepSpace
- Teammate 2: AR / vision

## 5. Start implementation
Do not start with AI or Photon. First prove:
`create room → join → roles → state transition → victory`.
Then add physical verification.
