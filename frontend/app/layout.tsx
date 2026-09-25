import type { Metadata } from "next";
import "@fontsource-variable/figtree";
import "@fontsource-variable/jetbrains-mono";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "LifeCrew — goals, habits and a crew that remembers",
  description: "Conversational Lifestyle & Goal-Tracking AI with Episodic Memory",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{ className: "!rounded-2xl !border !border-line !bg-white !text-ink !shadow-lg !font-sans" }}
        />
      </body>
    </html>
  );
}
