"use client";

import { createContext, useContext } from "react";

export type AdminSessionContextValue = {
  role: string | null;
  mode: "supabase" | "demo";
  email: string | null;
  name: string | null;
};

const AdminSessionContext = createContext<AdminSessionContextValue>({
  role: "admin",
  mode: "demo",
  email: null,
  name: null,
});

export function AdminSessionProvider({
  value,
  children,
}: {
  value: AdminSessionContextValue;
  children: React.ReactNode;
}) {
  return (
    <AdminSessionContext.Provider value={value}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession(): AdminSessionContextValue {
  return useContext(AdminSessionContext);
}
