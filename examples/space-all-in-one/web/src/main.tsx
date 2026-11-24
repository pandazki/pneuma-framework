// The owner page's client: reads the view's data the Host put in the page (an inert JSON element), and lays it
// out with Beautiful UI's components. It renders data as text only; links it follows are the ones the Host built.

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import SearchPalette from "../beautifui/primitives/SearchPalette";
import { PageColumn } from "../beautifui/site";
import { hue, OwnerContext, PageContext, useOwnerState } from "./lib";
import type { PageModel } from "./model";
import { View } from "./view";

function Page({ model }: { model: PageModel }) {
  const owner = useOwnerState(model.ownerOff);
  const [searching, setSearching] = useState(false);
  const onSearch = () => setSearching(true);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching((open) => !open);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  // "It's live now" is said once: a reload does not say it again.
  useEffect(() => {
    if (!model.done) return;
    const url = new URL(location.href);
    url.searchParams.delete("done");
    history.replaceState(null, "", url.pathname + url.search);
  }, [model.done]);

  return (
    <PageContext.Provider value={model}>
      <OwnerContext.Provider value={owner}>
        <PageColumn>
          <View model={model} onSearch={onSearch} />
        </PageColumn>
        <SearchPalette
          open={searching}
          onClose={() => setSearching(false)}
          labels={{ placeholder: model.ui.search_placeholder, ariaLabel: model.ui.search_label, emptyTitle: model.ui.search_empty, emptyHint: model.ui.search_keys }}
          items={model.search.map((entry) => ({ key: entry.name, title: entry.title, sub: entry.words ? `${entry.stateLabel} · ${entry.words}` : entry.stateLabel, href: entry.href, mark: entry.monogram, color: hue(entry.name) }))}
          match={(item, terms) => {
            const entry = model.search.find((e) => e.name === item.key);
            const hay = `${item.title} ${item.key} ${entry?.words ?? ""} ${entry?.stateLabel ?? ""}`.toLowerCase();
            return terms.every((term) => hay.includes(term));
          }}
        />
      </OwnerContext.Provider>
    </PageContext.Provider>
  );
}

function start() {
  const source = document.getElementById("model");
  const root = document.getElementById("root");
  if (!source || !root) return;
  const model = JSON.parse(source.textContent || "{}") as PageModel;

  // The language the person chose last time, unless the address names one.
  const params = new URLSearchParams(location.search);
  try {
    const saved = localStorage.getItem("pneuma-lang");
    if (!params.has("lang") && (saved === "en" || saved === "zh") && saved !== model.lang) {
      params.set("lang", saved);
      location.replace(`${location.pathname}?${params.toString()}`);
      return;
    }
  } catch {}

  createRoot(root).render(
    <StrictMode>
      <Page model={model} />
    </StrictMode>,
  );
}

start();
