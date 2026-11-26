import { describe, expect, it } from "vitest";
import { scopeChangeSearch } from "./scope-search";

describe("Destination bookmarks survive unrelated engineering selector repairs", () => {
  it("keeps the explicit calibration reports tab and registry filters after a stale line is normalized", () => {
    const search = {
      site: "training-south",
      engLine: "PACK-A",
      view: "reports",
      report: "calibration",
      q: "scale",
      registryLine: "LOCAL",
      kind: "machine",
      state: "active",
      sort: "name",
      direction: "desc",
      size: 25,
      page: 3,
    };
    expect(
      scopeChangeSearch(search, { engLine: "LOCAL", engStation: "ST-1" }, "/registry", "normalize"),
    ).toEqual({ ...search, engLine: "LOCAL", engStation: "ST-1" });
  });
  it("keeps an explicitly named assigned application and numeric revision during normalization", () => {
    expect(
      scopeChangeSearch(
        { engLine: "OLD", app: "APP-7", revision: 4, view: "preview" },
        { engLine: "NEW", engStation: "ST-2" },
        "/application-studio",
        "normalize",
      ),
    ).toMatchObject({ app: "APP-7", revision: 4, view: "preview" });
  });
  it("keeps a revision with an invalid value so Studio can reject it instead of opening mutable head", () => {
    expect(
      scopeChangeSearch(
        { engLine: "OLD", app: "APP-7", revision: "denied" },
        { engLine: "NEW" },
        "/application-studio",
        "normalize",
      )["revision"],
    ).toBe("denied");
  });
  it("keeps the exact terminal assignment entry without adding an unrelated app", () => {
    const result = scopeChangeSearch(
      { engLine: "OLD", source: "terminalId", entity: "TERM-8", terminal: "TERM-8" },
      { engLine: "NEW" },
      "/application-studio",
      "normalize",
    );
    expect(result).toMatchObject({ source: "terminalId", entity: "TERM-8", terminal: "TERM-8" });
    expect(result).not.toHaveProperty("app");
  });
  it("preserves conflicting terminal identities so the existing destination guard can reject them", () => {
    expect(
      scopeChangeSearch(
        { engLine: "OLD", source: "terminalId", entity: "TERM-8", terminal: "TERM-9" },
        { engLine: "NEW" },
        "/application-studio",
        "normalize",
      ),
    ).toMatchObject({ entity: "TERM-8", terminal: "TERM-9" });
  });
  it("keeps an explicit physical occurrence and its original context without substituting a normalized asset", () => {
    const result = scopeChangeSearch(
      {
        engLine: "OLD",
        engAsset: "old-engineering-selector",
        space: "SPACE-3",
        occurrence: "OCC-8",
        layoutId: "OCC-8",
        layoutType: "occurrence",
        line: "OLD",
        station: "ORIGINAL",
        asset: "PLACED-8",
        assetKind: "machine",
      },
      { engLine: "NEW", engStation: "ST-2" },
      "/factory-layout",
      "normalize",
    );
    expect(result).toMatchObject({
      space: "SPACE-3",
      occurrence: "OCC-8",
      layoutId: "OCC-8",
      layoutType: "occurrence",
      line: "OLD",
      station: "ORIGINAL",
      asset: "PLACED-8",
    });
    expect(result).not.toHaveProperty("engAsset");
  });
  it("keeps an explicit space when engineering scope is first initialized", () => {
    expect(
      scopeChangeSearch(
        { space: "SPACE-3" },
        { engLine: "NEW", engStation: "ST-2" },
        "/factory-layout",
      ),
    ).toEqual({ space: "SPACE-3", engLine: "NEW", engStation: "ST-2" });
  });
  it("leaves same-scope tab navigation unchanged including an exact signal and mapping", () => {
    const search = {
      engLine: "L-1",
      engStation: "ST-1",
      signal: "sig-key",
      mapping: "map-id",
      app: "APP-7",
      revision: "4",
    };
    expect(
      scopeChangeSearch(search, { engLine: "L-1", engStation: "ST-1" }, "/application-studio"),
    ).toEqual(search);
  });
});

