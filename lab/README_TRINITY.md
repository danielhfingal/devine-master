# Trinity on F:

## After git pull origin lab

```powershell
cd F:\devine-master-fresh\devine-master
git fetch origin
git checkout lab
git pull origin lab
cd lab
python -m http.server 8080
```

Open:

```text
http://127.0.0.1:8080/DEVINE_MASTER_Trinity_standalone.html
```

Banner must include `sc-clear`.

If standalone is missing, use modular:

```text
http://127.0.0.1:8080/DEVINE_MASTER.html
```

Requires `css/` + `js/` next to the HTML.
