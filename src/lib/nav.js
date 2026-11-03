/* Sidebar navigation: [route, label, icon] grouped by section. */
export const NAV = [
  { group: "Family Heritage", key: "nav.group.heritage", items: [
    ["overview", "Overview", "home"],
    ["tree", "Family Tree", "account_tree"],
    ["directory", "Family Directory", "groups"],
    ["memories", "Memories", "photo_library"],
    ["stories", "Family Stories & Audio", "mic"],
    ["timeline", "Timeline & Milestones", "hourglass_top"],
    ["legacy", "Legacy Archive", "menu_book"],
    ["messages", "Messages", "forum"],
    ["calendar", "Calendar & Gatherings", "calendar_month"],
  ] },
  { group: "Vault & Care", key: "nav.group.vault", items: [
    ["admin", "Family Administration", "admin_panel_settings"],
    ["privacy", "Privacy & Consent", "verified_user"],
    ["settings", "Settings & Accessibility", "tune"],
    ["auth", "Sign in / Join", "login"],
  ] },
];
export const routeLabel = (route) => NAV.flatMap((g) => g.items).find(([id]) => id === route)?.[1];
