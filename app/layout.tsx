import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Cash Drawer Reconciliation", description: "Secure cash count reconciliation" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
