import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import NotFound from "../views/NotFound.jsx";
import { NAV } from "../lib/nav.js";

vi.mock("../lib/i18n.js", () => ({
  useT: () => (key) => {
    const translations = {
      "nf.body": "The requested page {path} could not be found.",
      "nf.eyebrow": "Page not found",
      "nf.title": "We couldn't find that page",
      "nf.goTo": "Go to a main section",
      "dir.search": "Search the directory",
      "top.search": "Search Family Roots",
      "common.search": "Search",
    };

    if (key.startsWith("nav.")) {
      return key.slice(4);
    }

    return translations[key] ?? key;
  },
}));

function CurrentLocation() {
  const location = useLocation();

  return (
    <output data-testid="current-location">
      {location.pathname}{location.search}
    </output>
  );
}

function renderNotFound(initialPath = "/missing-page") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <NotFound />
              <CurrentLocation />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("NotFound page", () => {
  it("renders the not-found heading", () => {
    renderNotFound();

    expect(
      screen.getByRole("heading", { name: "We couldn't find that page" })
    ).toBeInTheDocument();
  });

  it("displays the requested URL path", () => {
    renderNotFound("/unknown-section");

    expect(screen.getByText("/unknown-section", { selector: "code" })).toBeInTheDocument();
  });

  it("renders the directory search input", () => {
    renderNotFound();

    expect(
      screen.getByRole("searchbox", { name: "Search the directory" })
    ).toBeInTheDocument();
  });

  it("navigates to the directory with an encoded search query", () => {
    renderNotFound();

    const input = screen.getByRole("searchbox", {
      name: "Search the directory",
    });

    fireEvent.change(input, {
      target: { value: "  family & roots  " },
    });

    fireEvent.submit(screen.getByRole("search"));

    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/directory?q=family%20%26%20roots"
    );
  });

  it("navigates to the directory when search is empty", () => {
    renderNotFound();

    fireEvent.submit(screen.getByRole("search"));

    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/directory"
    );
  });

  it("renders a shortcut for every navigation entry", () => {
    const { container } = renderNotFound();

    const pages = NAV.flatMap((group) => group.items);

    expect(container.querySelectorAll("li[data-sec]")).toHaveLength(
      pages.length
    );

    for (const [id] of pages) {
      expect(
        container.querySelector(`a[href="/${id}"]`)
      ).toBeInTheDocument();
    }
  });
});
