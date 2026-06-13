// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppFrame } from "@/components/shell/app-frame";

let mockedPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname,
}));

describe("AppFrame", () => {
  beforeEach(() => {
    mockedPathname = "/";
  });

  it("opens a drawer with only primary learning routes and highlights Today", async () => {
    const user = userEvent.setup();

    render(
      <AppFrame>
        <div>Page body</div>
      </AppFrame>,
    );

    await user.click(screen.getByRole("button", { name: "打开主导航" }));

    const drawer = screen.getByRole("dialog", { name: "ENGGO" });
    const drawerLinks = within(drawer).getAllByRole("link");

    expect(drawerLinks.map((link) => link.textContent?.trim())).toEqual([
      "Today",
      "Learn",
      "Review",
      "Chat",
    ]);
    expect(within(drawer).getByRole("link", { name: "Today" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(within(drawer).getByRole("link", { name: "Learn" })).toHaveAttribute(
      "href",
      "/learn",
    );
    expect(within(drawer).getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/review",
    );
    expect(within(drawer).getByRole("link", { name: "Chat" })).toHaveAttribute(
      "href",
      "/chat",
    );
    expect(within(drawer).getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks Chat active and keeps wordbook as a bottom icon outside the drawer", async () => {
    const user = userEvent.setup();
    mockedPathname = "/chat";

    render(
      <AppFrame>
        <div>Chat body</div>
      </AppFrame>,
    );

    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开词书" })).toHaveAttribute(
      "href",
      "/wordbook",
    );
    expect(screen.getByRole("link", { name: "打开词书" })).toHaveAttribute(
      "title",
      "词书",
    );

    await user.click(screen.getByRole("button", { name: "打开主导航" }));

    const drawer = screen.getByRole("dialog", { name: "ENGGO" });

    expect(within(drawer).getByRole("link", { name: "Chat" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(drawer).queryByRole("link", { name: "打开词书" })).not.toBeInTheDocument();
  });

  it.each([
    ["/today", "Today"],
    ["/learn", "Learn"],
    ["/review", "Review"],
  ])("marks %s as the active drawer route", async (pathname, activeLabel) => {
    const user = userEvent.setup();
    mockedPathname = pathname;

    render(
      <AppFrame>
        <div>{activeLabel} body</div>
      </AppFrame>,
    );

    expect(screen.getByText(activeLabel)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开主导航" }));

    const drawer = screen.getByRole("dialog", { name: "ENGGO" });

    expect(
      within(drawer).getByRole("link", { name: activeLabel }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("closes the drawer with Escape and returns focus to the menu button", async () => {
    const user = userEvent.setup();

    render(
      <AppFrame>
        <button type="button">Page action</button>
      </AppFrame>,
    );

    const menuButton = screen.getByRole("button", { name: "打开主导航" });

    await user.click(menuButton);
    const drawer = screen.getByRole("dialog", { name: "ENGGO" });
    const firstLink = within(drawer).getByRole("link", { name: "Today" });
    const lastLink = within(drawer).getByRole("link", { name: "Chat" });
    const closeButton = within(drawer).getByRole("button", { name: "关闭" });

    await waitFor(() => {
      expect(firstLink).toHaveFocus();
    });

    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastLink).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(firstLink).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "ENGGO" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(menuButton).toHaveFocus();
    });
  });

  it("closes the drawer from the backdrop", async () => {
    const user = userEvent.setup();

    render(
      <AppFrame>
        <div>Page body</div>
      </AppFrame>,
    );

    await user.click(screen.getByRole("button", { name: "打开主导航" }));

    expect(screen.getByRole("dialog", { name: "ENGGO" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭主导航" }));

    expect(screen.queryByRole("dialog", { name: "ENGGO" })).not.toBeInTheDocument();
  });
});
