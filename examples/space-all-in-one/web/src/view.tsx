import { AppView } from "./app-view";
import { BackView, MissingView, UnreadableView } from "./back-view";
import { ChangeView } from "./change-view";
import { Home } from "./home";
import type { PageModel } from "./model";

/** The view for this page's data. */
export function View({ model, onSearch }: { model: PageModel; onSearch: () => void }) {
  switch (model.view) {
    case "home":
      return <Home model={model} onSearch={onSearch} />;
    case "app":
      return <AppView model={model} onSearch={onSearch} />;
    case "change":
      return <ChangeView model={model} onSearch={onSearch} />;
    case "back":
      return <BackView model={model} onSearch={onSearch} />;
    case "unreadable":
      return <UnreadableView model={model} onSearch={onSearch} />;
    default:
      return <MissingView model={model} onSearch={onSearch} />;
  }
}
