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
import type * as ai_askSkills from "../ai/askSkills.js";
import type * as ai_captures from "../ai/captures.js";
import type * as ai_consistency from "../ai/consistency.js";
import type * as ai_constants from "../ai/constants.js";
import type * as ai_embed from "../ai/embed.js";
import type * as ai_grounding from "../ai/grounding.js";
import type * as ai_guidedChat from "../ai/guidedChat.js";
import type * as ai_imageDescribe from "../ai/imageDescribe.js";
import type * as ai_imageEmbed from "../ai/imageEmbed.js";
import type * as ai_imageGen from "../ai/imageGen.js";
import type * as ai_insights from "../ai/insights.js";
import type * as ai_llm from "../ai/llm.js";
import type * as ai_plantPropose from "../ai/plantPropose.js";
import type * as ai_revision from "../ai/revision.js";
import type * as ai_training from "../ai/training.js";
import type * as ai_trainingBuilder from "../ai/trainingBuilder.js";
import type * as ai_wiki from "../ai/wiki.js";
import type * as assets from "../assets.js";
import type * as assignments from "../assignments.js";
import type * as attempts from "../attempts.js";
import type * as auth from "../auth.js";
import type * as captures_access from "../captures/access.js";
import type * as captures_captures from "../captures/captures.js";
import type * as captures_drafts from "../captures/drafts.js";
import type * as captures_sets from "../captures/sets.js";
import type * as coverSettings from "../coverSettings.js";
import type * as coverageQuestions from "../coverageQuestions.js";
import type * as crons from "../crons.js";
import type * as devChecks from "../devChecks.js";
import type * as documents from "../documents.js";
import type * as files from "../files.js";
import type * as findings from "../findings.js";
import type * as floor from "../floor.js";
import type * as home from "../home.js";
import type * as http from "../http.js";
import type * as imageSearch from "../imageSearch.js";
import type * as images from "../images.js";
import type * as importer_jobs from "../importer/jobs.js";
import type * as importer_map from "../importer/map.js";
import type * as importer_templates from "../importer/templates.js";
import type * as insights from "../insights.js";
import type * as iso from "../iso.js";
import type * as lab_embeddings from "../lab/embeddings.js";
import type * as lib_assetWalker from "../lib/assetWalker.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_chunking from "../lib/chunking.js";
import type * as lib_imageWalker from "../lib/imageWalker.js";
import type * as lib_onPublish from "../lib/onPublish.js";
import type * as lib_pdfStamp from "../lib/pdfStamp.js";
import type * as lib_published from "../lib/published.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_scope from "../lib/scope.js";
import type * as logs from "../logs.js";
import type * as manuals from "../manuals.js";
import type * as mcp_data from "../mcp/data.js";
import type * as mcp_embedding from "../mcp/embedding.js";
import type * as mcp_info from "../mcp/info.js";
import type * as mcp_keys from "../mcp/keys.js";
import type * as mcp_render from "../mcp/render.js";
import type * as mcp_server from "../mcp/server.js";
import type * as mcp_tools from "../mcp/tools.js";
import type * as mcp_validate from "../mcp/validate.js";
import type * as naming from "../naming.js";
import type * as namingTypes from "../namingTypes.js";
import type * as orgSettings from "../orgSettings.js";
import type * as people from "../people.js";
import type * as people_levels from "../people/levels.js";
import type * as people_shifts from "../people/shifts.js";
import type * as plant_context from "../plant/context.js";
import type * as plant_plant from "../plant/plant.js";
import type * as ppe from "../ppe.js";
import type * as ppeImages from "../ppeImages.js";
import type * as qa from "../qa.js";
import type * as revisions from "../revisions.js";
import type * as seedKnowledge from "../seedKnowledge.js";
import type * as seedTemplates from "../seedTemplates.js";
import type * as seed_builders from "../seed/builders.js";
import type * as seed_captures from "../seed/captures.js";
import type * as seed_companyLogo from "../seed/companyLogo.js";
import type * as seed_companyLogoPng from "../seed/companyLogoPng.js";
import type * as seed_content from "../seed/content.js";
import type * as seed_coverageQuestions from "../seed/coverageQuestions.js";
import type * as seed_docs_ext_hse_lmra_0001 from "../seed/docs/ext_hse_lmra_0001.js";
import type * as seed_docs_ext_hse_sop_0001 from "../seed/docs/ext_hse_sop_0001.js";
import type * as seed_docs_ext_hse_sop_0002 from "../seed/docs/ext_hse_sop_0002.js";
import type * as seed_docs_ext_mnt_sop_0001 from "../seed/docs/ext_mnt_sop_0001.js";
import type * as seed_docs_ext_ops_sop_0001 from "../seed/docs/ext_ops_sop_0001.js";
import type * as seed_docs_ext_ops_sop_0002 from "../seed/docs/ext_ops_sop_0002.js";
import type * as seed_docs_ext_ops_sop_0003 from "../seed/docs/ext_ops_sop_0003.js";
import type * as seed_docs_ext_ops_wi_0001 from "../seed/docs/ext_ops_wi_0001.js";
import type * as seed_docs_ext_ops_wi_0002 from "../seed/docs/ext_ops_wi_0002.js";
import type * as seed_docs_ext_ops_wi_0003 from "../seed/docs/ext_ops_wi_0003.js";
import type * as seed_docs_index from "../seed/docs/index.js";
import type * as seed_docs_mix_hse_lmra_0001 from "../seed/docs/mix_hse_lmra_0001.js";
import type * as seed_docs_mix_ops_sop_0001 from "../seed/docs/mix_ops_sop_0001.js";
import type * as seed_docs_mix_ops_sop_0002 from "../seed/docs/mix_ops_sop_0002.js";
import type * as seed_docs_mix_ops_wi_0001 from "../seed/docs/mix_ops_wi_0001.js";
import type * as seed_docs_qcl_qa_sop_0001 from "../seed/docs/qcl_qa_sop_0001.js";
import type * as seed_docs_qcl_qa_wi_0001 from "../seed/docs/qcl_qa_wi_0001.js";
import type * as seed_imagesMeta from "../seed/imagesMeta.js";
import type * as seed_insights from "../seed/insights.js";
import type * as seed_manuals_ext_mnt_man_0001 from "../seed/manuals/ext_mnt_man_0001.js";
import type * as seed_manuals_ext_mnt_man_0002 from "../seed/manuals/ext_mnt_man_0002.js";
import type * as seed_manuals_index from "../seed/manuals/index.js";
import type * as seed_manuals_mix_mnt_man_0001 from "../seed/manuals/mix_mnt_man_0001.js";
import type * as seed_manuals_qcl_qa_man_0001 from "../seed/manuals/qcl_qa_man_0001.js";
import type * as seed_media from "../seed/media.js";
import type * as seed_peopleSettings from "../seed/peopleSettings.js";
import type * as seed_plant from "../seed/plant.js";
import type * as seed_skills from "../seed/skills.js";
import type * as seed_supplierPdfs from "../seed/supplierPdfs.js";
import type * as seed_trainings from "../seed/trainings.js";
import type * as settings_connections from "../settings/connections.js";
import type * as settings_limits from "../settings/limits.js";
import type * as settings_retention from "../settings/retention.js";
import type * as settings_schedules from "../settings/schedules.js";
import type * as skills from "../skills.js";
import type * as templates from "../templates.js";
import type * as trainingBuilder from "../trainingBuilder.js";
import type * as trainingSelfTest from "../trainingSelfTest.js";
import type * as trainings from "../trainings.js";
import type * as tryOuts from "../tryOuts.js";
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
  "ai/askSkills": typeof ai_askSkills;
  "ai/captures": typeof ai_captures;
  "ai/consistency": typeof ai_consistency;
  "ai/constants": typeof ai_constants;
  "ai/embed": typeof ai_embed;
  "ai/grounding": typeof ai_grounding;
  "ai/guidedChat": typeof ai_guidedChat;
  "ai/imageDescribe": typeof ai_imageDescribe;
  "ai/imageEmbed": typeof ai_imageEmbed;
  "ai/imageGen": typeof ai_imageGen;
  "ai/insights": typeof ai_insights;
  "ai/llm": typeof ai_llm;
  "ai/plantPropose": typeof ai_plantPropose;
  "ai/revision": typeof ai_revision;
  "ai/training": typeof ai_training;
  "ai/trainingBuilder": typeof ai_trainingBuilder;
  "ai/wiki": typeof ai_wiki;
  assets: typeof assets;
  assignments: typeof assignments;
  attempts: typeof attempts;
  auth: typeof auth;
  "captures/access": typeof captures_access;
  "captures/captures": typeof captures_captures;
  "captures/drafts": typeof captures_drafts;
  "captures/sets": typeof captures_sets;
  coverSettings: typeof coverSettings;
  coverageQuestions: typeof coverageQuestions;
  crons: typeof crons;
  devChecks: typeof devChecks;
  documents: typeof documents;
  files: typeof files;
  findings: typeof findings;
  floor: typeof floor;
  home: typeof home;
  http: typeof http;
  imageSearch: typeof imageSearch;
  images: typeof images;
  "importer/jobs": typeof importer_jobs;
  "importer/map": typeof importer_map;
  "importer/templates": typeof importer_templates;
  insights: typeof insights;
  iso: typeof iso;
  "lab/embeddings": typeof lab_embeddings;
  "lib/assetWalker": typeof lib_assetWalker;
  "lib/auth": typeof lib_auth;
  "lib/chunking": typeof lib_chunking;
  "lib/imageWalker": typeof lib_imageWalker;
  "lib/onPublish": typeof lib_onPublish;
  "lib/pdfStamp": typeof lib_pdfStamp;
  "lib/published": typeof lib_published;
  "lib/roles": typeof lib_roles;
  "lib/scope": typeof lib_scope;
  logs: typeof logs;
  manuals: typeof manuals;
  "mcp/data": typeof mcp_data;
  "mcp/embedding": typeof mcp_embedding;
  "mcp/info": typeof mcp_info;
  "mcp/keys": typeof mcp_keys;
  "mcp/render": typeof mcp_render;
  "mcp/server": typeof mcp_server;
  "mcp/tools": typeof mcp_tools;
  "mcp/validate": typeof mcp_validate;
  naming: typeof naming;
  namingTypes: typeof namingTypes;
  orgSettings: typeof orgSettings;
  people: typeof people;
  "people/levels": typeof people_levels;
  "people/shifts": typeof people_shifts;
  "plant/context": typeof plant_context;
  "plant/plant": typeof plant_plant;
  ppe: typeof ppe;
  ppeImages: typeof ppeImages;
  qa: typeof qa;
  revisions: typeof revisions;
  seedKnowledge: typeof seedKnowledge;
  seedTemplates: typeof seedTemplates;
  "seed/builders": typeof seed_builders;
  "seed/captures": typeof seed_captures;
  "seed/companyLogo": typeof seed_companyLogo;
  "seed/companyLogoPng": typeof seed_companyLogoPng;
  "seed/content": typeof seed_content;
  "seed/coverageQuestions": typeof seed_coverageQuestions;
  "seed/docs/ext_hse_lmra_0001": typeof seed_docs_ext_hse_lmra_0001;
  "seed/docs/ext_hse_sop_0001": typeof seed_docs_ext_hse_sop_0001;
  "seed/docs/ext_hse_sop_0002": typeof seed_docs_ext_hse_sop_0002;
  "seed/docs/ext_mnt_sop_0001": typeof seed_docs_ext_mnt_sop_0001;
  "seed/docs/ext_ops_sop_0001": typeof seed_docs_ext_ops_sop_0001;
  "seed/docs/ext_ops_sop_0002": typeof seed_docs_ext_ops_sop_0002;
  "seed/docs/ext_ops_sop_0003": typeof seed_docs_ext_ops_sop_0003;
  "seed/docs/ext_ops_wi_0001": typeof seed_docs_ext_ops_wi_0001;
  "seed/docs/ext_ops_wi_0002": typeof seed_docs_ext_ops_wi_0002;
  "seed/docs/ext_ops_wi_0003": typeof seed_docs_ext_ops_wi_0003;
  "seed/docs/index": typeof seed_docs_index;
  "seed/docs/mix_hse_lmra_0001": typeof seed_docs_mix_hse_lmra_0001;
  "seed/docs/mix_ops_sop_0001": typeof seed_docs_mix_ops_sop_0001;
  "seed/docs/mix_ops_sop_0002": typeof seed_docs_mix_ops_sop_0002;
  "seed/docs/mix_ops_wi_0001": typeof seed_docs_mix_ops_wi_0001;
  "seed/docs/qcl_qa_sop_0001": typeof seed_docs_qcl_qa_sop_0001;
  "seed/docs/qcl_qa_wi_0001": typeof seed_docs_qcl_qa_wi_0001;
  "seed/imagesMeta": typeof seed_imagesMeta;
  "seed/insights": typeof seed_insights;
  "seed/manuals/ext_mnt_man_0001": typeof seed_manuals_ext_mnt_man_0001;
  "seed/manuals/ext_mnt_man_0002": typeof seed_manuals_ext_mnt_man_0002;
  "seed/manuals/index": typeof seed_manuals_index;
  "seed/manuals/mix_mnt_man_0001": typeof seed_manuals_mix_mnt_man_0001;
  "seed/manuals/qcl_qa_man_0001": typeof seed_manuals_qcl_qa_man_0001;
  "seed/media": typeof seed_media;
  "seed/peopleSettings": typeof seed_peopleSettings;
  "seed/plant": typeof seed_plant;
  "seed/skills": typeof seed_skills;
  "seed/supplierPdfs": typeof seed_supplierPdfs;
  "seed/trainings": typeof seed_trainings;
  "settings/connections": typeof settings_connections;
  "settings/limits": typeof settings_limits;
  "settings/retention": typeof settings_retention;
  "settings/schedules": typeof settings_schedules;
  skills: typeof skills;
  templates: typeof templates;
  trainingBuilder: typeof trainingBuilder;
  trainingSelfTest: typeof trainingSelfTest;
  trainings: typeof trainings;
  tryOuts: typeof tryOuts;
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
