// Translation for the whole site. One flat dictionary per language, loaded on
// demand, applied by walking data-i18n attributes.
//
// A key ending in _html, or whose value contains markup, is inserted as HTML.
// Everything else goes in as text.

export const LANGS = [
  ["en", "EN"],
  ["cs", "CZ"],
  ["sk", "SK"],
];

const STORE = "gleason.lang";
let dict = {};
let current = "en";

// Chosen language, in order: the URL, then the last choice, then the browser,
// then English.
export function pickLang() {
  const q = new URLSearchParams(location.search).get("lang");
  const codes = LANGS.map(([c]) => c);
  if (q && codes.includes(q)) return q;
  try {
    const saved = localStorage.getItem(STORE);
    if (saved && codes.includes(saved)) return saved;
  } catch { /* storage may be blocked; fall through */ }
  const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
  return codes.includes(nav) ? nav : "en";
}

export async function loadLang(code) {
  const res = await fetch(`i18n/${code}.json`);
  if (!res.ok) throw new Error(`missing translation: ${code}`);
  dict = await res.json();
  current = code;
  document.documentElement.lang = dict["html.lang"] || code;
  try { localStorage.setItem(STORE, code); } catch { /* ignore */ }
  return dict;
}

export const lang = () => current;

// Look up a key. Missing keys return the key itself, so a gap is visible on the
// page rather than silently blank.
export function t(key, ...subs) {
  let s = dict[key];
  if (s === undefined) return key;
  for (const v of subs) s = s.replace("%s", v);
  return s;
}

const looksLikeHtml = (s) => /<[a-z/][\s\S]*>|&[a-z]+;|&#\d+;/i.test(s);

// Fill every element carrying data-i18n. Attributes can be targeted with
// data-i18n-attr="placeholder title alt".
export function applyTranslations(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    const key = el.dataset.i18n;
    const val = t(key);
    const attrs = el.dataset.i18nAttr;
    if (attrs) {
      for (const a of attrs.split(/\s+/)) el.setAttribute(a, val);
      continue;
    }
    if (looksLikeHtml(val)) el.innerHTML = val;
    else el.textContent = val;
  }
  if (dict["site.title"]) {
    const bare = dict["site.title"].replace(/&rsquo;/g, "’");
    document.title = `${bare}, 1892`;
  }
}

// The EN | CZ | SK switcher, built into whatever container is given.
export function buildSwitcher(host, onChange) {
  host.innerHTML = "";
  host.setAttribute("aria-label", t("nav.lang"));
  for (const [code, label] of LANGS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.lang = code;
    if (code === current) b.classList.add("on");
    b.addEventListener("click", () => { if (code !== current) onChange(code); });
    host.append(b);
  }
}
