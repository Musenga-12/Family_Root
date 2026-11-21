import { describe, expect, it } from "vitest";
import { dataUrlToBlob } from "../lib/serverArchive";

describe("Photos chosen on this device are uploaded as files", () => {
  it("turns a base64 data: URL into the same bytes and type (no fetch, which the CSP keeps to the API)", async () => {
    const blob = dataUrlToBlob("data:image/png;base64,iVBORw0KGgo=");
    expect(blob.type).toBe("image/png");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("handles a plain (not base64) data: URL", async () => {
    const blob = dataUrlToBlob("data:text/plain,hello%20there");
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("hello there");
  });
});
