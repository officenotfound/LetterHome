#!/bin/bash
# Tests whether this Zoho mailbox can use the Zoho Mail API (US data centre, zoho.com).
# Your client secret and code are typed into this terminal only. Nothing is printed back or saved.
read -r -p "Client ID: " CID
read -r -s -p "Client Secret (hidden): " SEC; echo
read -r -s -p "Code from 'Generate Code' (hidden): " CODE; echo

R=$(curl -s -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d grant_type=authorization_code -d client_id="$CID" -d client_secret="$SEC" -d code="$CODE")
TOKEN=$(echo "$R" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
if [ -z "$TOKEN" ]; then
  echo "Step 1 FAILED: Zoho would not give a token. Zoho said:"
  echo "$R" | sed -E 's/"(access|refresh)_token":"[^"]*"/"\1_token":"[hidden]"/g'
  exit 1
fi
echo "Step 1 OK: Zoho gave a token."

A=$(curl -s -w "\nHTTP %{http_code}" -H "Authorization: Zoho-oauthtoken $TOKEN" https://mail.zoho.com/api/accounts)
echo "Step 2: asking for your mail account -> $(echo "$A" | tail -1)"
ACC=$(echo "$A" | sed -n 's/.*"accountId":"\{0,1\}\([0-9]*\)"\{0,1\}.*/\1/p' | head -1)
if [ -z "$ACC" ]; then echo "Step 2 FAILED. Zoho said:"; echo "$A" | head -c 400; exit 1; fi

M=$(curl -s -w "\nHTTP %{http_code}" -H "Authorization: Zoho-oauthtoken $TOKEN" "https://mail.zoho.com/api/accounts/$ACC/messages/view?limit=1")
CODE2=$(echo "$M" | tail -1)
echo "Step 3: reading the newest message -> $CODE2"
if echo "$M" | grep -q '"subject"'; then echo "RESULT: the API can read your mail. Free plan works."; else echo "RESULT: no message came back. Zoho said:"; echo "$M" | head -c 400; fi
