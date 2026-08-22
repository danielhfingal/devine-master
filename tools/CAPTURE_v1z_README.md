# IMPORTANT — capture files

If tools/capture_bridge.py is empty after a bad push, restore from your working local copy
(the meter probe already proved your local bridge with build v1x-meter).

Full desk HTML is not forced through git (large). Use project artifact:
  DEVINE_MASTER_CAPTURE_v1z.html

Serve:
  cd tools
  python -m http.server 8766
Open:
  http://127.0.0.1:8766/DEVINE_MASTER_CAPTURE_v1z.html

Must see orange banner: CAPTURE DESK v1z
