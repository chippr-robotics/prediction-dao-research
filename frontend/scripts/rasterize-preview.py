#!/usr/bin/env python3
"""Rasterize preview statement PDFs to PNGs for visual review (issue #1026).

    python3 frontend/scripts/rasterize-preview.py <pdfDir> [outDir] [--dpi 130]

Design-review only: the statement itself is pure vector, and nothing in the app
depends on this. It exists so a rendered page can actually be looked at — a PDF
layout bug is invisible in a unit test and obvious in an image.
"""
import sys
import pathlib
import fitz  # pymupdf


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dpi = 130
    for a in sys.argv[1:]:
        if a.startswith("--dpi"):
            dpi = int(a.split("=", 1)[1] if "=" in a else 130)

    if not args:
        print(__doc__)
        return 2
    src = pathlib.Path(args[0])
    out = pathlib.Path(args[1]) if len(args) > 1 else src / "png"
    out.mkdir(parents=True, exist_ok=True)

    count = 0
    for pdf in sorted(src.glob("*.pdf")):
        doc = fitz.open(pdf)
        for i, page in enumerate(doc, start=1):
            pix = page.get_pixmap(dpi=dpi)
            target = out / f"{pdf.stem}_p{i}.png"
            pix.save(target)
            count += 1
        print(f"  {pdf.name}: {doc.page_count} page(s)")
        doc.close()
    print(f"\nWrote {count} PNGs to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
