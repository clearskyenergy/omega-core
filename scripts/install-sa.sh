#!/usr/bin/env bash
# Installs a freshly downloaded clearsky-portal service account key.
#
# NEVER PRINTS THE KEY. The file is moved and piped; the only thing echoed from
# inside it is project_id and client_email, which are identifiers rather than
# secrets and are the two fields worth checking before you wire a credential
# into production. If either is wrong, stop — a key for the wrong project
# authenticates fine and then reads an empty database.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="$(ls -t ~/Downloads/clearsky-portal-firebase-adminsdk-*.json \
             ~/Downloads/clearsky-portal-*.json 2>/dev/null | head -1 || true)"
if [ -z "${SRC:-}" ]; then
  echo "No clearsky-portal key found in ~/Downloads."
  echo "Firebase Console > Project settings > Service accounts > Generate new private key."
  exit 1
fi

PROJ=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('project_id',''))" "$SRC")
WHO=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('client_email',''))" "$SRC")
echo "Found: $(basename "$SRC")"
echo "  project_id   : $PROJ"
echo "  client_email : $WHO"
if [ "$PROJ" != "clearsky-portal" ]; then
  echo "REFUSING: that key is for '$PROJ', not clearsky-portal."
  exit 1
fi

mv "$SRC" ./sa.json
chmod 600 ./sa.json
echo "Installed at ~/omega-core/sa.json (gitignored, owner-read-only)."

# Vercel reads the value from stdin, so it is never rendered anywhere.
for ENVN in production preview development; do
  if tr -d '\n' < ./sa.json | ./node_modules/.bin/vercel env add FIREBASE_SERVICE_ACCOUNT "$ENVN" >/dev/null 2>&1; then
    echo "  set on $ENVN"
  else
    echo "  $ENVN: already set or refused - check with: npx vercel env ls"
  fi
done

echo
echo "Names only, no values:"
./node_modules/.bin/vercel env ls 2>/dev/null | awk 'NF>3 && $1 ~ /^[A-Z]/ {print "  "$1}' | sort -u
