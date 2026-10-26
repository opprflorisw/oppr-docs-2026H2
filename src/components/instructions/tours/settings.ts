import type { Tour } from "../types"

// Settings: setup only, in five groups plus My preferences. Everyone can look,
// but only a checked-in Engineer or Admin can change anything (SettingsBits,
// convex/lib/roles.ts), so the setup tours are for them. My preferences is
// per device and for everyone.

export const SETTINGS_TOURS: Tour[] = [
  {
    id: "settings-company-people",
    area: "settings",
    title: "Company, people and shifts",
    icon: "Users",
    summary: "Your company name and logo, everyone who can check in, and the plant's shifts.",
    what:
      "These Settings describe who you are and who works in the plant. You set the company name, logo and document languages, keep the list of people who can check in, and define the shifts.",
    why:
      "Training records, sign-offs and shift cover are only worth something when the names, roles and shifts behind them are right. An auditor asks who was trained, on which shift, and who approved it.",
    helps: [
      "Every PDF title page and Training record shows the right company",
      "Everyone can find their own name when they check in",
      "Shift cover on Home counts the right people per shift",
      "Roles decide who can review, approve and sign off",
    ],
    capabilities: [
      {
        title: "Company",
        body: "Name and logo used on every PDF title page, the Floor simulator, Training records and MCP. Document languages and the caption language of safety icons.",
      },
      {
        title: "People",
        body: "Add, edit and archive people as Operator, Engineer or Admin, with area, shift and team. They are not login accounts.",
      },
      {
        title: "Shifts",
        body: "The shifts, their times, whether they are on and whether they count for shift cover.",
      },
      {
        title: "Only Admins make Admins",
        body: "Engineers and Admins change people, but only an Admin can change an Admin or make someone one.",
      },
    ],
    audience: ["engineer", "admin"],
    minutes: 3,
    steps: [
      {
        id: "sections",
        route: "/settings?tab=company",
        target: "settings-sections",
        title: "Five groups and your preferences",
        body: "Settings holds setup only: Company, People and roles, Documents, Training and Floor. My preferences sits below them.",
        placement: "right",
      },
      {
        id: "company",
        target: "settings-company-name",
        title: "Name and logo",
        body: "Used on the title page of every PDF, the Floor simulator, Training records and MCP. The logo comes from the image library.",
        placement: "bottom",
      },
      {
        id: "languages",
        target: "settings-company-languages",
        title: "Languages",
        body: "Pick the languages your Documents are written in, and the language of the captions under safety icons. Press Save when you are done.",
        placement: "top",
      },
      {
        id: "people",
        route: "/settings?tab=people",
        target: "settings-people-list",
        title: "Everyone who can check in",
        body: "Each person is an Operator, Engineer or Admin, with a role, area, shift and team. Archived people keep their records but can no longer check in.",
        placement: "top",
      },
      {
        id: "people-kinds",
        target: "settings-people-kinds",
        title: "Filter by kind",
        body: "Show only Operators, Engineers or Admins. The search field finds a person by name, role, area or team.",
        placement: "bottom",
      },
      {
        id: "people-add",
        target: "settings-people-add",
        title: "Add a person",
        body: "Add someone new. Only an Admin can make someone an Admin or change an Admin.",
        placement: "bottom",
      },
      {
        id: "shifts",
        route: "/settings?tab=shifts",
        target: "settings-shifts-list",
        title: "Shifts",
        body: "Each shift has times, can be turned off and can count for shift cover. Turn a shift off rather than removing it, because people point at it.",
        placement: "top",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Check that your own name, role and shift are right. Then take the Documents settings tour.",
        placement: "center",
      },
    ],
  },
  {
    id: "settings-documents",
    area: "settings",
    title: "Document settings",
    icon: "Hash",
    summary: "Naming codes, document types, templates, the PDF title page, safety icons and review rules.",
    what:
      "These Settings decide how every Document is built and controlled: how its code is made, which types exist, what a new one starts with, what an exported PDF looks like, which safety icons authors can use, and the rules for review and approval.",
    why:
      "Under ISO 9001 every Document needs a unique code, a fixed structure and a clear review and approval route. When each author invents their own, nobody can find or trust the result. Set it once here and every Document follows it.",
    helps: [
      "Every Document gets a clear, unique code like EXT-OPS-SOP-0001",
      "Authors start from the right structure for each type",
      "Exported PDFs look the same and show the right status",
      "Periodic reviews and four-eyes approval happen without chasing",
    ],
    capabilities: [
      {
        title: "Naming and types",
        body: "The Areas, disciplines and document types that build every code. The sequence number is automatic.",
      },
      {
        title: "Templates",
        body: "The starting structure for each document type. Create, edit, duplicate or delete them.",
      },
      {
        title: "Title page and PDF",
        body: "Title size, accent color, header and footer text, confidentiality label and watermark for exports.",
      },
      {
        title: "Safety icons",
        body: "The PPE and safety pictograms authors can place, with English and Dutch captions. Switch them on or off.",
      },
      {
        title: "Review and approval",
        body: "The default periodic review interval, when a review shows as due soon, four-eyes and a required change note.",
      },
    ],
    audience: ["engineer", "admin"],
    minutes: 4,
    steps: [
      {
        id: "naming",
        route: "/settings?tab=naming",
        target: "settings-naming-vocab",
        title: "How codes are built",
        body: "A code is Area, discipline, type and a number, for example EXT-OPS-SOP-0001. Add or remove the Areas and disciplines here.",
        placement: "bottom",
      },
      {
        id: "types",
        target: "settings-naming-types",
        title: "Document types",
        body: "The types an author can pick, like SOP or work instruction. The type is the third part of the code.",
        placement: "top",
      },
      {
        id: "templates",
        route: "/settings?tab=templates",
        target: "settings-templates-list",
        title: "Templates",
        body: "Each template gives a document type its starting structure. Edit one, or duplicate it from the menu next to it.",
        placement: "top",
      },
      {
        id: "templates-new",
        target: "settings-templates-new",
        title: "New template",
        body: "Make a new starting structure for authors. You can preview it as a PDF before you save.",
        placement: "left",
      },
      {
        id: "title-page",
        route: "/settings?tab=title-page",
        target: "settings-section-title-page",
        title: "Title page and PDF",
        body: "What the first page, header and footer of an exported PDF show. The preview updates while you change it.",
        placement: "top",
      },
      {
        id: "safety",
        route: "/settings?tab=safety",
        target: "settings-section-safety",
        title: "Safety icons",
        body: "Every PPE and safety pictogram authors can place in a Document. Anyone can search them; an Engineer or Admin can edit captions and switch icons on or off.",
        placement: "top",
      },
      {
        id: "review",
        route: "/settings?tab=review",
        target: "settings-review-periodic",
        title: "Periodic review",
        body: "How often a Published Document is checked again, and how many days before that it shows on Home as due soon.",
        placement: "bottom",
      },
      {
        id: "approval",
        target: "settings-review-approval",
        title: "Approval rules",
        body: "Four-eyes means the reviewer is not an author, and the reviewer and approver are two different Engineers. You can also require a change note from version 2 on.",
        placement: "top",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Check the Areas match your plant, then open a template for the type you write most.",
        placement: "center",
      },
    ],
  },
  {
    id: "settings-training-floor",
    area: "settings",
    title: "Training and floor settings",
    icon: "SlidersHorizontal",
    summary: "What a new Training starts with, and how shared phones and Captures behave on the floor.",
    what:
      "These Settings set the defaults for every new Training, like the pass mark and the refresher period, and how the phone works on the floor: when a shared phone checks out and what Operators are told before a Capture.",
    why:
      "A Training record only proves something when every Training is held to the same bar. On the floor, a shared phone left with someone's name on it, or a Capture without a clear privacy notice, breaks trust fast.",
    helps: [
      "Every new Training starts with the same pass mark and questions",
      "People get a refresher before their record expires",
      "A shared phone never keeps the wrong name checked in",
      "Operators know what happens with their photos and voice notes",
    ],
    capabilities: [
      {
        title: "Training defaults",
        body: "Pass mark, questions per Learning objective, refresher period and due date for a new Training.",
      },
      {
        title: "Safety and coaching",
        body: "Ask for a try-out at the line for safety Trainings, and ask an Engineer to walk someone through after repeated fails.",
      },
      {
        title: "Shared phones",
        body: "How long a phone waits without a touch before it asks if the person is still there and checks out.",
      },
      {
        title: "Captures privacy",
        body: "Your own notice for Operators before their first Capture, and how long photos, video and voice notes are kept.",
      },
    ],
    audience: ["engineer", "admin"],
    minutes: 2,
    steps: [
      {
        id: "training",
        route: "/settings?tab=training",
        target: "settings-training-defaults",
        title: "New Trainings start with",
        body: "The pass mark, questions per Learning objective, refresher period and due date. The author can still change each value in the Training builder.",
        placement: "bottom",
      },
      {
        id: "coaching",
        target: "settings-training-safety",
        title: "Safety and coaching",
        body: "Ask for a try-out at the line when a Training covers a safety key point, and get an Engineer to coach someone who fails the same Training again and again.",
        placement: "top",
      },
      {
        id: "phones",
        route: "/settings?tab=floor",
        target: "settings-floor-phones",
        title: "Shared phones",
        body: "Without a touch for this long, the phone asks if the person is still there and then checks them out.",
        placement: "bottom",
      },
      {
        id: "captures",
        target: "settings-floor-captures",
        title: "Captures privacy",
        body: "The standard points every Operator sees before a first Capture, your own extra notice, and how long media is kept.",
        placement: "top",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Agree the pass mark and the Captures notice with your team, then set them here once.",
        placement: "center",
      },
    ],
  },
  {
    id: "my-preferences",
    area: "settings",
    title: "My preferences",
    icon: "Settings",
    summary: "Your account, who is checked in, and what this browser remembers.",
    what:
      "My preferences shows the account signed in on this device, who is checked in here and on the phone preview, an editor option, and the small things this browser remembers for you. Nothing here changes anything for other people.",
    why:
      "On a shared computer it should be easy to see who is acting and to start fresh. The account only opens Oppr; the person checked in is who reads, trains and signs.",
    helps: [
      "You see at once who is checked in on this device",
      "You can check out or sign out in one click",
      "You can clear what this browser remembers",
    ],
    capabilities: [
      {
        title: "Account and device",
        body: "The login that opens Oppr on this device, and a button to sign out.",
      },
      {
        title: "Who is checked in",
        body: "The person checked in on this browser and on the phone preview, each with a Check out button.",
      },
      {
        title: "Remembered on this device",
        body: "Last filing, recent Assets, the anonymous Ask conversation, phone recents and hints. Forget any of them safely.",
      },
    ],
    audience: ["operator", "engineer", "admin"],
    minutes: 1,
    steps: [
      {
        id: "link",
        route: "/settings?tab=preferences",
        target: "settings-link-preferences",
        title: "My preferences",
        body: "Below the five setup groups. Everything here is only for this device.",
        placement: "right",
      },
      {
        id: "account",
        target: "settings-preferences-account",
        title: "Signed-in account",
        body: "This login only opens Oppr on this device. Who you are in Oppr is the person you check in as.",
        placement: "bottom",
      },
      {
        id: "check-in",
        target: "settings-preferences-check-in",
        title: "Checked in on this device",
        body: "Who is checked in on this browser and on the phone preview. Check out here when you leave a shared computer.",
        placement: "bottom",
      },
      {
        id: "remembered",
        target: "settings-preferences-remembered",
        title: "Remembered on this device",
        body: "Small things that save you a click. Forgetting them is safe.",
        placement: "top",
      },
    ],
  },
]
