/* Sample photos for the Mackenzie demo family and the public pages: free-licence stock pictures kept in
   src/assets/photos (see CREDITS.md there), bundled with the app so it still never loads anything from the internet.
   They are looked up by key when a tile is drawn and never written into the saved archive, so saved data stays small
   and a rebuild can't leave it pointing at an old file. A key whose file is missing simply keeps the gradient tile. */
const files = import.meta.glob("../assets/photos/*.{jpg,jpeg,png,webp,avif}", { eager: true, import: "default" });
const BY_NAME = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split("/").pop().replace(/\.[^.]+$/, ""), url]));

/** Sample item id (or page slot) → file name in src/assets/photos, without the extension. */
const SAMPLE = {
  // Public pages
  hero: "family-generations",
  auth: "family-photo-album",
  "feature-tree": "old-family-portraits",
  "feature-memories": "photo-prints",
  "feature-stories": "grandmother-telling-story",
  "feature-timeline": "vintage-letters",
  // Memories (src/data.js)
  m1: "couple-on-ocean-liner",
  m2: "mother-baby-garden",
  m3: "grandfather-boy-building",
  m4: "girl-playing-violin",
  m5: "handwritten-recipe",
  m6: "birthday-gathering",
  // Albums
  a1: "birthday-gathering",
  a2: "scottish-coast",
  a3: "lakeside-reunion",
  a4: "handwritten-recipe",
  a5: "graduation",
  // Timeline milestones with a photo
  t1: "birthday-gathering",
};

/** The bundled photo for a sample item or page slot, or undefined when none has been added. */
export const samplePhoto = (key) => BY_NAME[SAMPLE[key] ?? key];
