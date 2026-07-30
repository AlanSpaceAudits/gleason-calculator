// Shared boot for the pages that are just text: load the chosen language,
// fill the page, wire the switcher, and keep the choice on internal links so it
// survives navigation.

import { pickLang, loadLang, applyTranslations, buildSwitcher, lang } from "./i18n.js";

const host = document.getElementById("langs");

function carryLangOnLinks(code) {
  for (const a of document.querySelectorAll('a[href$=".html"]')) {
    const u = new URL(a.getAttribute("href"), location.href);
    u.searchParams.set("lang", code);
    a.setAttribute("href", u.pathname.split("/").pop() + u.search);
  }
}

export async function setLang(code) {
  await loadLang(code);
  applyTranslations();
  carryLangOnLinks(code);
  if (host) buildSwitcher(host, setLang);
  const q = new URLSearchParams(location.search);
  q.set("lang", code);
  history.replaceState(null, "", `?${q}`);
}

export async function bootPage() {
  await setLang(pickLang());
}

export { lang };
