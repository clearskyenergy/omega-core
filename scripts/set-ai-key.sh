#!/bin/bash
# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
#
# Sets ANTHROPIC_API_KEY (the platform key Jarvis and AI extraction use) on
# omega-core production from a key you paste, then redeploys. The key is
# not echoed while you paste it and is never printed.
set -e
cd "$(dirname "$0")/.."

echo
# The key is taken from the clipboard, not typed: a hidden prompt cannot show
# a partial paste, and a partial key is what "API key is invalid" looks like.
VAL=$(pbpaste | tr -d '[:space:]')
case "$VAL" in sk-ant-*) ;; *) VAL="";; esac
if [ -z "$VAL" ]; then
  echo "1) A browser tab is opening on the Anthropic console (API keys)."
  echo "   Click  'Create Key',  name it  omega-core,  click Create, then the  Copy  button."
  open "https://console.anthropic.com/settings/keys"
  echo
  echo "2) With the key copied, press Return here (nothing to paste — it is read from the clipboard)."
  read -r _
  VAL=$(pbpaste | tr -d '[:space:]')
fi
case "$VAL" in
  sk-ant-*) ;;
  *) echo "   The clipboard does not hold an Anthropic key (they start with sk-ant-). Copy it and run this again."; exit 1;;
esac
if [ ${#VAL} -lt 80 ]; then echo "   The copied key is too short (${#VAL} characters) — it was cut off. Copy it again with the Copy button."; exit 1; fi
echo "   Key of the right shape on the clipboard (${#VAL} characters)."

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
