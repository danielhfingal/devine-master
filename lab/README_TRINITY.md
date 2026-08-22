# Trinity desk (lab)

Modules: **DEVINE MASTER** · **SourceCast** · **StudioCraft**

Gold module tabs on each column. INFO hover re-binds after module load.

## Current pack (if git files lag)

Download: https://litter.catbox.moe/v61n4y.zip

```powershell
cd F:\devine-master-fresh\trinity-lab
Invoke-WebRequest -Uri "https://litter.catbox.moe/v61n4y.zip" -OutFile ".\pack.zip"
Expand-Archive -Path ".\pack.zip" -DestinationPath "." -Force
python -m http.server 8080
```

Open: `http://127.0.0.1:8080/DEVINE_MASTER_Trinity_standalone.html`

Banner should include **`tabs`**.

## From repo (after full lab tree is on origin/lab)

```powershell
cd F:\devine-master-fresh\devine-master
git fetch origin
git checkout lab
git pull origin lab
cd lab
python -m http.server 8080
```
