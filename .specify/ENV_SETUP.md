# SpecKit Environment Configuration

This project uses environment variables for configuration, particularly for GitHub API operations.

## Quick Start

1. **Create your `.env` file** (first time only):
   ```powershell
   cp .env.example .env
   ```

2. **Edit `.env` with your actual values**:
   - Open `.env` in your editor
   - Replace `github_pat_YOUR_TOKEN_HERE` with your actual GitHub Personal Access Token
   - Save the file

3. **Environment variables are automatically loaded** when you run any SpecKit script!

## How It Works

### Automatic Loading

All SpecKit PowerShell scripts automatically load environment variables from the `.env` file in the project root. This happens through the `common.ps1` script which is sourced by other scripts.

When you run commands like:
- `.specify/scripts/powershell/setup-plan.ps1`
- `.specify/scripts/powershell/create-new-feature.ps1`
- Any other SpecKit script

The `.env` file is automatically loaded, making variables like `GITHUB_TOKEN` available.

### Manual Loading

If you need to load environment variables in a PowerShell session manually:

```powershell
# Load all environment variables from .env
. .\.specify\scripts\powershell\load-env.ps1

# Verify it's loaded
$env:GITHUB_TOKEN
```

## Required Environment Variables

### GITHUB_TOKEN

**Required for**: Creating GitHub issues, branches, pull requests, and other GitHub API operations.

**How to create**:
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "SpecKit DroneGo")
4. Select scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
5. Click "Generate token"
6. Copy the token and add it to your `.env` file

**Format**: `github_pat_XXXXXXXXXXXXXXXXX`

## Security

⚠️ **IMPORTANT**: The `.env` file is included in `.gitignore` and will NOT be committed to version control.

- Never commit your `.env` file to git
- Never share your GitHub token publicly
- If you accidentally expose your token, revoke it immediately at https://github.com/settings/tokens

## File Structure

```
DroneGo/
├── .env                           # Your actual secrets (gitignored)
├── .env.example                   # Template file (safe to commit)
├── .gitignore                     # Ensures .env is never committed
└── .specify/
    └── scripts/
        └── powershell/
            ├── common.ps1         # Auto-loads .env
            └── load-env.ps1       # Manual loading script
```

## Troubleshooting

### Environment variable not loading

1. Verify `.env` file exists in project root:
   ```powershell
   Test-Path .env
   ```

2. Check file contents:
   ```powershell
   Get-Content .env
   ```

3. Manually load and check:
   ```powershell
   . .\.specify\scripts\powershell\load-env.ps1
   $env:GITHUB_TOKEN
   ```

### "No .env file found" error

Create the `.env` file from the template:
```powershell
cp .env.example .env
# Then edit .env with your actual values
```

### Token not working

Verify your token has the correct permissions:
- Go to https://github.com/settings/tokens
- Check the token has `repo` and `workflow` scopes
- If not, create a new token with correct scopes
- Update your `.env` file with the new token

## Adding More Variables

To add new environment variables:

1. Add them to `.env.example` as a template (with placeholder values)
2. Add them to your personal `.env` file with actual values
3. They'll automatically be loaded by SpecKit scripts
