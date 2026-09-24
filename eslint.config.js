import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * Flat config.
 *
 * Beyond the usual recommended sets, the rules here encode the parts of this
 * repo's safety posture that a linter can actually hold onto: no remote code, no
 * logging of anything read from a page, and `fetch` in exactly one file.
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "replica/**", "public/**", "*.zip"],
  },

  ...tseslint.configs.recommended,

  {
    rules: {
      // MV3 forbids remote code and so does this repo.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",

      // Never log a value. `warn` and `error` survive for genuine failures that
      // carry no user data; `console.log` does not survive at all.
      "no-console": ["error", { allow: ["warn", "error"] }],

      // The service worker is the only context that touches the network, and
      // inside it `src/sw/api.ts` is the only file that touches `fetch`.
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: "Network calls live in src/sw/api.ts. Go through apiFetch.",
        },
      ],

      "@typescript-eslint/no-explicit-any": "error",
      // Stub signatures are the contract for the tasks that fill them in, so an
      // unused parameter is expected. Unused variables are still errors.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
    },
  },

  {
    files: ["src/sw/api.ts"],
    rules: {
      // The one exception, and the reason the rule above is worth having.
      "no-restricted-globals": "off",
    },
  },

  {
    files: ["src/sidepanel/**/*.{ts,tsx}"],
    // `configs.recommended` is still the eslintrc shape in v7; `flat` is the one
    // with a plugin object rather than a plugin name.
    ...reactHooks.configs.flat.recommended,
  },
);
