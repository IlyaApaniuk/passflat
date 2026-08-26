#!/usr/bin/env bash
#
# Build downloadable legal-template assets from Markdown sources.
#
#   Polish (binding):      DOCX (editable) + PDF (read-only)
#   en / ru / uk (info):   PDF only
#
# Sources:
#   docs/legal-templates/<doc>.md                      (Polish, binding)
#   docs/legal-templates/translations/<doc>-<lang>.md  (informational)
#
# Output:
#   public/documents/<doc>.docx, <doc>.pdf, <doc>-<lang>.pdf
#
# Requires: pandoc + a PDF engine (typst). Install with:
#   brew install pandoc typst
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT/docs/legal-templates"
TR_DIR="$SRC_DIR/translations"
OUT_DIR="$ROOT/public/documents"

DOCS=(cesja-umowy-najmu umowa-podnajmu umowa-wspollokatorska protokol-zdawczo-odbiorczy)
LANGS=(en ru uk)

PDF_OPTS=(--pdf-engine=typst -V fontsize=10.5pt)

if ! command -v pandoc >/dev/null 2>&1; then
  echo "error: pandoc not found. Install with: brew install pandoc typst" >&2
  exit 1
fi
if ! command -v typst >/dev/null 2>&1; then
  echo "error: typst (PDF engine) not found. Install with: brew install typst" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

for doc in "${DOCS[@]}"; do
  src="$SRC_DIR/$doc.md"
  echo "→ $doc (PL): DOCX + PDF"
  pandoc "$src" -o "$OUT_DIR/$doc.docx"
  pandoc "$src" "${PDF_OPTS[@]}" -o "$OUT_DIR/$doc.pdf"

  for lang in "${LANGS[@]}"; do
    tr_src="$TR_DIR/$doc-$lang.md"
    if [[ -f "$tr_src" ]]; then
      echo "→ $doc ($lang): PDF"
      pandoc "$tr_src" "${PDF_OPTS[@]}" -o "$OUT_DIR/$doc-$lang.pdf"
    else
      echo "  ! skipping $doc-$lang (missing $tr_src)" >&2
    fi
  done
done

echo "Done. Output in: $OUT_DIR"
