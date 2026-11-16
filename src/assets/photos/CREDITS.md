# Sample photos

Free-licence stock photos for the welcome page, sign-in page and the sample Mackenzie family.
Drop a file here with one of the names below (any of `.webp`, `.jpg`, `.png`, `.avif`) and the app uses it on
the next `npm run dev` or build. A name with no file keeps the coloured placeholder tile, so you can add them one
at a time. The mapping from screens to names lives in `src/lib/photos.js`.

The photos are bundled with the app (never linked from the photo site), so FamilyRoots still works offline and
never sends a visitor's address to another website.

## Rules

- **Licence:** only [Unsplash](https://unsplash.com/license) or [Pexels](https://www.pexels.com/license/) photos
  (free to use, no permission needed). Fill in the credits table for every file you add.
- **Size:** 1600 px on the long side for `family-generations`, 1000 px for everything else.
  Save as WebP at quality 75 (for example with https://squoosh.app). Aim for 200 KB or less per file:
  the one-file version (`npm run build:single`) carries every photo inside `FamilyRoots.html`.
- **People:** natural, warm, mixed ages. Avoid photos with visible brand logos or text. Photos of real people
  stand in for a fictional family, so don't add names or captions that suggest who they really are.
- **Alt text** for these photos is already written in the app (`alt` in `src/data.js` and the translations).
  Pick photos that match it, or update the alt text to describe the photo you chose.

## Shot list

| File name | Look for | Shown on |
|---|---|---|
| `family-generations` | Grandparents, parents and children together, outdoors or at home, warm light | Welcome page hero |
| `family-photo-album` | Family looking through an old photo album together | Sign in / Join |
| `old-family-portraits` | Old black-and-white family portraits laid out on a table | Welcome page, "Family Tree" feature |
| `photo-prints` | A pile of old printed photographs, Polaroids or slides | Welcome page, "Memories" feature |
| `grandmother-telling-story` | Older woman talking, grandchild listening | Welcome page, "Stories & Audio" feature |
| `vintage-letters` | Old handwritten letters and envelopes | Welcome page, "Timeline" feature |
| `couple-on-ocean-liner` | Vintage-style couple on a ship deck, or an old ocean liner (black and white suits the 1968 memory) | Memory "John and Mary on Deck…" |
| `mother-baby-garden` | Mother holding a newborn in a flowering garden | Memory "Sarah holding baby Daniel…" |
| `grandfather-boy-building` | Grandfather and young boy building something out of wood | Memory "Michael building the treehouse…" |
| `girl-playing-violin` | Teenage girl playing violin on a stage | Memory "Anna's Solo Violin Recital…" |
| `handwritten-recipe` | Old handwritten recipe notebook with baking ingredients | Memory "Shortbread Recipe", album "Heirloom Recipes" |
| `birthday-gathering` | Older woman's birthday celebration with family around a table | Memory and album "Grandma Mary's 80th", Timeline |
| `scottish-coast` | Isle of Skye or Scottish highland coastline | Album "Summer on the Isle of Skye" |
| `lakeside-reunion` | Family picnic or gathering beside a lake | Album "Lake Highlands Reunion" |
| `graduation` | Students in graduation gowns, or a school classroom | Album "School Days & University" |

## Credits

| File name | Photographer | Source link | Licence |
|---|---|---|---|
| | | | |
