# Photos

Free-licence photos for the public pages (welcome, sign-in, About, How it works, Contact, Features, the first
welcome step) and the sample Mackenzie family (memories, albums, timeline). The mapping from screens to file names
and the credit lines shown on the pages live in `src/lib/photos.js`. A name with no file keeps the coloured
placeholder tile.

The photos are bundled with the app (never linked from the photo site), so FamilyRoots still works offline and
never sends a visitor's address to another website.

## Rules

- **Licence:** only [Unsplash](https://unsplash.com/license) (not Unsplash+) or [Pexels](https://www.pexels.com/license/)
  photos. Free photos come from `images.unsplash.com/photo-…`; paid Unsplash+ ones from `plus.unsplash.com/premium_photo-…`.
  Fill in the credits table below **and** `CREDITS` in `src/lib/photos.js` for every file you add.
- **Size:** about 1000 px on the long side (1200 px for the welcome slideshow), WebP, ideally 200 KB or less:
  the one-file version (`npm run build:single`) carries every photo inside `FamilyRoots.html`.
- **People:** natural, warm, mixed ages, no brand logos or text. Photos of real people stand in for a fictional
  family, so don't add names or captions that suggest who they really are.
- **Alt text** describes what each photo actually shows: in `src/data.js` (sample memories) and the translations
  (page photos). Update it whenever you swap a photo.

## Where each photo is used

| File | Shows | Used on |
|---|---|---|
| `grandmother-hugging-granddaughter` | Grandmother hugging her granddaughter | Welcome slideshow |
| `grandmother-granddaughter-breakfast` | Grandmother and granddaughter at breakfast | Welcome slideshow, first welcome step after sign-up |
| `three-generations-walking` | Three generations walking in a park | Welcome slideshow |
| `photo-album-pages` | Hands opening an album of old photos | Welcome "Photographs" card |
| `grandmother-granddaughter-baking` | Grandmother and granddaughter baking | Welcome "Recipes & traditions" card |
| `old-handwritten-letter` | Old handwritten letter on a table | Welcome "Letters & records" card |
| `family-dinner-table` | Family around a set dinner table | Welcome "Gatherings" card, Features "Staying connected" |
| `old-family-portraits` | Vintage portrait of a large family | Welcome "Your family tree" card, Features "Heritage" |
| `family-photo-album` | Grandparents and a child looking through an album | Sign in / Create account / Join |
| `grandmother-holding-newborn` | Grandmother holding a newborn | About |
| `grandfather-reading-with-grandson` | Grandfather reading with his grandson | How it works |
| `grandparents-video-call` | Grandparents waving on a video call | Contact |
| `grandfather-grandson-tablet` | Grandfather and grandson with a tablet | Features "Care, privacy and access" |
| `couple-on-ocean-liner` | Black-and-white portrait of a young couple (1937) | Memory m1 "John and Mary…" |
| `mother-baby-garden` | Mother holding her baby by tulips | Memory m2 "Sarah holding baby Daniel…" |
| `grandfather-boy-pottery` | Grandfather teaching his grandson pottery | Memory m3 "Michael at the pottery wheel…" |
| `girl-playing-violin` | Violinist on a dim stage beside a piano | Memory m4 "Anna's Solo Violin Recital…" |
| `handwritten-recipe` | Handwritten notes on aged paper | Memory m5 and album "Heirloom Recipes" |
| `birthday-gathering` | Older woman beside her birthday cake | Memory m6, album "Grandma Mary's 80th", Timeline |
| `scottish-coast` | The Storr, Isle of Skye | Album "Summer on the Isle of Skye" |
| `lakeside-reunion` | Lake framed by trees | Album "Lake Highlands Reunion" |
| `graduation` | Graduates throwing their caps | Album "School Days & University" |

## Credits

All photos are free to use under the [Unsplash License](https://unsplash.com/license) (checked on each photo's page).

| File | Photographer | Source |
|---|---|---|
| `grandmother-hugging-granddaughter` | Ekaterina Shakharova | https://unsplash.com/photos/L4nwL3195U0 |
| `grandmother-granddaughter-breakfast` | Vitaly Gariev | https://unsplash.com/photos/znxxhOIQtIE |
| `three-generations-walking` | Mobio Marketing | https://unsplash.com/photos/gezQ1Rz1iDw |
| `photo-album-pages` | Laura Fuhrman | https://unsplash.com/photos/73OJLcahQHg |
| `grandmother-granddaughter-baking` | Vitaly Gariev | https://unsplash.com/photos/H9HGwXqqqi8 |
| `old-handwritten-letter` | Simon Ray | https://unsplash.com/photos/NggSDMYm5K8 |
| `family-dinner-table` | Annie Spratt | https://unsplash.com/photos/OssO-J9eNyI |
| `old-family-portraits` | Annie Spratt | https://unsplash.com/photos/Ar9j8V6oMzo |
| `family-photo-album` | Vitaly Gariev | https://unsplash.com/photos/JFGWDxe_rNY |
| `grandmother-holding-newborn` | Tim Mossholder | https://unsplash.com/photos/m3ypbJjvXks |
| `grandfather-reading-with-grandson` | Vitaly Gariev | https://unsplash.com/photos/eZGLwvgZ09w |
| `grandparents-video-call` | Vitaly Gariev | https://unsplash.com/photos/3toEqCkUqEM |
| `grandfather-grandson-tablet` | Vitaly Gariev | https://unsplash.com/photos/QJVk5Wzl6s8 |
| `couple-on-ocean-liner` | Museum of New Zealand Te Papa Tongarewa (Spencer Digby Studios, 1937) | https://unsplash.com/photos/rKmpRAJ1PG4 |
| `mother-baby-garden` | David Utt | https://unsplash.com/photos/hM9CVdrrDsM |
| `grandfather-boy-pottery` | Vitaly Gariev | https://unsplash.com/photos/YgFqYdYKKnI |
| `girl-playing-violin` | Michel Catalisano | https://unsplash.com/photos/OZDmI-vO7Io |
| `handwritten-recipe` | Alexandr Popadin | https://unsplash.com/photos/faJHHXut9fg |
| `birthday-gathering` | PoloX Hernandez | https://unsplash.com/photos/itGcCnMWPpQ |
| `scottish-coast` | Martin Bennie | https://unsplash.com/photos/r3peJAPApQw |
| `lakeside-reunion` | cin . | https://unsplash.com/photos/8ctu901wRnY |
| `graduation` | Leon Wu | https://unsplash.com/photos/LLfRMRT-9AY |
