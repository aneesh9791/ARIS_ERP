#!/bin/bash
# ── ARIS ERP — Generate SRI hashes for CDN scripts ────────────────────────────
# Run this ONCE from the aris-backend directory after downloading the app:
#   chmod +x generate-sri.sh && ./generate-sri.sh
#
# It fetches each CDN file, computes the sha384 hash, then patches index.html
# with the correct integrity= attributes (V-005 fix).
# ─────────────────────────────────────────────────────────────────────────────

set -e
HTML="public/index.html"

patch_sri() {
  local url="$1"
  local marker="$2"
  echo -n "  Hashing $(basename $url) ... "
  local hash
  hash=$(curl -fsSL "$url" | openssl dgst -sha384 -binary | openssl base64 -A)
  local integrity="sha384-${hash}"
  echo "$integrity"
  # Insert integrity + crossorigin attributes next to the matching src=
  sed -i "s|src=\"${url}\"|src=\"${url}\" integrity=\"${integrity}\" crossorigin=\"anonymous\"|g" "$HTML"
}

echo "==> Generating SRI hashes for CDN scripts in $HTML ..."

patch_sri "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js" "chart"
patch_sri "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" "xlsx"
patch_sri "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" "jspdf"
patch_sri "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js" "autotable"
patch_sri "https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.2/js/bootstrap.bundle.min.js" "bootstrap"

echo ""
echo "==> Done! SRI hashes written to $HTML."
echo "    Verify with: grep 'integrity=' $HTML"
