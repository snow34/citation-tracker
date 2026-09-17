// Injected into the active tab via scripting.executeScript. Reads the
// Highwire-Press-style `citation_*` meta tags that Scopus, ScienceDirect,
// Taylor & Francis Online, Wiley, Springer, Google Scholar, and most other
// scholarly publishers embed, so one scraper covers "almost any" article
// page rather than needing a parser per site. Falls back to a DOI regex
// scan and the document title when tags are missing.
(function () {
  function metaContent(name) {
    const el = document.querySelector(
      `meta[name="${name}" i], meta[property="${name}" i]`
    );
    const value = el && el.getAttribute("content");
    return value ? value.trim() : null;
  }

  function metaContentAll(name) {
    return Array.from(document.querySelectorAll(`meta[name="${name}" i]`))
      .map((el) => (el.getAttribute("content") || "").trim())
      .filter(Boolean);
  }

  function firstMeta(names) {
    for (const name of names) {
      const value = metaContent(name);
      if (value) return value;
    }
    return null;
  }

  function normalizeDoi(raw) {
    if (!raw) return null;
    let doi = raw.trim();
    doi = doi.replace(/^doi:\s*/i, "");
    doi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    doi = doi.replace(/[.,;)\]]+$/, "");
    return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : null;
  }

  function findDoi() {
    const metaDoi = normalizeDoi(
      firstMeta(["citation_doi", "dc.identifier", "prism.doi", "doi"])
    );
    if (metaDoi) return metaDoi;

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) {
      const match = canonical.href.match(/10\.\d{4,9}\/\S+/);
      if (match) {
        const doi = normalizeDoi(match[0]);
        if (doi) return doi;
      }
    }

    const bodyText = document.body ? document.body.innerText : "";
    const match = bodyText.match(/\b10\.\d{4,9}\/[^\s"'<>]+/);
    return match ? normalizeDoi(match[0]) : null;
  }

  function extractYear() {
    const raw = firstMeta([
      "citation_publication_date",
      "citation_date",
      "citation_online_date",
      "prism.coverDate",
      "dc.date",
    ]);
    if (!raw) return null;
    const match = raw.match(/\d{4}/);
    return match ? Number(match[0]) : null;
  }

  const authors = metaContentAll("citation_author");
  const title = firstMeta(["citation_title", "dc.title"]) || document.title || null;
  const journal = firstMeta([
    "citation_journal_title",
    "citation_conference_title",
    "prism.publicationName",
  ]);
  const abstract = firstMeta(["citation_abstract", "dc.description"]);

  return {
    doi: findDoi(),
    title,
    authors,
    journal,
    year: extractYear(),
    abstract,
    pageUrl: location.href,
  };
})();
