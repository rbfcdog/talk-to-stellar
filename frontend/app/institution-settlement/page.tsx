// LEGACY — kept for backward compat, review before next release
import InternationalTransferClient from "../international-transfer/international-transfer-client";

export const metadata = {
  title: "Institution Blockchain Settlement Tester",
  description: "Institution-to-institution value route tester through Stellar blockchain settlement.",
};

export default function InstitutionSettlementPage() {
  return <InternationalTransferClient />;
}
