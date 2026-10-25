import type { Tour } from "../types"

// Plant tours (area "plant"). Targets are data-tour attributes in
// src/pages/desktop/{PlantPage,AssetsPage,AssetDetailPage,FloorSimulatorPage}.tsx,
// src/components/plant/** and src/components/docs/AssetDetailBody.tsx.
// Everyone can read the Plant; editing it needs an Engineer or Admin (isEditor).

export const PLANT_TOURS: Tour[] = [
  {
    id: "plant-overview",
    area: "plant",
    title: "Your Plant",
    icon: "Factory",
    summary: "Who we are, the Areas and Lines, and the words people use on the floor.",
    what:
      "Plant describes the organization and the plant: who we are, the site with its Areas, Lines and Assets, processes, products, materials, hazards, roles and teams, and the Glossary of floor words.",
    why:
      "New people do not know what MIX or EXT means, which Line makes what, or what colleagues call a part in Dutch. Ask and Wikis need the same background to understand a question. Plant writes it down once, for everyone.",
    helps: [
      "You learn the layout and the words of the plant in your first week.",
      "You look up an abbreviation or a Dutch word in seconds.",
      "Ask and Wikis understand your question better, because they get the Plant as background.",
      "Engineers keep it up to date from Published Documents, with one click per proposal.",
    ],
    capabilities: [
      {
        title: "Overview",
        body: "Background, products and customers, history, quality policy and key facts about the organization.",
      },
      {
        title: "Structure",
        body: "Site, Areas, Lines and the Assets on them, in one view.",
      },
      {
        title: "Processes, materials, roles",
        body: "What the plant does and makes, the materials and hazards, and the roles and teams, each linked to Documents, Assets, Trainings and Skills.",
      },
      {
        title: "Glossary",
        body: "Every floor word with its meaning and its other words: abbreviations and Dutch synonyms. Ctrl+K and the phone find a term by any of them.",
      },
      {
        title: "Proposed from documents",
        body: "Engineers let the AI read Published Documents and propose items. Each one is accepted or rejected by a person. The Plant is background, never a source for steps or settings.",
      },
    ],
    audience: ["operator", "engineer", "admin"],
    minutes: 3,
    steps: [
      {
        id: "nav",
        route: "/plant",
        target: "nav-plant",
        placement: "right",
        title: "Plant in the menu",
        body: "Everything about the organization and the plant sits under Plant.",
      },
      {
        id: "tabs",
        target: "plant-tabs",
        placement: "bottom",
        title: "One tab per topic",
        body: "Overview, Structure, Processes and products, Materials and hazards, Roles and teams, Glossary and Assets.",
      },
      {
        id: "background",
        target: "plant-background",
        placement: "right",
        title: "Who we are",
        body: "A short background of the organization. Below it: products and customers, history and the quality policy.",
      },
      {
        id: "recorded",
        target: "plant-recorded",
        placement: "left",
        title: "Recorded so far",
        body: "How many Lines, processes, materials, roles and terms the Plant holds. Click one to go to its tab.",
      },
      {
        id: "structure",
        route: "/plant/structure",
        target: "plant-structure",
        placement: "top",
        title: "Structure",
        body: "The site, its Areas and the Lines inside them, with their Assets. Click a Line to see what it is linked to.",
      },
      {
        id: "glossary-search",
        route: "/plant/glossary",
        target: "plant-search",
        placement: "bottom",
        title: "Look up a word",
        body: "Type an abbreviation or a Dutch word. The Glossary finds the term by any of its words.",
      },
      {
        id: "glossary",
        target: "plant-glossary",
        placement: "top",
        title: "Glossary",
        body: "Each term with what people also call it, its meaning and its Area. Click a row for the full card with its links.",
      },
      {
        id: "engineers",
        audience: ["engineer", "admin"],
        title: "Keep it up to date",
        body: "As an Engineer you add items with the button at the top right. In its menu, Propose from documents lets the AI suggest items from Published Documents. You accept or reject each one.",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Look up three words you hear on the floor. Then take the tour Assets to see the machines and their Documents.",
      },
    ],
  },
  {
    id: "plant-assets",
    area: "plant",
    title: "Assets",
    icon: "QrCode",
    summary: "Every machine with its QR code, Documents, Trainings and who can work there.",
    what:
      "Assets are the machines and equipment in the plant. Each Asset has a QR code and a page with its linked Documents, its Trainings and Rounds, who is qualified to work there, and the Wikis that cover it.",
    why:
      "At the machine you need the right instruction for that machine, not a search through a whole library. Linking Documents to Assets means one Scan gets you there, and shows if there is an open Finding.",
    helps: [
      "You find every Document for a machine in one place.",
      "You print the QR code and hang it at the machine.",
      "You see who on each shift is qualified to work there.",
      "You are warned when the Documents of this machine disagree.",
    ],
    capabilities: [
      {
        title: "Asset list and hierarchy",
        body: "Search by name, code or location, as a list or as the tree of machines and their parts.",
      },
      {
        title: "QR code",
        body: "Each Asset has a QR code. On the floor a Scan opens its Published Documents and Ask on the phone.",
      },
      {
        title: "Linked documents",
        body: "All Documents linked to the Asset, with their status, on one page.",
      },
      {
        title: "Who can work here",
        body: "People qualified on the Skills this Asset needs, per shift.",
      },
      {
        title: "Overviews",
        body: "The Wikis that cover this Asset or its Documents.",
      },
    ],
    audience: ["operator", "engineer", "admin"],
    minutes: 3,
    steps: [
      {
        id: "search",
        route: "/plant/assets",
        target: "assets-search",
        placement: "bottom",
        title: "Find a machine",
        body: "Search by name, code or location.",
      },
      {
        id: "views",
        target: "assets-views",
        placement: "bottom",
        title: "List or hierarchy",
        body: "See all Assets as a list, or as a tree of machines and their parts.",
      },
      {
        id: "table",
        target: "assets-table",
        placement: "top",
        title: "The Asset list",
        body: "Each row shows the Asset, its pin on the floor plan, its Documents and its location. Hover the Documents count to see them. Click a row to open the Asset.",
      },
      {
        id: "summary",
        route: "{firstAsset}",
        target: "asset-summary",
        placement: "bottom",
        title: "About this Asset",
        body: "A photo, a short description and how many Documents are linked.",
      },
      {
        id: "qr",
        target: "asset-qr",
        placement: "bottom",
        title: "QR code",
        body: "Show the QR code to print it and hang it at the machine. A Scan opens this Asset on the phone. On a narrow screen, QR code sits under the ... button.",
      },
      {
        id: "documents",
        target: "asset-documents",
        placement: "top",
        title: "Linked documents",
        body: "Every Document linked to this Asset. Click one to read it.",
      },
      {
        id: "who",
        target: "asset-who-can-work",
        placement: "left",
        title: "Who can work here",
        body: "People who hold the Skills this Asset needs at level 2 or higher, per shift.",
      },
      {
        id: "overviews",
        target: "asset-overviews",
        placement: "left",
        title: "Overviews",
        body: "The Wikis about this Asset, for a quick read before you start.",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Open the Asset you work on most. Then take the tour Floor simulator to see what a Scan shows on the phone.",
      },
    ],
  },
  {
    id: "plant-floor",
    area: "plant",
    title: "Floor simulator",
    icon: "Map",
    summary: "Walk the plant on screen and see what an Operator sees after a Scan.",
    what:
      "The Floor simulator shows a plan of the plant with every Asset and its QR code. Next to it a phone runs the real Operator app. Click a machine to walk there and Scan it, or do a Round like a treasure hunt.",
    why:
      "You cannot always walk onto the floor to try the phone app or to show it to a colleague. The simulator lets you see exactly what an Operator sees at each machine, from your desk.",
    helps: [
      "You see what an Operator gets after a Scan, before you go to the floor.",
      "You check that each machine has the right Published Documents.",
      "You try a Round without walking the plant.",
      "You can show the floor app in a meeting.",
    ],
    capabilities: [
      {
        title: "Floor plan",
        body: "Every Asset on a plan of the plant. Click a machine to walk there and Scan its QR code.",
      },
      {
        title: "The real phone app",
        body: "The phone shows what an Operator sees: Published Documents only, and Ask. Anonymous unless you check in.",
      },
      {
        title: "Free walk",
        body: "Look around and Scan any Asset you like.",
      },
      {
        title: "Round",
        body: "Do a Round stop by stop. At the wrong machine the phone tells you where to go. A Round is proof, so it needs you checked in.",
      },
    ],
    audience: ["operator", "engineer", "admin"],
    minutes: 3,
    steps: [
      {
        id: "nav",
        route: "/floor",
        target: "nav-floor",
        placement: "right",
        title: "Try it: Floor simulator",
        body: "The Floor simulator sits under Try it in the left menu.",
      },
      {
        id: "plan",
        target: "floor-plan",
        placement: "right",
        title: "The plant plan",
        body: "Every Asset on the plan. Click a machine to walk there and Scan its QR code.",
      },
      {
        id: "assets",
        target: "floor-assets",
        placement: "top",
        title: "Pick a machine",
        body: "The same Assets as cards, with how many Published Documents and Rounds each has. Click one to walk there.",
      },
      {
        id: "phone",
        target: "floor-phone",
        placement: "left",
        title: "The phone",
        body: "This is the real Operator app. After a Scan it shows that Asset's Published Documents and Ask.",
      },
      {
        id: "location",
        target: "floor-location",
        placement: "bottom",
        title: "Where you are",
        body: "Shows the machine you are standing at. You start at the entrance.",
      },
      {
        id: "mode",
        target: "floor-mode",
        placement: "bottom",
        title: "Free walk or Round",
        body: "Free walk lets you look around. Round takes you through a Training stop by stop; check in first, because a Round counts as proof.",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Click a machine on the plan and watch the phone. Then open a Document on the phone and Ask it a question.",
      },
    ],
  },
  {
    id: "plant-phone-app",
    area: "plant",
    title: "The phone app",
    icon: "Smartphone",
    summary: "The app Operators use on the floor: Scan, Find, Capture, Ask and Me.",
    what:
      "The phone app is Oppr on the floor. Scan a machine to see its Published Documents, find anything in one search, Ask a question, record how you do a job as a Capture, and see your own To do list and Skills. Here it runs in the Floor simulator, exactly as on a real phone.",
    why:
      "On the floor you have a phone, not a desk. You need the right instruction for the machine in front of you, fast, and a way to show how the work is really done. The phone app gives you both, with only Published knowledge.",
    helps: [
      "You open the right Document for a machine with one Scan.",
      "You get an answer from Published Documents without walking to the office.",
      "You can show how you do a job, so the instruction matches the floor.",
      "You see your own To do list and Skills wherever you are.",
    ],
    capabilities: [
      { title: "Scan", body: "Point the camera at the QR code on a machine, or type its code when the label is damaged." },
      { title: "Find", body: "One search for Assets, Documents and Wikis. With nothing typed, browse them." },
      { title: "Ask", body: "Answers from Published Documents only, with sources. It follows the Document, Asset or Wiki you are on." },
      { title: "Capture", body: "Record a job as you do it: notes, photos, video and voice notes. Hand it in when you are done." },
      { title: "Me", body: "Your To do list, your Skills with level and expiry, your Training records, and Check out." },
    ],
    audience: ["operator", "engineer", "admin"],
    minutes: 3,
    steps: [
      {
        id: "phone",
        route: "/floor",
        target: "floor-phone",
        placement: "left",
        title: "The phone app",
        body: "This is the real app Operators use on the floor. You can also open it from Phone in the left menu.",
      },
      {
        id: "tabs",
        target: "floor-phone",
        placement: "left",
        title: "Five tabs",
        body: "At the bottom of the phone: Home, Find, Capture, Ask and Me. One tap takes you to each.",
      },
      {
        id: "home",
        target: "floor-phone",
        placement: "left",
        title: "Home",
        body: "What to do now: the big Scan button, a running Capture, your next To do items, Rounds for you, Wikis, and what you saved or opened recently.",
      },
      {
        id: "scan-find",
        target: "floor-phone",
        placement: "left",
        title: "Scan and Find",
        body: "Scan the QR code on a machine to see its Published Documents. Find searches Assets, Documents and Wikis, and ends with Ask when no title matches.",
      },
      {
        id: "ask",
        target: "floor-phone",
        placement: "left",
        title: "Ask",
        body: "Ask a question in your own words. The answer comes from Published Documents only, with its sources. You do not need to check in.",
      },
      {
        id: "capture",
        target: "floor-phone",
        placement: "left",
        title: "Record a Capture",
        body: "Check in, give the Capture a name and press Start Capture. Add notes, photos, video and voice notes while you work, pause when you need to, then press Hand in. After that an Engineer can turn it into a Draft.",
      },
      {
        id: "me",
        target: "floor-phone",
        placement: "left",
        title: "Me",
        body: "Everything about you on this phone: your To do list, your Skills with their level and when they run out, your Training records, and Check out.",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Click a machine on the plan to Scan it, then open one of its Documents on the phone. Next time you are on the floor, Scan the machine you work on.",
      },
    ],
  },
]
