/* The public website's structure, shared by its header, footer and pages. */

/** The site's pages, in header order: [path, labelKey]. */
export const SITE_PAGES = [["/", "pub.nav.home"], ["/about", "pub.nav.about"], ["/features", "pub.nav.features"],
  ["/how-it-works", "pub.nav.how"], ["/faq", "pub.nav.faq"], ["/contact", "pub.nav.contact"]];

/** Every feature the app has today: [key, icon, route, group]. Titles and details are feat.<key> and feat.<key>.d. */
export const FEATURES = [
  ["tree", "account_tree", "/tree", "heritage"],
  ["directory", "groups", "/directory", "heritage"],
  ["memories", "photo_library", "/memories", "heritage"],
  ["stories", "mic", "/stories", "heritage"],
  ["timeline", "hourglass_top", "/timeline", "heritage"],
  ["legacy", "menu_book", "/legacy", "heritage"],
  ["messages", "forum", "/messages", "together"],
  ["calendar", "calendar_month", "/calendar", "together"],
  ["admin", "admin_panel_settings", "/admin", "care"],
  ["privacy", "verified_user", "/privacy", "care"],
  ["access", "accessibility_new", "/settings", "care"],
  ["offline", "devices", null, "care"],
];
