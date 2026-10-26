import type { Tour } from "../types"

// Wiki tours (area "wiki"). Targets are data-tour attributes in
// src/pages/desktop/WikiListPage.tsx, src/pages/desktop/WikiPage.tsx and
// src/components/wiki/**. Creating and shaping a Wiki is Engineer and Admin
// only (isEngineerOrAdmin in WikiListPage and WikiPage).

export const WIKI_TOURS: Tour[] = [
  {
    id: "wiki-home",
    area: "wiki",
    title: "Find a Wiki",
    icon: "BookOpenText",
    summary: "Search and browse the short overviews of a job, a machine or an Area.",
    what:
      "The Wiki home lists every Wiki in the plant. You search by topic, Asset or document code, browse by Area or Asset, and new people get a Start here path to read in order.",
    why:
      "The answer to \"how does this work here?\" is often spread over several Documents. New people do not know where to start, and experienced people lose time looking. A Wiki brings the Published Knowledge on one topic together on one page.",
    helps: [
      "You find the overview of your machine or Area in seconds.",
      "New colleagues get a clear reading order on day one.",
      "You see which Wikis changed this week, and why.",
      "You never read an old copy: a Wiki is rebuilt when its Documents change.",
    ],
    capabilities: [
      {
        title: "Search",
        body: "Search on title, purpose, headings, Asset and document code. The best match comes first.",
      },
      {
        title: "Browse by Area or Asset",
        body: "Pick an Area or an Asset to see only the Wikis about it. Your own Area is marked.",
      },
      {
        title: "Start here",
        body: "A short path of Wikis for new people, in the order an Engineer set.",
      },
      {
        title: "What changed this week",
        body: "Wikis that were rebuilt because a Document got a new Published version, with what changed.",
      },
      {
        title: "Create a Wiki",
        body: "An Engineer describes the Wiki in plain words, adjusts the Draft and confirms. The AI builds it from Published Documents only.",
      },
    ],
    audience: ["operator", "engineer", "admin"],
    minutes: 2,
    steps: [
      {
        id: "nav",
        route: "/wiki",
        target: "nav-wiki",
        placement: "right",
        title: "Wiki in the menu",
        body: "All Wikis live under Wiki in the left menu. You can come back here from any page.",
      },
      {
        id: "search",
        target: "wiki-search",
        placement: "bottom",
        title: "Search a topic",
        body: "Type a topic, an Asset or a document code. The Wikis that match best show first.",
      },
      {
        id: "browse",
        target: "wiki-browse",
        placement: "bottom",
        title: "Browse by Area or Asset",
        body: "Pick an Area or an Asset to see only the Wikis about it. Pick it again, or Clear, to see all.",
      },
      {
        id: "start-here",
        target: "wiki-start-here",
        placement: "bottom",
        title: "Start here",
        body: "New on the floor? Read these Wikis in this order. An Engineer decides which ones belong here.",
      },
      {
        id: "all",
        target: "wiki-all",
        placement: "top",
        title: "Every other Wiki",
        body: "All other Wikis, sorted by Most used. You can also sort by Recently updated or A to Z. Click a card to open it.",
      },
      {
        id: "create",
        target: "wiki-create",
        placement: "bottom",
        audience: ["engineer", "admin"],
        title: "Create a Wiki",
        body: "Say in your own words what the Wiki is for and who reads it. The AI asks a few questions and shows a Draft you adjust and confirm.",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Open a Wiki about your own machine or Area. Then take the tour Read a Wiki to see what a Wiki page can do.",
      },
    ],
  },
  {
    id: "wiki-read",
    area: "wiki",
    title: "Read a Wiki",
    icon: "BookOpen",
    summary: "Read an overview, fold sections, check the sources and Ask about it.",
    what:
      "A Wiki is a short, AI-built overview of the Published Knowledge on one topic. It starts with an introduction and Key points, then sections you fold open and closed. Every fact links to the Published passage it comes from.",
    why:
      "A long SOP is hard to read at the machine, and a colleague's memory is not always right. A Wiki gives you the short version and still shows which Published Document says so, so you can trust it.",
    helps: [
      "You get the main points of a topic in a few minutes.",
      "You see the exact Published passage behind every fact.",
      "You are warned when two Documents disagree, with both values shown.",
      "You can Ask a question about the Wiki and get an answer with sources.",
    ],
    capabilities: [
      {
        title: "Introduction and Key points",
        body: "A few lines on what the topic is, and at most five Key points that jump to the detail.",
      },
      {
        title: "Folding sections",
        body: "Open only the section you need. Safety sections are marked and keep their warning visible when folded.",
      },
      {
        title: "Sources you can check",
        body: "Hover a marker to read the passage, or open the Document behind it. The side shows which Documents the Wiki is built from, whether they are on their latest version, and any open Findings or overdue reviews.",
      },
      {
        title: "Both values when Documents disagree",
        body: "When a fact rests on Documents that contradict each other, the Wiki says so and shows what the other Document says.",
      },
      {
        title: "Ask, print and share",
        body: "Ask a question about this Wiki, print it whole or as a one-pager, or share a link and a QR code for the phone.",
      },
    ],
    audience: ["operator", "engineer", "admin"],
    minutes: 3,
    steps: [
      {
        id: "meta",
        route: "{firstWiki}",
        target: "wiki-meta",
        placement: "bottom",
        title: "At a glance",
        body: "How long it takes to read, how many Published Documents it is built from, and when it was last built.",
      },
      {
        id: "intro",
        target: "wiki-intro",
        placement: "bottom",
        title: "Introduction",
        body: "Start here. A few lines on what this topic is about and what the Wiki covers.",
      },
      {
        id: "key-points",
        target: "wiki-key-points",
        placement: "bottom",
        title: "Key points",
        body: "The few things to remember. Each one jumps to the section with the detail.",
      },
      {
        id: "section",
        target: "wiki-section",
        placement: "top",
        title: "Fold a section",
        body: "Click a heading to fold it open or closed. The small numbers after a sentence are its sources: hover one to read the Published passage.",
      },
      {
        id: "contents",
        target: "wiki-contents",
        placement: "right",
        title: "On this page",
        body: "Jump to a section, or open and close all sections at once.",
      },
      {
        id: "sources",
        target: "wiki-sources",
        placement: "left",
        title: "Built from",
        body: "The Published Documents behind this Wiki and their version. Click to see the list. If one changed, you see it here and the Wiki is rebuilt.",
      },
      {
        id: "ask",
        target: "wiki-ask",
        placement: "left",
        title: "Ask about this Wiki",
        body: "Ask a question in your own words. The answer comes only from the Documents this Wiki is built from, with sources.",
      },
      {
        id: "footer",
        target: "wiki-footer",
        placement: "top",
        title: "Not a controlled document",
        body: "A Wiki is a reading aid. For the controlled text, open the Document behind a fact. When two Documents disagree, the Wiki shows both values and a warning at the top.",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Use Share to put a QR code for this Wiki at the machine, or Print for a one-pager with the Key points and safety.",
      },
    ],
  },
  {
    id: "wiki-shape",
    area: "wiki",
    title: "Shape a Wiki",
    icon: "PencilRuler",
    summary: "Change the Outline, add blocks from sources and apply your changes.",
    what:
      "Engineers shape a Wiki: add, rename and order sections, add a block between two others, have the AI write a block from chosen sources, or write it yourself. Your edits stay Unapplied changes until you apply them.",
    why:
      "A generated overview is a good start, but you know what Operators need to read first. Your Outline survives every rebuild, and every claim still has to match Published Knowledge.",
    helps: [
      "You decide the order and headings readers see.",
      "You add exactly the block that is missing, from the sources you choose.",
      "You write in your own words, and the check tells you claim by claim if Published Knowledge supports it.",
      "Readers keep seeing the live Wiki until you apply, and you can restore an earlier build.",
    ],
    capabilities: [
      {
        title: "Outline",
        body: "Add, rename, move and remove sections. Mark a section as safety, and choose if it is open or closed for readers.",
      },
      {
        title: "Generate from sources",
        body: "Add Key points, steps, a table or a callout. The AI writes it from Published passages, and every point cites one.",
      },
      {
        title: "Find sources",
        body: "Search Published Documents by words or by title and code, and choose the passages a block should use.",
      },
      {
        title: "Write by hand and Check against Published",
        body: "Write a block yourself, then check it. Each claim comes out Supported, Differs, Not covered, Partly supported or Already disputed. A claim that differs becomes a Proposed revision, never Wiki text.",
      },
      {
        title: "Apply, confirm and restore",
        body: "Apply your Unapplied changes in one go. A claim only the AI judge supports needs a second Engineer to confirm. Restore a previous build any time.",
      },
    ],
    audience: ["engineer", "admin"],
    minutes: 4,
    steps: [
      {
        id: "menu",
        route: "{firstWiki}",
        target: "wiki-more-actions",
        placement: "bottom",
        title: "Wiki actions",
        body: "Edit the Scope, rebuild now, add the Wiki to Start here, or make a Training from its sources.",
      },
      {
        id: "edit",
        target: "wiki-edit-button",
        placement: "bottom",
        title: "Start editing",
        body: "Press Edit this Wiki now, then press Next. Nothing changes for readers yet.",
        opens: "wiki-edit-bar",
      },
      {
        id: "edit-bar",
        target: "wiki-edit-bar",
        placement: "bottom",
        title: "The edit bar",
        body: "It counts your Unapplied changes, shows who else is editing, and how much AI work is left.",
      },
      {
        id: "outline",
        target: "wiki-outline",
        placement: "bottom",
        title: "Outline",
        body: "Every section in the order readers will see it. Use + Section to add one, and the buttons on a row to edit, move or remove it. In a section's edit you can mark it as safety.",
      },
      {
        id: "add-block",
        target: "wiki-add-block",
        placement: "right",
        title: "Add a block",
        body: "Choose Generate from sources, Key points, Steps, Table or Callout and the AI writes it from Published passages. Or choose Write by hand, then Check against Published.",
      },
      {
        id: "apply",
        target: "wiki-apply",
        placement: "bottom",
        title: "Review and apply",
        body: "See every change before it goes live, then apply. A written claim that only the AI judge supports waits for a second Engineer to confirm.",
      },
      {
        id: "more",
        target: "wiki-edit-more",
        placement: "left",
        title: "Restore and settings",
        body: "Restore a previous build if a change went wrong. In Wiki settings you set the reading level, the length, and if a second Engineer must confirm written text.",
      },
      {
        id: "next",
        title: "What to do next",
        body: "Add one block your Operators miss today and check it against Published. Press Done when you finish; your changes stay safe until you apply.",
      },
    ],
  },
]
