#!/bin/bash
# Turns a Zoho "Generate Code" into a long-lived key for one mailbox, and saves it to ~/zoho-mail.env on THIS Mac.
# Usage: ./scripts/zoho-get-keys.sh jeff      (or sales, support)
# Nothing secret is printed. The file is readable only by you (chmod 600).
LABEL=$(echo "${1:-}" | tr 'a-z' 'A-Z' | tr -cd 'A-Z0-9')
if [ -z "$LABEL" ]; then echo "Usage: ./scripts/zoho-get-keys.sh jeff   (or sales, support)"; exit 1; fi
OUT="$HOME/zoho-mail.env"
read -r -p "Client ID: " CID
read -r -s -p "Client Secret (hidden): " SEC; echo
read -r -s -p "Code from 'Generate Code' (hidden): " CODE; echo

R=$(curl -s -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d grant_type=authorization_code -d client_id="$CID" -d client_secret="$SEC" -d code="$CODE")
REFRESH=$(echo "$R" | sed -n 's/.*"refresh_token":"\([^"]*\)".*/\1/p')
if [ -z "$REFRESH" ]; then
  echo "FAILED: Zoho did not give a long-lived key. Zoho said:"
  echo "$R" | sed -E 's/"(access|refresh)_token":"[^"]*"/"\1_token":"[hidden]"/g'
  exit 1
fi
touch "$OUT" && chmod 600 "$OUT"
grep -v "^ZOHO_${LABEL}_" "$OUT" > "$OUT.tmp" 2>/dev/null; mv "$OUT.tmp" "$OUT"; chmod 600 "$OUT"
{
  echo "ZOHO_${LABEL}_CLIENT_ID=$CID"
  echo "ZOHO_${LABEL}_CLIENT_SECRET=$SEC"
  echo "ZOHO_${LABEL}_REFRESH_TOKEN=$REFRESH"
} >> "$OUT"
echo "Saved the $LABEL key to $OUT. ($(grep -c '_REFRESH_TOKEN=' "$OUT") of 3 mailboxes saved so far.)"
