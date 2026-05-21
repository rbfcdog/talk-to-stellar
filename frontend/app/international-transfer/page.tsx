import InternationalTransferClient from "./international-transfer-client";

export const metadata = {
  title: "Institution Blockchain Settlement Tester",
  description: "Live tester for the TalkToStellar institution-to-institution BRL to Stellar USDC to USD rail.",
};

export default function InternationalTransferPage() {
  return <InternationalTransferClient />;
}
