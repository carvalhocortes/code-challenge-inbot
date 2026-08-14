import { describe, expect, it } from "vitest";

import { classifyProcessingFailure } from "./processing-failure.js";

describe("classifyProcessingFailure", () => {
  it("classifies a provider timeout as transient", () => {
    expect(classifyProcessingFailure({ kind: "timeout" })).toBe("transient");
  });

  it("classifies a provider connection failure as transient", () => {
    expect(classifyProcessingFailure({ kind: "connection" })).toBe("transient");
  });

  it("classifies HTTP 429 as transient", () => {
    expect(classifyProcessingFailure({ kind: "http", status: 429 })).toBe(
      "transient",
    );
  });

  it("classifies HTTP 5xx as transient", () => {
    expect(classifyProcessingFailure({ kind: "http", status: 503 })).toBe(
      "transient",
    );
  });

  it("classifies non-rate-limited HTTP 4xx as definitive", () => {
    expect(classifyProcessingFailure({ kind: "http", status: 400 })).toBe(
      "definitive",
    );
  });
});
