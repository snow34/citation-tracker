"""Formats a Citation into a reference-list entry string for a given citation style.

Deliberately rule-based rather than a full CSL (Citation Style Language) engine —
the Citation model only stores title/authors/doi/journal/year (no volume, issue, or
page range), so a CSL processor wouldn't produce more complete output anyway. Output
is plain text (no italics/markup) since browsers' clipboard write API is plain-text
and most paste targets would show literal asterisks/markdown rather than formatting.

Adding a new style is: write a `format_one`/`format_many` pair, register it in STYLES.
"""

from collections.abc import Callable, Iterable
from typing import NamedTuple

from app.core.exceptions import AppError
from app.models.citation import Citation


def _name_to_apa(name: str) -> str:
    parts = name.strip().split()
    if len(parts) < 2:
        return name.strip()
    family = parts[-1]
    initials = " ".join(f"{p[0].upper()}." for p in parts[:-1] if p)
    return f"{family}, {initials}"


def _authors_apa(authors: list[str]) -> str:
    names = [_name_to_apa(a) for a in authors if a.strip()]
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]}, & {names[1]}"
    if len(names) <= 20:
        return ", ".join(names[:-1]) + f", & {names[-1]}"
    # APA 7 rule for 21+ authors: first 19, ellipsis, then the last.
    return ", ".join(names[:19]) + ", ... " + names[-1]


def _format_one_apa(citation: Citation) -> str:
    year = f"({citation.year})" if citation.year else "(n.d.)"
    authors = _authors_apa(citation.authors)
    lead = f"{authors} {year}." if authors else f"{year}."

    title = citation.title.strip().rstrip(".")
    segments = [lead, f"{title}."]

    if citation.journal:
        segments.append(f"{citation.journal.strip()}.")
    if citation.doi:
        doi = citation.doi.strip()
        if not doi.lower().startswith("http"):
            doi = f"https://doi.org/{doi}"
        segments.append(doi)

    return " ".join(segments)


def _sort_key_apa(citation: Citation) -> tuple[str, str]:
    if citation.authors:
        family = citation.authors[0].strip().split()[-1].lower()
    else:
        family = ""
    return (family, citation.title.lower())


def _format_many_apa(citations: Iterable[Citation]) -> str:
    ordered = sorted(citations, key=_sort_key_apa)
    return "\n\n".join(_format_one_apa(c) for c in ordered)


class CitationStyle(NamedTuple):
    key: str
    label: str
    format_one: Callable[[Citation], str]
    format_many: Callable[[Iterable[Citation]], str]


STYLES: dict[str, CitationStyle] = {
    "apa": CitationStyle("apa", "APA (7th edition)", _format_one_apa, _format_many_apa),
}


def list_styles() -> list[CitationStyle]:
    return list(STYLES.values())


def _get_style(style: str) -> CitationStyle:
    resolved = STYLES.get(style.lower())
    if resolved is None:
        available = ", ".join(sorted(STYLES))
        raise AppError(f"Unknown citation style '{style}'. Available styles: {available}")
    return resolved


def format_citation(citation: Citation, style: str) -> str:
    return _get_style(style).format_one(citation)


def format_bibliography(citations: Iterable[Citation], style: str) -> str:
    return _get_style(style).format_many(citations)
