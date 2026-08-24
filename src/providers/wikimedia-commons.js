/* =====================================================================
   Tesela · providers/wikimedia-commons — fotografías y atribución Commons
   ===================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = g;
  g.providers = Object.assign(g.providers || {}, api);
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  const DEFAULT_ENDPOINT = "https://commons.wikimedia.org/w/api.php";
  const DEFAULT_EXCLUDED = /\b(coat of arms|flags?|maps?|locator|logos?|emblems?|seals?|icons?|escuts?|banderes?|banderas?|mapes?|mapas?|blasons?)\b/i;
  const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

  function finiteCoordinate(value, limit) {
    if (value == null || typeof value === "boolean" || (typeof value === "string" && !value.trim())) {
      return null;
    }
    try {
      const number = Number(value);
      return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
    } catch {
      return null;
    }
  }

  function safeExternalUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value).startsWith("//") ? `https:${value}` : value);
      return url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  }

  function plainMetadata(value) {
    return String(value ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function displayTitle(title) {
    return String(title ?? "")
      .replace(/^File:/i, "")
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/_/g, " ")
      .trim();
  }

  function titleSignature(title) {
    return displayTitle(title)
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/^\d+\s+/, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function buildCommonsUrl(subject, options) {
    const opts = options || {};
    const endpoint = safeExternalUrl(opts.endpoint || DEFAULT_ENDPOINT);
    if (!endpoint) throw new Error("Wikimedia Commons endpoint must use HTTPS");
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
      iiurlwidth: String(opts.thumbnailWidth || 720),
    });
    const lat = finiteCoordinate(subject?.lat, 90);
    const lon = finiteCoordinate(subject?.lon ?? subject?.lng, 180);
    const searchLimit = Math.floor(Math.max(1, Math.min(50, Number(opts.searchLimit) || 16)));
    if (lat != null && lon != null) {
      params.set("generator", "geosearch");
      params.set("ggsprimary", "all");
      params.set("ggsnamespace", "6");
      params.set("ggscoord", `${lat}|${lon}`);
      params.set("ggsradius", String(Math.floor(Math.max(10, Math.min(10000, Number(opts.radius) || 10000)))));
      params.set("ggslimit", String(searchLimit));
    } else {
      const query = [subject?.name, opts.querySuffix].filter(Boolean).join(" ").trim();
      if (!query) throw new Error("Wikimedia Commons requires coordinates or a search name");
      params.set("generator", "search");
      params.set("gsrsearch", query);
      params.set("gsrnamespace", "6");
      params.set("gsrlimit", String(searchLimit));
    }
    return `${endpoint}?${params.toString()}`;
  }

  function selectCommonsImages(payload, options) {
    const opts = options || {};
    const limit = Math.floor(Math.max(1, Number(opts.limit) || 3));
    const excluded = opts.excludePattern instanceof RegExp ? opts.excludePattern : DEFAULT_EXCLUDED;
    const pages = Object.values(payload?.query?.pages || {}).sort(
      (left, right) => (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER),
    );
    const selected = [];
    const seenUrls = new Set();
    const seenTitles = new Set();
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      excluded.lastIndex = 0;
      if (!info || !ALLOWED_MIME.has(info.mime) || excluded.test(String(page.title || ""))) continue;
      const url = safeExternalUrl(info.thumburl || info.url);
      const sourceUrl = safeExternalUrl(info.descriptionurl);
      const signature = titleSignature(page.title);
      if (!url || !sourceUrl || !signature || seenUrls.has(url) || seenTitles.has(signature)) continue;
      seenUrls.add(url);
      seenTitles.add(signature);
      const metadata = info.extmetadata || {};
      selected.push({
        url,
        sourceUrl,
        title: displayTitle(page.title),
        author: plainMetadata(metadata.Artist?.value) || opts.unknownAuthor || "Unknown author",
        license: plainMetadata(metadata.LicenseShortName?.value) || opts.unknownLicense || "See license",
        licenseUrl: safeExternalUrl(metadata.LicenseUrl?.value) || sourceUrl,
      });
      if (selected.length >= limit) break;
    }
    return selected;
  }

  function defaultSubject(context, options) {
    if (typeof options.subjectFor === "function") return options.subjectFor(context) || {};
    const zone = context?.zone || {};
    const indicators = zone.ind || {};
    return {
      name: zone.name,
      lat: options.latField ? indicators[options.latField] : context?.point?.lat,
      lon: options.lonField ? indicators[options.lonField] : (context?.point?.lng ?? context?.point?.lon),
    };
  }

  function textNode(document, tag, attrs, children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) element.setAttribute(key, String(value));
    for (const child of children || []) {
      element.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return element;
  }

  function createWikimediaCommonsProvider(options) {
    const opts = options || {};
    const fetcher = opts.fetcher || root.fetch?.bind(root);
    const attribution = (item) => ({
      label: `${item.author} · ${item.license}`,
      url: item.licenseUrl,
    });
    return {
      id: opts.id || "wikimedia-commons",
      ui: {
        label: opts.label || "Nearby images",
        loading: opts.loadingLabel || "Loading images…",
        empty: opts.emptyLabel || "No reusable images were found.",
        error: opts.errorLabel || "Images could not be loaded.",
        note: opts.note || "Images are provided by Wikimedia Commons.",
      },
      cacheKey(context) {
        const subject = defaultSubject(context, opts);
        return context?.zone?.key
          ?? `${subject.name || ""}:${subject.lat ?? ""}:${subject.lon ?? subject.lng ?? ""}`;
      },
      async load(context, { signal }) {
        if (typeof fetcher !== "function") throw new Error("fetch is not available");
        const subject = defaultSubject(context, opts);
        const response = await fetcher(buildCommonsUrl(subject, opts), { signal });
        if (!response.ok) throw new Error(`Wikimedia Commons responded with ${response.status}`);
        return response.json();
      },
      normalize(payload) {
        return selectCommonsImages(payload, opts);
      },
      attribution,
      renderItem(document, item, context) {
        const source = textNode(document, "a", {
          href: item.sourceUrl,
          target: "_blank",
          rel: "noopener noreferrer",
        }, []);
        const alt = typeof opts.altFor === "function"
          ? opts.altFor(item, context)
          : `${item.title}${context?.zone?.name ? ` — ${context.zone.name}` : ""}`;
        source.appendChild(textNode(document, "img", {
          src: item.url,
          alt,
          loading: "lazy",
        }, []));
        const credit = attribution(item);
        return textNode(document, "figure", { class: "tesela-media-card" }, [
          source,
          textNode(document, "figcaption", null, [
            textNode(document, "strong", null, [item.title]),
            textNode(document, "span", null, [
              textNode(document, "a", {
                href: credit.url,
                target: "_blank",
                rel: "noopener noreferrer",
              }, [credit.label]),
            ]),
          ]),
        ]);
      },
    };
  }

  return {
    buildCommonsUrl,
    createWikimediaCommonsProvider,
    displayTitle,
    plainMetadata,
    safeExternalUrl,
    selectCommonsImages,
    titleSignature,
  };
});
