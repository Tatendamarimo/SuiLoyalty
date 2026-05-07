#!/usr/bin/env bash
#
# Assemble the SuiLoyalty final-year report from markdown chapters into
# a single styled .docx submission file.
#
# Usage:
#   ./build_report.sh           # full report
#   ./build_report.sh --partial # only what's drafted so far (skips missing chapters)
#
# Output: SuiLoyalty_Report.docx in this directory.

set -euo pipefail

cd "$(dirname "$0")"

# Pandoc input order. Frontmatter first, then chapters in numerical order,
# then references and appendices. Pandoc handles missing files with --partial.
CHAPTERS=(
  Frontmatter.md
  Chapter1_Introduction.md
  Chapter2_LiteratureReview.md
  Chapter3_Methodology.md
  Chapter4_Design.md
  Chapter5_Implementation.md
  Chapter6_Testing.md
  Chapter7_Evaluation.md
  Chapter8_CriticalReflection.md
  References.md
  Appendices.md
)

# In partial mode we silently skip files that don't exist yet.
PARTIAL=${1:-}
INPUTS=()
for f in "${CHAPTERS[@]}"; do
  if [[ -f "$f" ]]; then
    INPUTS+=("$f")
  elif [[ "$PARTIAL" != "--partial" ]]; then
    echo "ERROR: missing chapter file '$f' (re-run with --partial to skip)" >&2
    exit 1
  fi
done

if [[ ${#INPUTS[@]} -eq 0 ]]; then
  echo "ERROR: no chapter files found" >&2
  exit 1
fi

OUTPUT=SuiLoyalty_Report.docx

echo "Building $OUTPUT from ${#INPUTS[@]} files..."
for f in "${INPUTS[@]}"; do
  echo "  + $f"
done

pandoc \
  "${INPUTS[@]}" \
  --from markdown \
  --to docx \
  --reference-doc=reference.docx \
  --toc \
  --toc-depth=2 \
  --metadata title="SuiLoyalty" \
  --metadata author="Tatenda Marimo (P2964932)" \
  --metadata date="May 2026" \
  --output "$OUTPUT"

# Word count summary — measured on the markdown source (rough; final
# .docx word count from TurnItIn is the authoritative figure).
TOTAL_WORDS=0
for f in "${INPUTS[@]}"; do
  WC=$(wc -w < "$f")
  printf "  %-35s %5d words\n" "$f" "$WC"
  TOTAL_WORDS=$((TOTAL_WORDS + WC))
done

echo
echo "Built: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo "Total markdown source words: $TOTAL_WORDS (target: 10,000–12,000)"
