/* FamilyRoots sample archive: the Mackenzie family shown in the design screens. New installs start with it; Settings can restore it. */

/** The signed-in person's id in the tree: Mary in the demo; on a family server, the account's own person (see StoreProvider).
 *  A live binding, so every screen that imports it sees the change. */
export let ME = "mary";
export const DEMO_ME = "mary";
export const setMe = (id) => { ME = id; };

export const SEED = {
  people: [
    { id: "robert", first: "Robert", last: "Dunbar", born: "1918-03-02", died: "1989-01-10", gen: 1, city: "Aberdeen, UK",
      role: "Grand-Uncle", occupation: "Master Joiner", branch: "Dunbar", parents: [], spouse: null, color: "#8b7b65",
      tags: ["Master Joiner", "Dunbar Ancestral Stem"], pending: true, bornApprox: true,
      note: "Birth date unconfirmed (est. 1918, Aberdeen). 2 historical parish records awaiting family consensus review." },
    { id: "john", first: "John", last: "Mackenzie", born: "1942-05-03", died: "2021-03-11", gen: 2, city: "Edinburgh, UK",
      role: "Late Patriarch", occupation: "Botanist & Veteran", branch: "Mackenzie", parents: [], spouse: "mary", married: 1968,
      color: "#7d6a55", tags: ["Memorial Gold", "Royal Highland Reg."], oralTapes: 14, keepsakes: 38 },
    { id: "mary", first: "Mary", last: "Mackenzie", born: "1946-02-19", gen: 2, city: "Edinburgh, UK",
      role: "Matriarch", occupation: "Tree Curator", branch: "Mackenzie", parents: [], spouse: "john", married: 1968,
      color: "#6f8f62", tags: ["Tree Curator", "Living Anchor"], editor: true },
    { id: "sarah", first: "Sarah", last: "Mackenzie", born: "1971-06-08", gen: 3, city: "Inverness, UK",
      role: "Daughter", occupation: "Author & Historian", branch: "Mackenzie", parents: ["john", "mary"], spouse: "david", married: 1999,
      color: "#b07c5f", tags: ["Family Admin", "Author & Historian"] },
    { id: "david", first: "David", last: "Miller", born: "1970-09-21", gen: 3, city: "Inverness, UK",
      role: "Son-in-law", occupation: "Civil Engineer", branch: "Miller", parents: [], spouse: "sarah", married: 1999, color: "#5f6f86",
      tags: ["Miller Union"] },
    { id: "michael", first: "Michael", last: "Mackenzie", born: "1975-11-14", gen: 3, city: "Edinburgh, UK",
      role: "Son", occupation: "Architect", branch: "Mackenzie", parents: ["john", "mary"], spouse: "emma", married: 2012,
      color: "#4f6b58", tags: ["Architect", "Oral Rec Preserved"], verified: true, oralTapes: 1, keepsakes: 24 },
    { id: "emma", first: "Emma", last: "Mackenzie", born: "1978-04-02", gen: 3, city: "Edinburgh, UK",
      role: "Daughter-in-law", occupation: "Paediatric Nurse", branch: "Mackenzie", parents: [], spouse: "michael", married: 2012,
      color: "#a3707c", tags: ["Nee Ross"] },
    { id: "james", first: "James", last: "Mackenzie", born: "1980-07-30", gen: 3, city: "Vancouver, Canada",
      role: "Son", occupation: "Marine Biologist", branch: "Mackenzie", parents: ["john", "mary"], spouse: null, color: "#4c7a8f",
      tags: ["Marine Biologist"] },
    { id: "daniel", first: "Daniel", last: "Miller", born: "2002-02-12", gen: 4, city: "St Andrews, UK",
      role: "Grandson", occupation: "University Student", branch: "Miller", parents: ["sarah", "david"], spouse: null, color: "#6a7f9a",
      tags: ["University Student", "Sarah's Branch"] },
    { id: "anna", first: "Anna", last: "Mackenzie-Miller", born: "2010-11-07", gen: 4, city: "Inverness, UK",
      role: "Granddaughter", occupation: "Violinist", branch: "Miller", parents: ["sarah", "david"], spouse: null, color: "#a8674f",
      tags: ["Violinist", "Youth Orchestra"] },
    { id: "grace", first: "Grace", last: "Mackenzie", born: "2016-06-22", gen: 4, city: "Edinburgh, UK",
      role: "Granddaughter", occupation: "Junior Storyteller", branch: "Mackenzie", parents: ["michael", "emma"], spouse: null,
      color: "#3d8a6e", tags: ["Junior Storyteller", "Protected Minor"], minor: true },
  ],

  memories: [
    { id: "m1", title: "John and Mary on Deck of RMS Queen Elizabeth", date: "1968-10", approx: false, type: "photo",
      place: "RMS Queen Elizabeth", label: "Archival Master (4800 DPI)", tagged: ["john", "mary"], visibility: "All Family Branches",
      caption: "Captured three days out of Southampton heading toward New York harbour. Original 2¼ square medium format negative conserved from John's chest.",
      alt: "Black and white portrait of a young couple smiling cheek to cheek, dressed up for the voyage.", p1: "#8d8d86", p2: "#3d3d3a", icon: "sailing", audio: true },
    { id: "m2", title: "Sarah holding baby Daniel at Rose Cottage garden", date: "2002-06", type: "photo", place: "Rose Cottage, Stirling",
      label: "3rd Generation Arrival", tagged: ["sarah", "daniel"], visibility: "All Family Branches",
      caption: "Daniel was six weeks old during the midsummer garden tea. John took this frame with his Canon AE-1 SLR on Kodak Gold 200.",
      alt: "A smiling mother holding her baby in front of a bed of tulips.", p1: "#c7a77c", p2: "#5e7b4f", icon: "local_florist" },
    { id: "m3", title: "Michael at the pottery wheel with Grandpa John", date: "1982-08", type: "photo", place: "Falkirk Homestead",
      label: "Craft & Childhood", tagged: ["michael", "john"], visibility: "All Family Branches",
      caption: "“We spent three Saturdays at his wheel. Grandpa said if you centre the clay first, the pot stands for fifty years.”",
      alt: "A grandfather with a white beard teaching his young grandson to shape clay on a pottery wheel.", p1: "#b6845c", p2: "#4b5d3a", icon: "carpenter" },
    { id: "m4", title: "Anna's Solo Violin Recital at Edinburgh Youth Hall", date: "2022-12", type: "photo", place: "Edinburgh Youth Hall",
      label: "Solo Concerto", tagged: ["anna", "mary"], visibility: "Immediate Family",
      caption: "Performance of Bruch's Scottish Fantasy. Anna played the 1928 heirloom violin previously owned by Great-Aunt Evelyn.",
      alt: "A young violinist playing beside a grand piano on a dimly lit stage.", p1: "#9a6b4a", p2: "#2e2320", icon: "music_note" },
    { id: "m5", title: "Handwritten Scottish Shortbread Recipe in Margaret's Notebook", date: "1944-11", approx: true, type: "document",
      place: "Perthshire", label: "OCR Transcribed Document", tagged: ["mary"], visibility: "All Family Branches",
      caption: "Written by Great-Grandmother Margaret Mackenzie during the winter rations in Perthshire. Scanned at 600 DPI with full automated dialect text recognition.",
      alt: "Handwritten notes in faded ink on aged, yellowed paper.", p1: "#e2cfa6", p2: "#9c7f52", icon: "menu_book" },
    { id: "m6", title: "Grandma Mary's 80th Milestone Gathering", date: "2026-02", type: "photo", place: "Gleneagles",
      label: "Milestone 2026", tagged: ["mary", "sarah", "michael", "james", "daniel", "anna", "grace"], visibility: "All Family Branches",
      caption: "Family banquet at Gleneagles with 28 family members in attendance.", alt: "An older woman smiling beside a tall, colourful birthday cake at her party.",
      p1: "#c28a4d", p2: "#3b2a1c", icon: "cake" },
  ],

  albums: [
    { id: "a1", items: ["m6"], title: "Grandma Mary's 80th Celebration", tag: "Milestone 2026", meta: "24 Photos • 3 Audio", note: "9 Relatives Tagged", p1: "#c28a4d", p2: "#3b2a1c", icon: "cake" },
    { id: "a2", items: ["m1", "m3"], title: "Summer on the Isle of Skye", tag: "Kodachrome", meta: "48 Slides • 1968–1985", note: "John, Mary, Sarah, Michael", p1: "#5f8b7d", p2: "#22423a", icon: "landscape" },
    { id: "a3", items: [], title: "The 2026 Lake Highlands Reunion", tag: "Upcoming & RSVPs", meta: "18 Items • Active thread", note: "22 Kin Attending", p1: "#8fae7a", p2: "#3f5d3a", icon: "festival" },
    { id: "a4", items: ["m5"], title: "Heirloom Recipes & Notes", tag: "Culinary Keepsakes", meta: "14 Parchments • 1940s–1990s", note: "OCR Transcriptions", p1: "#d8c49a", p2: "#7d6440", icon: "menu_book" },
    { id: "a5", items: ["m4", "m2"], title: "School Days & University", tag: "Academia", meta: "31 Photos • 2014–2023", note: "Daniel & Anna", p1: "#8193a8", p2: "#2f3b4d", icon: "school" },
  ],

  stories: [
    { id: "s1", title: "Crossing the Atlantic in 1968", kind: "audio", category: "Elder Oral Histories", by: "mary", recorded: "2025-10-14",
      duration: 522, verified: true, tag: "Heirloom Story",
      excerpt: "Mary recounts carrying two canvas suitcases onto the Queen Elizabeth vessel, the storm off the Irish coast, and seeing the Statue of Liberty through thick fog at dawn.",
      transcript: "The fog was so thick in Southampton harbor that we could barely see John's father waving from the pier. I had folded my mother's tartan shawl into my carry-on bag…",
      loves: 18, reflections: 9 },
    { id: "s2", title: "The Legendary Garden at Rose Cottage", kind: "audio", category: "Elder Oral Histories", by: "john", recorded: "1994-06-01",
      duration: 254, tag: "Memorial Tape Record",
      excerpt: "Archival voice recording digitized from an analog Maxell XL-II cassette. John explains his hybrid rose grafting techniques and why the honeybees favored the stone terrace wall.",
      transcript: "", loves: 31, reflections: 12 },
    { id: "s3", title: "How Michael Lost His First Bicycle", kind: "written", category: "Written Memories", by: "sarah", recorded: "1982-07-01",
      tag: "Written Memoir & Photo",
      excerpt: "“Michael was only seven, and Uncle Robbie had painted the Raleigh frame fire-engine red. Within four hours of unwrapping it, Michael parked it next to the canal locks during high tide…”",
      transcript: "", loves: 22, reflections: 4 },
    { id: "s4", title: "My First Day at University & Grandma's Note", kind: "audio", category: "Spoken Audio", by: "daniel", recorded: "2022-09-05",
      duration: 348, tag: "Audio Reflection",
      excerpt: "Daniel describes moving into the Glasgow dorms, feeling completely overwhelmed by the rain and solitude, and unzipping his duffel bag to find Grandma Mary's handwritten note.",
      transcript: "", loves: 14, reflections: 2 },
    { id: "s5", title: "Dad's Secret Apple Tart Recipe", kind: "audio", category: "Traditions & Recipes", by: "sarah", recorded: "2025-08-20",
      duration: 252, tag: "Recipe", excerpt: "Recorded by daughter Sarah Mackenzie in the Inverness kitchen.", transcript: "", loves: 9, reflections: 3 },
  ],

  milestones: [
    { id: "t1", type: "Milestones", icon: "celebration", title: "Grandma Mary Mackenzie's 80th Milestone Gathering", date: "2026-02-19", place: "Edinburgh, Scotland",
      text: "Four generations convened at St Bernard's Hall in Stockbridge to commemorate Mary's octogenarian jubilee. All 28 direct living descendants attended.",
      people: ["mary"], hasPhoto: true, p1: "#c28a4d", p2: "#3b2a1c" },
    { id: "t2", type: "Memorials", icon: "local_florist", title: "In Loving Memory of Patriarch John Mackenzie (1942–2021)", date: "2021-03-11", place: "Inverness Highlands",
      text: "Passed away peacefully at Raigmore Hospital, Inverness, surrounded by his wife Mary and his three children. Celebrated civil engineer, highland bagpipe mentor, and founder of the family archive.",
      people: ["john"] },
    { id: "t3", type: "Births", icon: "child_care", title: "Birth of Grace Mackenzie (4th Generation)", date: "2016-06-22", place: "Royal Infirmary of Edinburgh",
      text: "First child born to Michael Mackenzie and Emma Mackenzie (née Ross). Registered in National Records of Scotland (#ED-2016-8932).",
      people: ["grace", "michael", "emma"], verified: true },
    { id: "t4", type: "Births", icon: "child_care", title: "Birth of Anna Mackenzie-Miller", date: "2010-11-07", place: "Inverness",
      text: "Second child born to Sarah Mackenzie and David Miller at Raigmore Hospital, Inverness. Welcomed by elder brother Daniel.", people: ["anna"], verified: true },
    { id: "t5", type: "Births", icon: "child_care", title: "Birth of Daniel Miller", date: "2002-02-12", place: "St Andrews, Fife",
      text: "First grandchild born to John & Mary Mackenzie.", people: ["daniel"], verified: true },
    { id: "t6", type: "Weddings", icon: "favorite", title: "Wedding of Michael Mackenzie & Emma Ross", date: "2012-08-18", place: "Edinburgh",
      text: "A summer ceremony at Greyfriars Kirk followed by a ceilidh at the Assembly Rooms.", people: ["michael", "emma"], verified: true },
    { id: "t7", type: "Weddings", icon: "favorite", title: "Wedding of Sarah Mackenzie & David Miller", date: "1999-05-29", place: "Inverness",
      text: "Married at the Old High Church with 120 guests.", people: ["sarah", "david"], verified: true },
    { id: "t8", type: "Journeys", icon: "sailing", title: "Crossing the Atlantic aboard RMS Queen Elizabeth", date: "1968-10-02", place: "Southampton → New York",
      text: "Newlyweds John and Mary sailed to New York for John's botanical fellowship.", people: ["john", "mary"], verified: true },
    { id: "t9", type: "Weddings", icon: "favorite", title: "Wedding of John Mackenzie & Mary Campbell", date: "1968-04-20", place: "Edinburgh",
      text: "The founding union of the Mackenzie living archive.", people: ["john", "mary"], verified: true },
    { id: "t10", type: "Births", icon: "child_care", title: "Birth of Robert Dunbar", date: "1918-01-01", place: "Aberdeen", approx: true,
      text: "Birth year estimated from parish census records; exact date awaiting family consensus review.", people: ["robert"] },
  ],

  events: [
    { id: "e1", title: "Anna's Birthday", personId: "anna", kind: "birthday", sub: "Granddaughter" },
    { id: "e2", title: "Annual Summer Reunion", date: "2027-08-14", sub: "Lake Highlands • Park Veranda • 2:00 PM", attending: 18 },
  ],

  /* Legacy Archive: certificates, legal papers, letters and sealed time capsules. */
  records: [
    { id: "r1", title: "Birth certificate — John Mackenzie", category: "Certificates", date: "1942-05-03", custodian: "sarah", status: "verified",
      visibility: "All Family Branches", source: "National Records of Scotland, extract #1942-685-0212", icon: "badge",
      text: "Registered in the district of St Giles, Edinburgh. Father: Alexander Mackenzie, joiner. Mother: Margaret Mackenzie (née Grant)." },
    { id: "r2", title: "Marriage certificate — John Mackenzie & Mary Campbell", category: "Certificates", date: "1968-04-20", custodian: "mary", status: "verified",
      visibility: "All Family Branches", source: "St Cuthbert's Parish register, entry 114", icon: "favorite",
      text: "Married at St Cuthbert's Parish Church, Edinburgh, by the Rev. A. Ross. Witnesses: Evelyn Mackenzie and Duncan Campbell." },
    { id: "r3", title: "Royal Highland Regiment service record", category: "Certificates", date: "1961-09", custodian: "michael", status: "verified",
      visibility: "All Family Branches", source: "Army Personnel Centre, Glasgow", icon: "military_tech",
      text: "Private J. Mackenzie, 1st Battalion. Served 1961–1964 in Inverness and Berlin. Honourably discharged with good conduct." },
    { id: "r4", title: "Mary's will and letter of wishes", category: "Wills & Legal", date: "2024-03-12", custodian: "mary", status: "verified",
      visibility: "Only Me (draft)", source: "Original held by Thorntons Solicitors, Dundee", icon: "gavel",
      text: "Letter of wishes: the 1928 heirloom violin passes to Anna; John's brass compass to Daniel; the shortbread tins to whoever bakes the most." },
    { id: "r5", title: "Letter from Margaret to Mary on her wedding day", category: "Letters", date: "1968-04", custodian: "mary", status: "verified",
      visibility: "Immediate Family", source: "Original letter, Mary's writing box", icon: "mail",
      text: "My dear Mary — keep a warm kitchen and an open door, and never let the sun go down on a quarrel. John is a good lad, but he will forget his gloves. With all my love, Margaret." },
    { id: "r6", title: "1921 census extract — Robert Dunbar", category: "Certificates", date: "1921", approx: true, custodian: "sarah", status: "review",
      visibility: "All Family Branches", source: "Scotland's People, 1921 census, Aberdeen St Machar", icon: "fact_check",
      text: "Household of William Dunbar, Old Aberdeen. Son: Robert, age 3. Birth year estimated as 1918; awaiting a second source before confirming." },
    { id: "r7", title: "Time capsule: John's letter to his grandchildren", category: "Time capsules", date: "2019-12-25", custodian: "mary", status: "verified",
      visibility: "All Family Branches", source: "Recorded by John at Rose Cottage", icon: "hourglass_top", sealedUntil: "2030-12-25",
      text: "To Daniel, Anna and Grace: by the time you read this you will be grown. Measure twice, be kind always, and look after your grandmother." },
  ],

  /* Messages: private and group conversations. `unread` counts messages the signed-in user has not opened.
     A message may quote another (`replyTo`), carry `reactions` ({ personId: emoji }), be `starred` by the signed-in user,
     and, when sent by the signed-in user, has a `status`: "delivered" or "read". */
  threads: [
    { id: "c1", title: "Mackenzie Kinship Circle", group: true, pinned: true, members: ["mary", "sarah", "michael", "james", "daniel", "anna", "emma", "david"], unread: 2,
      messages: [
        { id: "x0", by: "mary", at: "2026-11-07T20:10", text: "Shall we hold the winter gathering at Rose Cottage this year? I'll do the shortbread.", status: "read",
          reactions: { sarah: "❤️", anna: "😍", james: "👍" } },
        { id: "x1", by: "sarah", at: "2026-11-08T18:02", text: "Reminder: please send your RSVP for the winter gathering by Friday!", starred: true },
        { id: "x2", by: "james", at: "2026-11-08T19:40", text: "I'm flying in from Vancouver on the 20th. Can't wait to see everyone.", reactions: { mary: "❤️", daniel: "🎉" } },
        { id: "x2b", by: "james", at: "2026-11-08T19:41", text: "Can someone pick me up from Edinburgh airport?" },
        { id: "x2c", by: "michael", at: "2026-11-08T20:05", text: "I can. Send me your flight number.", replyTo: "x2b" },
        { id: "x3", by: "anna", at: "2026-11-09T08:15", text: "Grandma, can you bring the shortbread tins again?", replyTo: "x0" },
        { id: "x4", by: "michael", at: "2026-11-09T09:30", text: "I've uploaded the photos from Grace's school play to Memories." },
      ] },
    { id: "c2", title: "Sarah Mackenzie", members: ["mary", "sarah"], unread: 1,
      messages: [
        { id: "y1", by: "mary", at: "2026-11-06T10:12", text: "Did the parish office reply about Uncle Robert's birth record?", status: "read" },
        { id: "y2", by: "sarah", at: "2026-11-07T16:45", text: "They found the 1921 census page. I've added it to the Legacy Archive for review.", replyTo: "y1" },
      ] },
    { id: "c3", title: "Daniel Miller", members: ["mary", "daniel"], unread: 0,
      messages: [
        { id: "z1", by: "daniel", at: "2026-10-30T21:05", text: "Thanks for the voice note, Gran. I listened to it twice before my exam.", reactions: { mary: "❤️" } },
        { id: "z2", by: "mary", at: "2026-10-31T09:20", text: "I'm so proud of you, love. Call me on Sunday.", status: "read", reactions: { daniel: "🥰" } },
      ] },
    { id: "c4", title: "Miller Branch", group: true, members: ["mary", "sarah", "david", "daniel", "anna"], unread: 0, muted: true,
      messages: [
        { id: "w1", by: "david", at: "2026-10-21T12:00", text: "Photos from Anna's concert are in the shared album." },
        { id: "w2", by: "anna", at: "2026-10-21T12:04", text: "Thank you Dad! The Bruch went so much better than the rehearsal.", replyTo: "w1", reactions: { mary: "👏", sarah: "❤️" } },
      ] },
  ],

  /* Family Administration: account roles, join requests and outstanding invitations. */
  members: [
    { id: "mary", role: "Admin", lastActive: "2026-11-10" }, { id: "sarah", role: "Admin", lastActive: "2026-11-09" },
    { id: "michael", role: "Custodian", lastActive: "2026-11-09" }, { id: "james", role: "Contributor", lastActive: "2026-11-08" },
    { id: "emma", role: "Contributor", lastActive: "2026-10-28" }, { id: "david", role: "Contributor", lastActive: "2026-10-21" },
    { id: "daniel", role: "Contributor", lastActive: "2026-10-31" }, { id: "anna", role: "Viewer", lastActive: "2026-11-09" },
  ],
  requests: [
    { id: "q1", name: "Fiona Campbell", relation: "Cousin (Campbell side)", vouchedBy: "mary", date: "2026-11-07", note: "Daughter of Duncan Campbell, Mary's brother." },
    { id: "q2", name: "Callum Ross", relation: "Brother-in-law of Michael", vouchedBy: "emma", date: "2026-11-05", note: "Emma's brother; would like to see the wedding album." },
  ],
  invites: [
    { id: "i1", name: "Isla Dunbar", email: "isla.dunbar@example.com", relation: "Cousin", sent: "2026-11-02", by: "sarah" },
  ],

  /* Privacy & Consent: who sees each kind of information, protected minors, and consent records. */
  privacy: {
    categories: { memories: "All Family Branches", stories: "All Family Branches", contact: "Immediate Family", birthdays: "All Family Branches", location: "Immediate Family" },
    minors: { grace: { hide: true, guardian: true }, anna: { hide: false, guardian: true } },
    mine: { tagging: true, voice: true, books: true, age: false },
    deletion: null,
  },
  consents: [
    { id: "k1", person: "michael", item: "Pottery photo (1982)", kind: "Photo", status: "given", date: "2026-03-02" },
    { id: "k2", person: "anna", item: "Solo violin recital", kind: "Photo", status: "given", date: "2023-01-04", guardian: "sarah" },
    { id: "k3", person: "james", item: "Grandma Mary's 80th gathering", kind: "Photo", status: "pending", date: "2026-02-21" },
    { id: "k4", person: "daniel", item: "My first day at university", kind: "Voice", status: "given", date: "2022-09-06" },
    { id: "k5", person: "emma", item: "Wedding photos (2012)", kind: "Photo", status: "withdrawn", date: "2025-06-11" },
  ],
  accessLog: [
    // `action` picks the sentence (pv.log.<action>) in the interface language; `title` is the item's own name.
    { id: "l1", who: "daniel", action: "listened", title: "Crossing the Atlantic in 1968", at: "2026-11-09T20:14" },
    { id: "l2", who: "james", action: "viewedProfile", at: "2026-11-08T07:51" },
    { id: "l3", who: "anna", action: "downloaded", title: "Grandma Mary's 80th Milestone Gathering", at: "2026-11-07T17:30" },
    { id: "l4", who: "sarah", action: "askedDeclined", title: "Mary's will and letter of wishes", at: "2026-11-03T11:02" },
  ],

  replies: [
    { by: "michael", when: "Yesterday", text: "The evening storytelling by the fireplace in Edinburgh when Grandpa John would take out the brass compass and tell tall seafaring tales." },
    { by: "anna", when: "2 days ago", text: "Grandma Mary baking shortbread in shaped tins and letting us dust the sugar before everyone woke up!" },
  ],
};

