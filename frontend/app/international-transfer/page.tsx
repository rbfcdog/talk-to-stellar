import InternationalTransferClient from "./international-transfer-client";

export const metadata = {
  title: "International USD Transfer Tester",
  description: "Live tester for the TalkToStellar BRL to Stellar USDC to USD payout rail.",
};

export default function InternationalTransferPage() {
  return <InternationalTransferClient />;
}
