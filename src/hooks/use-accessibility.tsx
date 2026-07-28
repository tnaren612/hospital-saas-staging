"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface A11yContextValue {
  largeText: boolean;
  highContrast: boolean;
  toggleLargeText: () => void;
  toggleHighContrast: () => void;
}

const A11yContext = createContext<A11yContextValue | null>(null);

export function AccessibilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const lt = localStorage.getItem("ssh_large_text") === "1";
    const hc = localStorage.getItem("ssh_high_contrast") === "1";
    setLargeText(lt);
    setHighContrast(hc);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("text-lg-a11y", largeText);
    document.documentElement.classList.toggle("high-contrast", highContrast);
    localStorage.setItem("ssh_large_text", largeText ? "1" : "0");
    localStorage.setItem("ssh_high_contrast", highContrast ? "1" : "0");
  }, [largeText, highContrast]);

  const toggleLargeText = useCallback(() => setLargeText((v) => !v), []);
  const toggleHighContrast = useCallback(() => setHighContrast((v) => !v), []);

  const value = useMemo(
    () => ({ largeText, highContrast, toggleLargeText, toggleHighContrast }),
    [largeText, highContrast, toggleLargeText, toggleHighContrast]
  );

  return (
    <A11yContext.Provider value={value}>{children}</A11yContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(A11yContext);
  if (!ctx)
    throw new Error("useAccessibility must be used within AccessibilityProvider");
  return ctx;
}
