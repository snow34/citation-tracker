"""Formats a Citation into a reference-list entry or in-text citation, per style.

Deliberately rule-based rather than a full CSL (Citation Style Language) engine —
the Citation model only stores title/authors/doi/journal/year (no volume, issue, or
page range), so a CSL processor wouldn't produce more complete output anyway. Output
is plain text (no italics/markup) since browsers' clipboard write API is plain-text
and most paste targets would show literal asterisks/markdown rather than formatting.

Each style registers one or more "kinds" — a reference-list entry plus, for
author-date styles, in-text parenthetical/narrative forms. Adding a new style is:
write the kind formatters plus a format_many, and register a CitationStyle in STYLES.
"""

from collections.abc import Callable, Iterable
from typing import NamedTuple

from app.core.exceptions import AppError
from app.models.citation import Citation

_MAX_SHORT_TITLE = 40


def _family_name(name: str) -> str:
    parts = name.strip().split()
    return parts[-1] if parts else name.strip()


def _short_title(title: str) -> str:
    title = title.strip()
    return title if len(title) <= _MAX_SHORT_TITLE else title[:_MAX_SHORT_TITLE].rstrip() + "…"


# ------------------------------------------------------------------ APA (7th ed.)


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


def _reference_apa(citation: Citation) -> str:
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


def _authors_in_text_apa(authors: list[str], *, narrative: bool) -> str:
    families = [_family_name(a) for a in authors if a.strip()]
    if not families:
        return ""
    if len(families) == 1:
        return families[0]
    if len(families) == 2:
        joiner = "and" if narrative else "&"
        return f"{families[0]} {joiner} {families[1]}"
    # APA 7 always abbreviates 3+ authors to the first name plus "et al." in-text.
    return f"{families[0]} et al."


def _in_text_parenthetical_apa(citation: Citation) -> str:
    year = citation.year if citation.year else "n.d."
    authors = _authors_in_text_apa(citation.authors, narrative=False)
    if not authors:
        return f'("{_short_title(citation.title)}," {year})'
    return f"({authors}, {year})"


def _in_text_narrative_apa(citation: Citation) -> str:
    year = citation.year if citation.year else "n.d."
    authors = _authors_in_text_apa(citation.authors, narrative=True)
    if not authors:
        return f'"{_short_title(citation.title)}" ({year})'
    return f"{authors} ({year})"


def _sort_key_apa(citation: Citation) -> tuple[str, str]:
    if citation.authors:
        family = citation.authors[0].strip().split()[-1].lower()
    else:
        family = ""
    return (family, citation.title.lower())


def _format_many_apa(citations: Iterable[Citation]) -> str:
    ordered = sorted(citations, key=_sort_key_apa)
    return "\n\n".join(_reference_apa(c) for c in ordered)


# ------------------------------------------------------------------------ registry


class Kind(NamedTuple):
    label: str
    format_one: Callable[[Citation], str]


class CitationStyle(NamedTuple):
    key: str
    label: str
    format_many: Callable[[Iterable[Citation]], str]
    kinds: dict[str, Kind]


STYLES: dict[str, CitationStyle] = {
    "apa": CitationStyle(
        key="apa",
        label="APA (7th edition)",
        format_many=_format_many_apa,
        kinds={
            "reference": Kind("Reference list entry", _reference_apa),
            "in_text_parenthetical": Kind("In-text (parenthetical)", _in_text_parenthetical_apa),
            "in_text_narrative": Kind("In-text (narrative)", _in_text_narrative_apa),
        },
    ),
}

DEFAULT_KIND = "reference"


def list_styles() -> list[CitationStyle]:
    return list(STYLES.values())


def _get_style(style: str) -> CitationStyle:
    resolved = STYLES.get(style.lower())
    if resolved is None:
        available = ", ".join(sorted(STYLES))
        raise AppError(f"Unknown citation style '{style}'. Available styles: {available}")
    return resolved


def format_citation(citation: Citation, style: str, kind: str = DEFAULT_KIND) -> str:
    resolved_style = _get_style(style)
    resolved_kind = resolved_style.kinds.get(kind.lower())
    if resolved_kind is None:
        available = ", ".join(sorted(resolved_style.kinds))
        raise AppError(
            f"Unknown citation kind '{kind}' for style '{style}'. Available kinds: {available}"
        )
    return resolved_kind.format_one(citation)


def format_bibliography(citations: Iterable[Citation], style: str) -> str:
    return _get_style(style).format_many(citations)
