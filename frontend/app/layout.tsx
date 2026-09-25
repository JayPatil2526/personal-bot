import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const display = Instrument_Serif({ variable: "--font-display", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LifeCrew — your AI crew for goals & good habits",
  description: "Conversational Lifestyle & Goal-Tracking AI with Episodic Memory",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${display.variable} ${mono.variable} grain min-h-screen`}>
        <div className="ambient" />
        <div className="relative z-10">{children}</div>
        <Toaster theme="dark" position="top-center" toastOptions={{ className: "!bg-[#14141d] !border-white/10" }} />
      </body>
    </html>
  );
}
