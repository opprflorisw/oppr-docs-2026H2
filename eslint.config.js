import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

// House rules for UI code (plan "Design rules"). no-restricted-syntax does not
// merge across config blocks, so each block lists the full set it needs.
const NO_LOCALE_DATES = {
  selector: "CallExpression[callee.property.name='toLocaleDateString']",
  message: "Use formatDate or formatDateTime from src/lib/time.ts ('24 Oct 2026').",
}
const EM_DASH_MESSAGE =
  "No em dashes in UI copy. Use a period, a colon or ' · ' instead."
const NO_EM_DASH = [
  { selector: "Literal[value=/—/]", message: EM_DASH_MESSAGE },
  { selector: "TemplateElement[value.raw=/—/]", message: EM_DASH_MESSAGE },
  { selector: "JSXText[value=/—/]", message: EM_DASH_MESSAGE },
]
const TINY_TEXT_MESSAGE =
  "Floor text is at least 13px: use text-floor-meta, text-floor-secondary or text-floor-body."
const NO_TINY_TEXT = [
  { selector: "Literal[value=/text-\\[(8|9|10|11)px\\]/]", message: TINY_TEXT_MESSAGE },
  { selector: "TemplateElement[value.raw=/text-\\[(8|9|10|11)px\\]/]", message: TINY_TEXT_MESSAGE },
]

// Files of the shell and design system lane: these must be clean.
const STRICT_FILES = [
  "src/App.tsx",
  "src/components/ui/**/*.tsx",
  "src/components/layout/PageHeader.tsx",
  "src/components/layout/DesktopShell.tsx",
  "src/components/layout/UserMenu.tsx",
  "src/components/layout/CommandSearch.tsx",
  "src/components/layout/NarrowViewportGuard.tsx",
  "src/hooks/useDocumentTitle.ts",
  "src/lib/time.ts",
  "src/components/docs/StatusBadge.tsx",
  "src/components/docs/TypeBadge.tsx",
  "src/components/people/CheckInChip.tsx",
  "src/components/ai/FloatingAskIda.tsx",
  "src/pages/desktop/SettingsPage.tsx",
  "src/pages/desktop/McpPage.tsx",
  "src/pages/desktop/TemplatesPage.tsx",
  "src/pages/desktop/TemplateEditPage.tsx",
  "src/pages/desktop/ImageLibraryPage.tsx",
  "src/pages/desktop/NamingSettingsPage.tsx",
  "src/pages/desktop/ImportPage.tsx",
  "src/pages/desktop/AnalysisIndexPage.tsx",
]

export default tseslint.config(
  // Generated and build output are not ours to lint.
  { ignores: ["dist", "convex/_generated", "**/*.config.js"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // This is a strict-off TS showcase that intentionally uses `any` for
      // TipTap/Convex `bodyJson` payloads; keep these as signals, not failures.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "warn",
      "no-empty": "warn",
      "prefer-const": "warn",
    },
  },
  // UI code: one date format and no em dashes. Warnings for now, so lanes can
  // clean their own files; the analysis pages are frozen build notes.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/pages/desktop/analysis/**", "src/lib/time.ts"],
    rules: {
      "no-restricted-syntax": ["warn", NO_LOCALE_DATES, ...NO_EM_DASH],
    },
  },
  // The floor app: also no text under 13px.
  {
    files: ["src/components/mobile/**/*.{ts,tsx}", "src/pages/mobile/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["warn", NO_LOCALE_DATES, ...NO_EM_DASH, ...NO_TINY_TEXT],
    },
  },
  {
    files: STRICT_FILES,
    rules: {
      "no-restricted-syntax": ["error", NO_LOCALE_DATES, ...NO_EM_DASH],
    },
  },
)
