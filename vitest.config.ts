import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/components/**/*.test.tsx"] } });
