/* Photos for the public pages and the sample Mackenzie family: free-licence pictures from Unsplash, kept in
   src/assets/photos (see CREDITS.md there) and bundled with the app, so it never loads anything from the internet.
   Sample photos are looked up by key when a tile is drawn and never written into the saved archive, so saved data
   stays small and a rebuild can't leave it pointing at an old file. A key whose file is missing keeps the gradient tile. */
const files = import.meta.glob("../assets/photos/*.{jpg,jpeg,png,webp,avif}", { eager: true, import: "default" });
const BY_NAME = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split("/").pop().replace(/\.[^.]+$/, ""), url]));

/** Sample item id (or page slot) → file name in src/assets/photos, without the extension. */
const SAMPLE = {
  // Public pages
  auth: "family-photo-album",
  about: "grandmother-holding-newborn",
  how: "grandfather-reading-with-grandson",
  contact: "grandparents-video-call",
  welcome: "grandmother-granddaughter-breakfast",
  "features-heritage": "old-family-portraits",
  "features-together": "family-dinner-table",
  "features-care": "grandfather-grandson-tablet",
  // Memories (src/data.js)
  m1: "couple-on-ocean-liner",
  m2: "mother-baby-garden",
  m3: "grandfather-boy-pottery",
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

/** The bundled photo for a sample item, page slot or file name, or undefined when none has been added. */
export const samplePhoto = (key) => BY_NAME[SAMPLE[key] ?? key];

/** Who took each photo, for the credit lines (all under the Unsplash License, https://unsplash.com/license). */
const by = (name, id, user) => ({ name, page: `https://unsplash.com/photos/${id}`, ...(user ? { profile: `https://unsplash.com/@${user}` } : {}) });
const CREDITS = {
  "grandmother-hugging-granddaughter": by("Ekaterina Shakharova", "L4nwL3195U0", "minigirl"),
  "grandmother-granddaughter-breakfast": by("Vitaly Gariev", "znxxhOIQtIE", "silverkblack"),
  "three-generations-walking": by("Mobio Marketing", "gezQ1Rz1iDw", "mobio_be"),
  "photo-album-pages": by("Laura Fuhrman", "73OJLcahQHg", "lauracathleen"),
  "grandmother-granddaughter-baking": by("Vitaly Gariev", "H9HGwXqqqi8", "silverkblack"),
  "old-handwritten-letter": by("Simon Ray", "NggSDMYm5K8", "simonbhray"),
  "family-dinner-table": by("Annie Spratt", "OssO-J9eNyI", "anniespratt"),
  "old-family-portraits": by("Annie Spratt", "Ar9j8V6oMzo", "anniespratt"),
  "family-photo-album": by("Vitaly Gariev", "JFGWDxe_rNY", "silverkblack"),
  "grandmother-holding-newborn": by("Tim Mossholder", "m3ypbJjvXks"),
  "grandfather-reading-with-grandson": by("Vitaly Gariev", "eZGLwvgZ09w", "silverkblack"),
  "grandparents-video-call": by("Vitaly Gariev", "3toEqCkUqEM", "silverkblack"),
  "grandfather-grandson-tablet": by("Vitaly Gariev", "QJVk5Wzl6s8", "silverkblack"),
  "couple-on-ocean-liner": by("Te Papa Tongarewa", "rKmpRAJ1PG4", "tepapa"),
  "mother-baby-garden": by("David Utt", "hM9CVdrrDsM"),
  "grandfather-boy-pottery": by("Vitaly Gariev", "YgFqYdYKKnI", "silverkblack"),
  "girl-playing-violin": by("Michel Catalisano", "OZDmI-vO7Io"),
  "handwritten-recipe": by("Alexandr Popadin", "faJHHXut9fg"),
  "birthday-gathering": by("PoloX Hernandez", "itGcCnMWPpQ"),
  "scottish-coast": by("Martin Bennie", "r3peJAPApQw"),
  "lakeside-reunion": by("cin .", "8ctu901wRnY"),
  graduation: by("Leon Wu", "LLfRMRT-9AY"),
};

/** Credit for a sample item, page slot or file name: { name, page, profile? }. */
export const photoCredit = (key) => CREDITS[SAMPLE[key] ?? key];

/** Welcome page slideshow: generations together. `key` names its caption and alt text in i18n-public.js. */
export const HERO_PHOTOS = [
  { key: "hug", file: "grandmother-hugging-granddaughter" },
  { key: "breakfast", file: "grandmother-granddaughter-breakfast" },
  { key: "walk", file: "three-generations-walking" },
].map((p) => ({ ...p, src: samplePhoto(p.file), ...CREDITS[p.file] }));

/** Welcome page: one photograph per part of the archive. */
export const TOPIC_PHOTOS = [
  { key: "memories", file: "photo-album-pages", icon: "photo_library" },
  { key: "stories", file: "grandmother-granddaughter-baking", icon: "mic" },
  { key: "legacy", file: "old-handwritten-letter", icon: "menu_book" },
  { key: "gatherings", file: "family-dinner-table", icon: "calendar_month" },
  { key: "tree", file: "old-family-portraits", icon: "account_tree" },
].map((p) => ({ ...p, to: "/features", src: samplePhoto(p.file), ...CREDITS[p.file] }));
