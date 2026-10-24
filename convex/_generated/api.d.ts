/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as admin from "../admin.js";
import type * as ai_ask from "../ai/ask.js";
import type * as ai_consistency from "../ai/consistency.js";
import type * as ai_constants from "../ai/constants.js";
import type * as ai_embed from "../ai/embed.js";
import type * as ai_grounding from "../ai/grounding.js";
import type * as ai_llm from "../ai/llm.js";
import type * as ai_revision from "../ai/revision.js";
import type * as ai_wiki from "../ai/wiki.js";
import type * as assets from "../assets.js";
import type * as auth from "../auth.js";
import type * as coverSettings from "../coverSettings.js";
import type * as crons from "../crons.js";
import type * as devChecks from "../devChecks.js";
import type * as documents from "../documents.js";
import type * as files from "../files.js";
import type * as findings from "../findings.js";
import type * as home from "../home.js";
import type * as http from "../http.js";
import type * as images from "../images.js";
import type * as importer_jobs from "../importer/jobs.js";
import type * as importer_map from "../importer/map.js";
import type * as importer_templates from "../importer/templates.js";
import type * as lib_assetWalker from "../lib/assetWalker.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_chunking from "../lib/chunking.js";
import type * as lib_imageWalker from "../lib/imageWalker.js";
import type * as lib_onPublish from "../lib/onPublish.js";
import type * as lib_pdfStamp from "../lib/pdfStamp.js";
import type * as lib_published from "../lib/published.js";
import type * as lib_scope from "../lib/scope.js";
import type * as logs from "../logs.js";
import type * as manuals from "../manuals.js";
import type * as naming from "../naming.js";
import type * as namingTypes from "../namingTypes.js";
import type * as people from "../people.js";
import type * as ppe from "../ppe.js";
import type * as ppeImages from "../ppeImages.js";
import type * as qa from "../qa.js";
import type * as seedKnowledge from "../seedKnowledge.js";
import type * as seedTemplates from "../seedTemplates.js";
import type * as seed_insights from "../seed/insights.js";
import type * as seed_skills from "../seed/skills.js";
import type * as seed_trainings from "../seed/trainings.js";
import type * as skills from "../skills.js";
import type * as templates from "../templates.js";
import type * as trainings from "../trainings.js";
import type * as usage from "../usage.js";
import type * as users from "../users.js";
import type * as wikis from "../wikis.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  admin: typeof admin;
  "ai/ask": typeof ai_ask;
  "ai/consistency": typeof ai_consistency;
  "ai/constants": typeof ai_constants;
  "ai/embed": typeof ai_embed;
  "ai/grounding": typeof ai_grounding;
  "ai/llm": typeof ai_llm;
  "ai/revision": typeof ai_revision;
  "ai/wiki": typeof ai_wiki;
  assets: typeof assets;
  auth: typeof auth;
  coverSettings: typeof coverSettings;
  crons: typeof crons;
  devChecks: typeof devChecks;
  documents: typeof documents;
  files: typeof files;
  findings: typeof findings;
  home: typeof home;
  http: typeof http;
  images: typeof images;
  "importer/jobs": typeof importer_jobs;
  "importer/map": typeof importer_map;
  "importer/templates": typeof importer_templates;
  "lib/assetWalker": typeof lib_assetWalker;
  "lib/auth": typeof lib_auth;
  "lib/chunking": typeof lib_chunking;
  "lib/imageWalker": typeof lib_imageWalker;
  "lib/onPublish": typeof lib_onPublish;
  "lib/pdfStamp": typeof lib_pdfStamp;
  "lib/published": typeof lib_published;
  "lib/scope": typeof lib_scope;
  logs: typeof logs;
  manuals: typeof manuals;
  naming: typeof naming;
  namingTypes: typeof namingTypes;
  people: typeof people;
  ppe: typeof ppe;
  ppeImages: typeof ppeImages;
  qa: typeof qa;
  seedKnowledge: typeof seedKnowledge;
  seedTemplates: typeof seedTemplates;
  "seed/insights": typeof seed_insights;
  "seed/skills": typeof seed_skills;
  "seed/trainings": typeof seed_trainings;
  skills: typeof skills;
  templates: typeof templates;
  trainings: typeof trainings;
  usage: typeof usage;
  users: typeof users;
  wikis: typeof wikis;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