describe("Intentional parent changes clear dependent identities but not independent destinations", () => {
  it("clears the previous station's engineering identities after a deliberate station selection", () => {
    const result = scopeChangeSearch(
      {
        engLine: "L-1",
        engStation: "ST-1",
        engAsset: "M-1",
        signal: "sig-1",
        mapping: "map-1",
        step: "STEP-1",
        stepId: "STEP-1",
        routeId: "R-1",
        setup: "guided",
        setupItem: "OCC-1",
        setupType: "occurrence",
        setupSite: "training-south",
        layoutId: "OCC-1",
        layoutType: "occurrence",
      },
      { engStation: "ST-2" },
      "/station-connectivity",
    );
    expect(result).toEqual({ engLine: "L-1", engStation: "ST-2" });
  });
  it("keeps site-level registry report and filters while resetting pagination on intentional selection", () => {
    expect(
      scopeChangeSearch(
        {
          engLine: "OLD",
          view: "reports",
          report: "calibration",
          q: "scale",
          registryLine: "FILTER-LINE",
          sort: "name",
          direction: "desc",
          kind: "machine",
          page: 5,
        },
        { engLine: "NEW" },
        "/registry",
      ),
    ).toEqual({
      engLine: "NEW",
      view: "reports",
      report: "calibration",
      q: "scale",
      registryLine: "FILTER-LINE",
      sort: "name",
      direction: "desc",
      kind: "machine",
      page: 1,
    });
  });
  it("invalidates station-bound Studio authoring on a deliberate parent selection", () => {
    expect(
      scopeChangeSearch(
        {
          engLine: "OLD",
          app: "APP-7",
          revision: 4,
          source: "stationId",
          entity: "ST-1",
          profile: "station",
          kind: "operator",
          view: "editor",
        },
        { engLine: "NEW" },
        "/application-studio",
      ),
    ).toEqual({ engLine: "NEW" });
  });
  it("keeps a standalone app revision on an unrelated intentional engineering selection", () => {
    expect(
      scopeChangeSearch(
        { engLine: "OLD", app: "APP-7", revision: "4" },
        { engLine: "NEW" },
        "/application-studio",
      ),
    ).toEqual({ engLine: "NEW", app: "APP-7", revision: "4" });
  });
  it("keeps an explicitly identified assignment terminal on an unrelated intentional engineering selection", () => {
    expect(
      scopeChangeSearch(
        { engStation: "OLD", source: "terminalId", entity: "TERM-8" },
        { engStation: "NEW" },
        "/application-studio",
      ),
    ).toEqual({ engStation: "NEW", source: "terminalId", entity: "TERM-8" });
  });
  it("clears a placement after an intentional engineering parent change without inserting a new placement", () => {
    expect(
      scopeChangeSearch(
        { engLine: "OLD", space: "SPACE-3", occurrence: "OCC-8", asset: "M-1", layoutId: "OCC-8" },
        { engLine: "NEW" },
        "/factory-layout",
      ),
    ).toEqual({ engLine: "NEW" });
  });
  it.each(["/registry", "/application-studio", "/factory-layout"])(
    "purges all foreign child identities on a factory switch to %s",
    (path) => {
      const result = scopeChangeSearch(
        {
          site: "north",
          engLine: "L-NORTH",
          engStation: "ST-NORTH",
          engAsset: "M-NORTH",
          registryLine: "L-NORTH",
          app: "APP-NORTH",
          revision: 4,
          source: "terminalId",
          entity: "TERM-NORTH",
          terminal: "TERM-NORTH",
          space: "SPACE-NORTH",
          occurrence: "OCC-NORTH",
          line: "L-NORTH",
          station: "ST-NORTH",
          asset: "M-NORTH",
          assetKind: "machine",
          layoutId: "OCC-NORTH",
          layoutType: "occurrence",
          signal: "sig-north",
          mapping: "map-north",
          setup: "guided",
          setupSite: "north",
          setupItem: "OCC-NORTH",
          setupType: "occurrence",
        },
        { site: "south" },
        path,
      );
      expect(result).toEqual({ site: "south" });
    },
  );
  it("preserves site-level report preferences across factories but clears a foreign line filter", () => {
    expect(
      scopeChangeSearch(
        {
          site: "north",
          view: "reports",
          report: "calibration",
          q: "scale",
          sort: "name",
          direction: "desc",
          registryLine: "L-NORTH",
          page: 5,
        },
        { site: "south" },
        "/registry",
      ),
    ).toEqual({
      site: "south",
      view: "reports",
      report: "calibration",
      q: "scale",
      sort: "name",
      direction: "desc",
      page: 1,
    });
  });
  it("does not mutate the previous URL state", () => {
    const search = Object.freeze({ engLine: "OLD", signal: "sig-1" });
    scopeChangeSearch(search, { engLine: "NEW" }, "/station-connectivity");
    expect(search).toEqual({ engLine: "OLD", signal: "sig-1" });
  });
});
