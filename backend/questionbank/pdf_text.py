"""
The ONLY PDF-library-dependent module: turn a PDF file into per-page text.

Kept tiny and isolated so the parser (pdf_parser.py) stays pure and testable.
Prefers PyMuPDF (fitz), falls back to pdfplumber. If neither is installed, raises
a clear error telling the operator what to add to requirements — this is an M3
deploy-time dependency, intentionally not imported at module load.
"""
from __future__ import annotations


def extract_pages(pdf_path: str) -> list[str]:
    """Return a list of page text strings, one per page, in document order."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        fitz = None

    if fitz is not None:
        with fitz.open(pdf_path) as doc:
            return [page.get_text("text") for page in doc]

    try:
        import pdfplumber
    except ImportError:
        pdfplumber = None

    if pdfplumber is not None:
        pages: list[str] = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                pages.append(page.extract_text() or "")
        return pages

    raise RuntimeError(
        "No PDF text backend available. Add 'PyMuPDF' (preferred) or 'pdfplumber' "
        "to requirements to enable PDF import (M3)."
    )


def extract_page_images(pdf_path: str) -> dict[int, list[tuple[str, bytes]]]:
    """Return ``{page_number(1-based): [(ext, image_bytes), ...]}`` for embedded images.

    Image extraction requires PyMuPDF (pdfplumber is text-only). Returns an empty
    dict when PyMuPDF is unavailable so TEXT import still works without it — Math
    diagram import simply degrades to text-only until PyMuPDF is installed.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return {}

    out: dict[int, list[tuple[str, bytes]]] = {}
    with fitz.open(pdf_path) as doc:
        for page_index, page in enumerate(doc, start=1):
            images: list[tuple[str, bytes]] = []
            for img in page.get_images(full=True):
                xref = img[0]
                try:
                    info = doc.extract_image(xref)
                except Exception:
                    continue
                data = info.get("image") if info else None
                if data:
                    images.append((info.get("ext", "png"), data))
            if images:
                out[page_index] = images
    return out
