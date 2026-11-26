import { createContext, useContext } from "react";
import type { SetupDocument, SetupScope } from "./setup-wizard-state";

export type WizardContext = {
  active: boolean;
  scope: SetupScope | undefined;
  site: string | undefined;
  actions: readonly string[];
  loading: boolean;
  error: string;
  layoutDirty: boolean;
  publish: (document: SetupDocument, dirty: boolean) => void;
  retry: () => void;
  registerFocus: (focus: () => void) => () => void;
  focusItem: () => void;
};
export const FactorySetupContext = createContext<WizardContext | null>(null);
export const useFactorySetup = () => useContext(FactorySetupContext);
export const useGuidedSetup = () => useFactorySetup()?.active ?? false;
