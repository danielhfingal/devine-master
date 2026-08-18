# DEVINE MASTER — GitHub workflow

**Loop:** Edit in Grok project → **push to GitHub** → next session **pulls GitHub**.

GitHub is the living source of truth. Chat is temporary.

---

## 1. One-time: create the repo on GitHub

1. Log in at [https://github.com](https://github.com)
2. **New repository**
   - Name: `devine-master` (or similar)
   - **Private** (recommended — masters + catalogue)
   - Do **not** add a README if you will push an existing folder (avoids merge noise)
3. Copy the repo URL, e.g. `https://github.com/YOUR_USER/devine-master.git`

---

## 2. One-time: put the project on your PC

### Option A — from Grok transfer zips (already in this project)

Download and unzip into one folder, e.g. `~/Music/devine-master/`:

- `DEVINE_MASTER_TRANSFER.zip` → docs + code + JSON  
- `DEVINE_MASTER_TRANSFER_AUDIO_SOURCE.zip` → into `tracks/`  
- `DEVINE_MASTER_TRANSFER_AUDIO_MASTERED_MP3.zip`  
- `DEVINE_MASTER_TRANSFER_AUDIO_STRONG.zip`  
- `DEVINE_MASTER_TRANSFER_AUDIO_MASTERED_WAV_1.zip` + `_2.zip`  

Layout should look like:

```text
devine-master/
  00_README_START_HERE.md
  00_BETA_STATE.md
  …
  TRANSFER_PROMPT.txt
  GITHUB_WORKFLOW.md
  DEVINE_MASTER_Beta (29).html
  ai-mastering/
  tracks/
    source/
    mastered/
    *.json
  catalogue/          # if present from zip
```

### Option B — you already have the folder from Grok Files

Use that directory as the repo root.

---

## 3. One-time: install Git (+ LFS for audio)

**Windows:** [https://git-scm.com/download/win](https://git-scm.com/download/win)  
**macOS:** `xcode-select --install` or install Git; then Git LFS  
**Linux:** `sudo apt install git git-lfs`

```bash
git lfs install
```

---

## 4. One-time: first push

In a terminal, `cd` to your project folder:

```bash
cd ~/Music/devine-master   # your path

git init
git branch -M main

# Track large audio with LFS (do this BEFORE git add)
git lfs track "*.wav"
git lfs track "*.flac"
git lfs track "*.mp3"
# optional: lab renders if you keep them
git lfs track "tracks/lab_3x3_renders/**"

git add .gitattributes
git add .
git status   # review; remove junk if needed

git commit -m "Initial DEVINE MASTER knowledge base + engine + audio"

git remote add origin https://github.com/YOUR_USER/devine-master.git
git push -u origin main
```

### Auth when GitHub asks

- **HTTPS:** use a **Personal Access Token** as the password  
  GitHub → Settings → Developer settings → Personal access tokens  
  Scope: `repo` (for private repos)
- **SSH (optional):** add an SSH key to GitHub, then:
  ```bash
  git remote set-url origin git@github.com:YOUR_USER/devine-master.git
  git push -u origin main
  ```

First push of WAVs can take several minutes (LFS upload).

---

## 5. Everyday: after you edit in Grok

Grok project files do **not** auto-sync to GitHub. You (or a script on your PC) must copy changes and push.

### Practical pattern

1. Work in Grok (docs, code, Beta notes).  
2. **Download** changed files from Grok Files (or re-download a small zip of docs/code).  
3. On your PC, overwrite the matching files in `devine-master/`.  
4. Push:

```bash
cd ~/Music/devine-master
git add -A
git status
git commit -m "Describe what changed (e.g. Beta state + chain density)"
git push
```

### Rule of thumb for commit messages

- `docs: update 00_BETA_STATE after Strong remake`
- `fix: crest density stage in chain.py`
- `data: refresh catalogue JSON 2026-08-18`

---

## 6. Next Grok session: pull from GitHub

**With a GitHub connector (if your Grok account has it):**  
Connect GitHub → grant the repo → say: *Use private repo YOUR_USER/devine-master, branch main. Read TRANSFER_PROMPT.txt and 00_BETA_STATE.md first.*

**Without a connector:**

1. On your PC: `git pull` (always latest).  
2. Upload into the new Grok project at least:
   - all `00_*.md`–`04_*.md`, `TRANSFER_PROMPT.txt`
   - `ai-mastering/`
   - `DEVINE_MASTER_Beta (29).html`
   - key `tracks/*.json`  
3. Paste `TRANSFER_PROMPT.txt` as message 1.

---

## 7. What belongs in Git vs what can stay out

| In repo | Optional / out |
|---------|----------------|
| All transfer markdown, Beta state | Huge one-off lab renders (regenerate) |
| `ai-mastering/` | Duplicate zips of the whole project |
| Beta HTML | `__pycache__`, `.DS_Store` |
| Catalogue JSON, priors | Secrets / API keys (never) |
| Sources + masters via LFS | |

Suggested `.gitignore`:

```gitignore
__pycache__/
*.pyc
.DS_Store
*.zip
DEVINE_MASTER_TRANSFER*.zip
.env
*.log
tracks/lab_3x3_renders/
```

(You can still keep lab renders locally without committing them.)

---

## 8. Optional: GitHub Pages (docs only)

Pages is for **public HTML docs**, not private masters.

- Fine for a public “what is DEVINE MASTER” page from markdown.  
- **Do not** publish private masters or full catalogue on public Pages.  
- For private continuity, the **repo + pull** loop is enough; Pages is optional marketing/docs.

---

## 9. Checklist: “did I push?”

After any meaningful Grok work:

- [ ] `00_BETA_STATE.md` updated  
- [ ] Code/docs saved in Grok Files  
- [ ] Copied to local `devine-master/`  
- [ ] `git add -A && git commit && git push`  
- [ ] GitHub website shows the new commit  

---

## 10. New machine or new Grok account

```bash
git clone https://github.com/YOUR_USER/devine-master.git
cd devine-master
git lfs install
git lfs pull
```

Then feed that tree (or the doc pack) to Grok and paste `TRANSFER_PROMPT.txt`.
