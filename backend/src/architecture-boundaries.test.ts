import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceDirectory = fileURLToPath(new URL(".", import.meta.url));

describe("Clean Architecture dependency boundaries", () => {
  it("keeps domain and application independent from delivery and infrastructure", async () => {
    const files = await sourceFilesIn(["domain", "application"]);
    const forbiddenImports = [
      "/api/",
      "/infrastructure/",
      "/worker/",
      'from "fastify"',
      'from "drizzle-orm',
      'from "bullmq"',
      'from "ioredis"',
      'from "pg"',
      "@inbot/shared",
    ];

    const violations = await collectImportViolations(files, forbiddenImports);
    expect(violations).toEqual([]);
  });

  it("keeps HTTP route handlers independent from infrastructure adapters", async () => {
    const files = (await sourceFilesIn(["api"])).filter(
      (file) => !file.endsWith("/dependencies.ts"),
    );
    const violations = await collectImportViolations(files, [
      "/infrastructure/",
    ]);

    expect(violations).toEqual([]);
  });

  it("keeps route registration free from HTTP translation and application logic", async () => {
    const files = await sourceFilesIn(["api/routes"]);
    const violations = await collectImportViolations(files, [
      "/application/",
      "/domain/",
      "/http/",
      "@inbot/shared",
      "../dependencies",
    ]);

    expect(violations).toEqual([]);
  });

  it("keeps HTTP controllers independent from infrastructure adapters", async () => {
    const files = await sourceFilesIn(["api/controllers"]);
    const violations = await collectImportViolations(files, [
      "/infrastructure/",
    ]);

    expect(violations).toEqual([]);
  });
});

async function sourceFilesIn(paths: string[]): Promise<string[]> {
  const files = await Promise.all(
    paths.map(async (path) => {
      const directory = join(sourceDirectory, path);
      const entries = await readdir(directory, { recursive: true });
      return entries
        .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
        .map((entry) => join(directory, entry));
    }),
  );

  return files.flat();
}

async function collectImportViolations(
  files: string[],
  forbiddenImports: string[],
): Promise<string[]> {
  const results = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(file, "utf8");
      const violation = forbiddenImports.find((entry) =>
        content.includes(entry),
      );
      return violation === undefined ? undefined : `${file}: ${violation}`;
    }),
  );

  return results.filter((result): result is string => result !== undefined);
}
