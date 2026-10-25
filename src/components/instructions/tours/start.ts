import type { Tour } from "../types"

// Getting started: the tours a new person takes first. Targets live in the
// shell (nav-*, search-button), the top bar (start-*) and Home (home-*).

export const START_TOURS: Tour[] = [
  {
    id: "first-five-minutes",
    area: "start",
    title: "Your first five minutes",
    icon: "Compass",
    summary: "The six places, search, checking in and the phone, in one short walk.",
    what:
      "Oppr Knowledge is where your plant keeps its controlled knowledge: Documents, Trainings, Skills and Wikis. This tour shows you the six places in the left menu, how to find anything fast and how to tell Oppr who you are.",
    why:
      "In most plants the right instruction is hidden in a folder, an old binder or someone's head. New people ask around, and experienced people lose time answering the same questions. One place that everyone can search, with only Published knowledge in it, fixes that.",
    helps: [
      "You know where everything lives after one walk around the screen",
      "You find any Document, Asset, Training, Wiki or person in seconds",
      "You know when to check in and why it matters",
      "You can see what an Operator sees on the phone",
    ],
    capabilities: [
      {
        title: "Six places, nothing deeper",
        body: "Home, Documents, Learn, Wiki, Plant and Settings. Everything else is one level down or opens in a panel.",
      },
      {
        title: "Search with Ctrl+K",
        body: "One field for Documents, Assets, Trainings, Wikis, people and Plant words. The last row asks your question instead.",
      },
      {
        title: "Check in by picking your name",
        body: "Reading and asking work without a name. Trainings, Rounds and sign-offs need you to be checked in.",
      },
      {
        title: "Phone preview",
        body: "The real phone app in a frame next to the desktop, with its own check-in, like a second device.",
      },
    ],
    audience: ["operator", "engineer", "admin"],
    minutes: 3,
    steps: [
      {
        id: "home",
        route: "/",
        target: "nav-home",
        title: "Welcome. This is Home",
        body: "The left menu has six places. Home is your start page: what needs a decision today and how the knowledge base is doing.",
        placement: "right",
      },
      {
        id: "documents",
        target: "nav-documents",
        title: "Documents and Wiki",
        body: "Documents holds every SOP, work instruction and manual. Only Published versions count as knowledge. Wiki gives short overviews built from them.",
        placement: "right",
      },
      {
        id: "learn",
        target: "nav-learn",
        title: "Learn and Plant",
        body: "Learn holds Trainings and Skills: who can do what. Plant describes your Areas, Lines and Assets, and the words people use on the floor.",
        placement: "right",
      },
      {
        id: "settings",
        target: "nav-settings",
        title: "Settings",
        body: "Setup only: the company, people and shifts, document rules, Training defaults and your own preferences.",
        placement: "right",
      },
      {
        id: "search",
        target: "search-button",
        title: "Find anything with Ctrl+K",
        body: "After the tour, press Ctrl+K anywhere or click here. Type a code like EXT-OPS-SOP-0001, a title, an Asset or a name.",
        placement: "right",
      },
      {
        id: "check-in",
        target: "start-check-in",
        title: "Check in: tell Oppr who you are",
        body: "Pick your name here. Reading and Ask work without it, but Trainings, Rounds and sign-offs need you checked in. It also keeps your Ask questions as your own.",
        placement: "bottom",
      },
      {
        id: "phone",
        target: "nav-phone",
        title: "See the phone app",
        body: "Opens the phone app that Operators use on the floor, right next to the desktop. It keeps its own check-in, like a second device.",
        placement: "right",
      },
      {
        id: "instructions",
        target: "nav-instructions",
        title: "Come back any time",
        body: "Instructions has a tour for every part of Oppr. Each one starts with what it does and why, then shows you the real screens.",
        placement: "right",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Check in with your own name, then take the Home and Ask tours. Engineers can go on with the Documents tours.",
        placement: "center",
      },
    ],
  },
  {
    id: "home",
    area: "start",
    title: "Home",
    icon: "Home",
    summary: "What needs a decision today, and how the knowledge base is doing.",
    what:
      "Home is your start page. It shows an inbox of decisions waiting today, like reviews and periodic reviews, and a small Knowledge health snapshot. When you are checked in it also shows shift cover and what changed this week.",
    why:
      "Approvals and periodic reviews that nobody sees go overdue, and then an outdated instruction stays on the floor. Home puts the next decision in front of the person who can make it, with one obvious action per row.",
    helps: [
      "You see at a glance what is waiting for a decision",
      "You never miss a periodic review that is due",
      "You see who can run each line on each shift",
      "You know what changed in the Published knowledge this week",
    ],
    capabilities: [
      {
        title: "Inbox",
        body: "Documents waiting for review or publishing and periodic reviews that are due, plus open Findings, Proposed revisions, Trainings and Skills that need attention.",
      },
      {
        title: "Knowledge health",
        body: "How many Documents are Published, in progress or due for review, and how many Wikis there are.",
      },
      {
        title: "Shift cover",
        body: "For the coverage questions an Engineer picked, how many qualified people work each shift.",
      },
      {
        title: "This week",
        body: "New Documents and Significant changes from the last 7 days, and what they set off.",
      },
    ],
    audience: ["operator", "engineer", "admin"],
    minutes: 2,
    steps: [
      {
        id: "inbox",
        route: "/",
        target: "home-inbox",
        title: "Your inbox",
        body: "Documents waiting for review or publishing, and periodic reviews that are due. Each row has one button that takes you straight to the work.",
        placement: "right",
      },
      {
        id: "inbox-engineer",
        target: "home-work",
        title: "More work below the inbox",
        body: "Below the inbox you also see open Findings, Proposed revisions, Trainings to review, try-outs and people who need re-training. Each part only shows when there is something to do. An Engineer settles most of them.",
        placement: "right",
      },
      {
        id: "new-document",
        target: "home-new-document",
        title: "Start a new Document",
        body: "Write a new SOP or work instruction, convert a PDF or wrap a supplier manual. It starts as a Draft and only counts once it is Published.",
        placement: "bottom",
        audience: ["engineer", "admin"],
      },
      {
        id: "instructions",
        target: "home-instructions",
        title: "Tours, right from Home",
        body: "This card takes you to Instructions, where every part of Oppr has its own tour.",
        placement: "left",
      },
      {
        id: "shift-cover",
        target: "home-shift-cover",
        title: "Shift cover",
        body: "Shown when you are checked in. How many qualified people work each shift, for the Skill profiles an Engineer chose. Red means nobody, amber one, green two or more.",
        placement: "left",
      },
      {
        id: "this-week",
        target: "home-this-week",
        title: "This week",
        body: "Shown when you are checked in. New Documents and Significant changes from the last 7 days, and how many people they send back to re-train. Small fixes are only counted.",
        placement: "left",
      },
      {
        id: "health",
        target: "home-health",
        title: "Knowledge health",
        body: "How many Documents are Published, in progress or due for review. Click Published, Drafts and revisions or Wikis to open that list.",
        placement: "left",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Open Home at the start of your day. If the inbox is empty, nothing is waiting for a decision.",
        placement: "center",
      },
    ],
  },
  {
    id: "ask",
    area: "start",
    title: "Ask",
    icon: "MessageSquareText",
    summary: "Ask a question in your own words and get an answer from Published knowledge, with sources.",
    what:
      "Ask answers questions in plain language. Answers come only from Published Documents, and every answer shows its sources, so you can open the exact passage. The Ask panel follows the page you are on: a Document, an Asset, a Wiki, a Training or the whole library.",
    why:
      "On the floor nobody has time to read a 20 page SOP to find one setting. People ask a colleague instead, and the answer depends on who is around. Ask gives the same answer to everyone, from the approved source, and shows where it comes from.",
    helps: [
      "You get an answer in seconds, not after a search through folders",
      "You can check every answer against its source",
      "You never get an answer from a Draft or an old version",
      "You are warned when two sources disagree",
    ],
    capabilities: [
      {
        title: "Answers with sources",
        body: "Every answer cites the Published passages it uses. Click a source to open that passage.",
      },
      {
        title: "Follows the page",
        body: "On a Document it answers about that Document, on an Asset about its Documents, elsewhere about the whole library. You can change the scope.",
      },
      {
        title: "Works anonymously",
        body: "You do not need to check in. When you are checked in, your questions are kept as your own conversation.",
      },
      {
        title: "Warns about contradictions",
        body: "When a source has an open contradiction Finding, Ask still answers but names both sources.",
      },
      {
        title: "Open it anywhere",
        body: "Use the Ask button in the top bar, Ctrl+J, or type a question in Ctrl+K search.",
      },
    ],
    audience: ["operator", "engineer", "admin"],
    minutes: 2,
    steps: [
      {
        id: "button",
        route: "/library",
        target: "start-ask-button",
        title: "Open Ask",
        body: "Click Ask now to open the panel, then press Next. Ctrl+J does the same from any page.",
        placement: "bottom",
        opens: "start-ask-panel",
      },
      {
        id: "panel",
        target: "start-ask-panel",
        title: "Ask a question",
        body: "Type your question in your own words at the bottom, or pick a starter question. The chip at the top shows what Ask looks in: here the whole library.",
        placement: "left",
      },
      {
        id: "sources",
        target: "start-ask-panel",
        title: "Check the sources",
        body: "Each answer lists the Published passages it used. Click one to open it. Answers never come from a Draft.",
        placement: "left",
      },
      {
        id: "follow",
        route: "{firstDocument}",
        target: "start-ask-button",
        title: "Ask follows the page",
        body: "On a Document, Ask answers about that Document. Open Ask here and the chip at the top shows the Document's code.",
        placement: "bottom",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Ask a real question about your line. Questions about a Document feed its Document insights, so its next version gets clearer.",
        placement: "center",
      },
    ],
  },
  {
    id: "search",
    area: "start",
    title: "Search",
    icon: "Search",
    summary: "One field for Documents, Assets, Trainings, Wikis, people and Plant words.",
    what:
      "Search opens with Ctrl+K from any page. One field finds Documents, Assets, Trainings, Wikis, people and Plant items, grouped by place. With nothing typed, it offers quick links to the main places.",
    why:
      "Knowledge is only useful when you can find it. People remember a code, a machine number, a word from the floor or a colleague's name, not where a file is stored. Search accepts all of them.",
    helps: [
      "You jump to any Document by code or title",
      "You find an Asset by its code, name or location",
      "You find Plant words by their abbreviation or Dutch synonym",
      "You turn any search into a question for Ask",
    ],
    capabilities: [
      {
        title: "Everything in one field",
        body: "Documents, Assets, Trainings, Wikis, people and Plant items, up to six of each, grouped by place.",
      },
      {
        title: "Codes and names",
        body: "Type a naming code like EXT-OPS-SOP-0001, an Asset code like EXL-201, a title or a name.",
      },
      {
        title: "Go to a place",
        body: "With an empty field, jump to Documents, Learn, the Skills workspace, Wiki, Plant, the Glossary or ISO 9001.",
      },
      {
        title: "Ask instead",
        body: "The last row always asks what you typed as a question, answered from Published knowledge.",
      },
    ],
    audience: ["operator", "engineer", "admin"],
    minutes: 1,
    steps: [
      {
        id: "open",
        route: "/",
        target: "search-button",
        title: "Open search",
        body: "This button opens search. Ctrl+K does the same on any page, and Esc closes it again. Try it after the tour.",
        placement: "right",
      },
      {
        id: "type",
        title: "Type what you remember",
        body: "A code, a title, an Asset, a person or a word from the floor. Results are grouped: Documents, Assets, Trainings, Wikis, People and Plant.",
        placement: "center",
      },
      {
        id: "ask",
        title: "Or ask it as a question",
        body: "The last row always says Ask, followed by what you typed. Pick it and the Ask panel answers from Published knowledge.",
        placement: "center",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Finish this tour, then press Ctrl+K and type the code of a machine you work on.",
        placement: "center",
      },
    ],
  },
]
