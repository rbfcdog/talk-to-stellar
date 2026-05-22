import MainnetClient from "./mainnet-client";

export const metadata = {
  title: "Stellar Network Console",
  description: "Testnet/Mainnet network console for TalkToStellar users.",
};

export default function MainnetPage() {
  return <MainnetClient />;
}
