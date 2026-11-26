import {fireEvent, render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {RefTable, ScopeSelectors} from "./reference-ui";

const selectLine = vi.fn();
vi.mock("@/lib/engineering/context", () => ({
  useEngineering: () => ({
    lineId: "LN-1", selectLine,
    workspaceModel: {lines: [
      {id:"LN-1",name:"Filling",plant:"North"},
      {id:"LN-2",name:"Packaging",plant:"South"},
      {id:"LN-3",name:"Retired",plant:"North",archived:true},
    ]},
  }),
}));

describe("engineering navigation controls", () => {
  it("offers only active lines in the selected plant", () => {
    render(<ScopeSelectors/>);
    const lineSelect=screen.getByRole("combobox",{name:"Production line"});
    expect(within(lineSelect).getAllByRole("option")).toHaveLength(1);
    expect(lineSelect).toHaveValue("LN-1");
    fireEvent.change(screen.getByRole("combobox",{name:"Plant"}),{target:{value:"South"}});
    expect(selectLine).toHaveBeenCalledWith("LN-2");
  });

  it("exposes row selection to assistive technology and isolates row actions", () => {
    const select=vi.fn();
    render(<RefTable headers={["#","Signal","Actions"]} rows={[[1,"Pressure",<button>Edit</button>],[2,"Weight",null]]}
      selected={0} onSelect={select}/>);
    expect(screen.getByRole("button",{name:"Pressure",pressed:true})).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"Weight",pressed:false}));
    expect(select).toHaveBeenCalledExactlyOnceWith(1);
    fireEvent.click(screen.getByRole("button",{name:"Edit"}));
    expect(select).toHaveBeenCalledTimes(1);
  });
});
