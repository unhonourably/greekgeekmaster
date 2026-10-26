import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { brand } from "@/config/brand";
import { AuthSession } from "@/components/auth-session";
import "./globals.css";

const sans = Geist({ variable: "--font-app-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-app-mono", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-app-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <AuthSession />
        {children}
      </body>
    </html>
  );
}
