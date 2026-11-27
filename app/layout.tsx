import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletProvider } from "@/components/WalletProvider";

export const metadata: Metadata = {
  title: "Hobita — your savings circle, held by code",
  description:
    "A rotating savings circle on Solana. Ajo, chama, tanda, susu — one app, one shared pot, no collector holding the cash.",
  applicationName: "Hobita",
};

export const viewport: Viewport = {
  themeColor: "#F7F1E7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
