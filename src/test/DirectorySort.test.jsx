import { describe, expect, it } from "vitest";
import { DIRECTORY_SORTS as SORTS } from "../lib/peopleSort";

// On a family server a relative's birth date may be unknown (born: null); the demo family always has one.
const people = [
  { id: "ann", first: "Ann", last: "Ross", gen: 2, born: "1960-04-02" },
  { id: "new", first: "Neil", last: "Ross", gen: 2, born: null },
  { id: "old", first: "Olive", last: "Ross", gen: 1, born: "1931-01-09" },
  { id: "kid", first: "Kim", last: "Ross", gen: 3, born: "1999-12-30" },
];
const order = (sort) => [...people].sort(SORTS[sort]).map((p) => p.id);

describe("Family Directory sorting", () => {
  it("never fails on a relative without a birth date, whichever sort is chosen", () => {
    for (const sort of Object.keys(SORTS)) expect(() => order(sort)).not.toThrow();
  });

  it("puts relatives without a known birth date last, oldest or youngest first", () => {
    expect(order("oldestPerson")).toEqual(["old", "ann", "kid", "new"]);
    expect(order("youngestPerson")).toEqual(["kid", "ann", "old", "new"]);
  });

  it("sorts by generation, then birth date, unknown dates last within a generation", () => {
    expect(order("generation")).toEqual(["old", "ann", "new", "kid"]);
  });
});
