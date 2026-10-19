'use client';
import { createContext, useContext, useState } from 'react';

const TabsContext = createContext<{ active: string; setActive: (v: string) => void } | null>(null);
const useTabs = () => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs.* must be used inside <Tabs>');
  return ctx;
};

function TabsRoot({ defaultValue, children }: { defaultValue: string; children: React.ReactNode }) {
  const [active, setActive] = useState(defaultValue);
  return <TabsContext.Provider value={{ active, setActive }}><div className="tabs">{children}</div></TabsContext.Provider>;
}

function TabsList({ children }: { children: React.ReactNode }) {
  return <div role="tablist">{children}</div>;
}

function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const { active, setActive } = useTabs();
  return <button role="tab" aria-selected={active === value} onClick={() => setActive(value)}>{children}</button>;
}

function TabsPanel({ value, children }: { value: string; children: React.ReactNode }) {
  const { active } = useTabs();
  return active === value ? <div role="tabpanel">{children}</div> : null;
}

/** Compound tabs: <Tabs><Tabs.List><Tabs.Trigger/></Tabs.List><Tabs.Panel/></Tabs> */
export const Tabs = Object.assign(TabsRoot, { List: TabsList, Trigger: TabsTrigger, Panel: TabsPanel });
