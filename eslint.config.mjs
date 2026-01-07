// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // 1. Global ignores (replaces .eslintignore)
  {
    ignores: ["dist", "lib/", "node_modules"] 
  },

  // 2. Base Javascript config (replaces "eslint:recommended")
  {
    files: ["**/*.js", "**/*.mjs", "**/*.ts"],
    extends: [js.configs.recommended],
  },

  // 3. TypeScript Configuration (replaces your "overrides" for *.ts)
  {
    files: ["**/*.ts"],
    extends: [
      ...tseslint.configs.recommended, 
      // ...tseslint.configs.recommendedTypeChecked // Optional: stricter rules
    ],
    languageOptions: {
      parserOptions: {
        project: ["tsconfig.json"],
        tsconfigRootDir: import.meta.dirname, // Helps find tsconfig relative to this file
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          "allowedNames": [
            "ignoredFunctionName",
            "ignoredMethodName"
          ]
        }
      ],
      "@typescript-eslint/no-shadow": "error"
    }
  },

  // 4. HTML Config (replaces your "overrides" for *.html)
  {
    files: ["**/*.html"],
    // Note: You usually need a plugin like 'eslint-plugin-html' here
    // for this to actually do anything useful.
    rules: {} 
  }
);