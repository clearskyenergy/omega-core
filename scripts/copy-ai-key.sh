#!/bin/bash
# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
#
# Copies ANTHROPIC_API_KEY (the platform key Jarvis and AI extraction use)
# from the legacy tools project (clearsky-portal-h7d9) into omega-core's
# production environment, then redeploys. The key is never printed; it goes
# from Vercel to Vercel through a temporary file that is removed at the end.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo
echo "1) Reading the key from the clearsky-portal-h7d9 project…"
( cd "$TMP" && npx -y vercel@latest link --yes --project clearsky-portal-h7d9 >/dev/null 2>&1 \
            && npx -y vercel@latest env pull --environment=production --yes .env.src >/dev/null 2>&1 )
VAL=$(grep -E '^ANTHROPIC_API_KEY=' "$TMP/.env.src" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
if [ -z "$VAL" ]; then echo "   ANTHROPIC_API_KEY is not on that project. Get a key from console.anthropic.com and run:"; echo "   npx vercel env add ANTHROPIC_API_KEY production"; exit 1; fi
case "$VAL" in sk-ant-*) echo "   Found a key of the right shape.";; *) echo "   The stored value does not look like an Anthropic key (sk-ant-…). Stopping."; exit 1;; esac

echo
echo "2) Setting ANTHROPIC_API_KEY on omega-core (production)…"
cd "$ROOT"
npx -y vercel@latest env rm ANTHROPIC_API_KEY production --yes >/dev/null 2>&1 || true
printf '%s' "$VAL" | npx -y vercel@latest env add ANTHROPIC_API_KEY production >/dev/null
unset VAL
echo "   Set."

echo
echo "3) Redeploying…"
git commit -q --allow-empty -m "chore: redeploy with the platform AI key in place"
git push -q origin main
echo "   Pushed. Jarvis answers once the build finishes (about two minutes)."
