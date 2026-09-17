#!/bin/bash
# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
#
# Sets ANTHROPIC_API_KEY (the platform key Jarvis and AI extraction use) on
# omega-core production from a key you paste, then redeploys. The key is
# not echoed while you paste it and is never printed.
set -e
cd "$(dirname "$0")/.."

echo
echo "1) A browser tab is opening on the Anthropic console (API keys)."
echo "   Click  'Create Key',  name it  omega-core,  click Create, then  Copy."
open "https://console.anthropic.com/settings/keys"
echo
printf "2) Paste the key here and press Return (nothing shows as you paste): "
read -r -s VAL; echo
VAL=$(printf '%s' "$VAL" | tr -d '[:space:]')
case "$VAL" in
  sk-ant-*) ;;
  *) echo "   That does not look like an Anthropic key (they start with sk-ant-). Nothing changed."; exit 1;;
esac

echo
echo "3) Setting ANTHROPIC_API_KEY on omega-core (production)…"
npx -y vercel@latest env rm ANTHROPIC_API_KEY production --yes >/dev/null 2>&1 || true
printf '%s' "$VAL" | npx -y vercel@latest env add ANTHROPIC_API_KEY production >/dev/null
unset VAL
echo "   Set."

echo
echo "4) Redeploying…"
git commit -q --allow-empty -m "chore: redeploy with the platform AI key in place"
git push -q origin main 2>/dev/null
echo "   Pushed. Jarvis answers once the build finishes (about two minutes)."
