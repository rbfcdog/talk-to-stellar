import MainnetClient from "./mainnet-client";

export const metadata = {
  title: "Mainnet Wallet Console",
  description: "Read-only Stellar Mainnet wallet console for TalkToStellar users.",
};

export default function MainnetPage() {
  return <MainnetClient />;
}

