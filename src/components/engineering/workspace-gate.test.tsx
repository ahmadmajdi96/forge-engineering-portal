import {act,fireEvent,render,screen} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {EngineeringProvider,useEngineering} from "@/lib/engineering/context";
import {makeModel} from "@/lib/engineering/model";
import {EngineeringWorkspaceGate} from "./workspace-gate";

const mocks = vi.hoisted(()=>({read:vi.fn(),path:"/"}));
vi.mock("@/lib/production/workspace.functions",()=>({loadFactoryWorkspace:mocks.read,saveFactoryWorkspace:vi.fn()}));
vi.mock("@/lib/engineering/workspace.functions",()=>({loadWorkspace:vi.fn(),saveWorkspace:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock("@tanstack/react-router",()=>({useRouterState:()=>mocks.path}));

function Contents() {
  const {workspaceModel}=useEngineering();
  return <button>{workspaceModel.name}</button>;
}
function mount(fixture=false) {
  return render(<EngineeringProvider native fixture={fixture} site="north">
    <EngineeringWorkspaceGate><Contents/></EngineeringWorkspaceGate>
  </EngineeringProvider>);
}

describe("native engineering workspace gate",()=>{
  beforeEach(()=>{mocks.path="/";mocks.read.mockReset();});
  it("awaits authorized data before enabling editors",async()=>{
    let release!: (value:unknown)=>void;
    mocks.read.mockReturnValue(new Promise(resolve=>{release=resolve;}));
    mount(true);
    expect(screen.queryByRole("button")).toBeNull();
    await act(async()=>release({revision:7,payload:{model:{...makeModel(),name:"Saved revision seven"}}}));
    expect(screen.getByRole("button",{name:"Saved revision seven"})).toBeVisible();
  });
  it("keeps failed loads closed and permits a retry",async()=>{
    mocks.read.mockRejectedValueOnce(new Error("Denied")).mockResolvedValueOnce({revision:0,payload:null});
    mount();
    fireEvent.click(await screen.findByRole("button",{name:"Retry workspace"}));
    expect(await screen.findByRole("button",{name:"Factory engineering"})).toBeVisible();
  });
  it("keeps independent factory tools reachable on engineering access failure",async()=>{
    mocks.path="/factory-layout";
    mocks.read.mockRejectedValueOnce(new Error("Denied"));
    mount();
    await act(async()=>{});
    expect(screen.getByRole("button",{name:"Factory engineering"})).toBeVisible();
    expect(screen.queryByText("Engineering workspace unavailable")).toBeNull();
  });
});
