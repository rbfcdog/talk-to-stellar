import { formatCustomerNumber, truncateCustomerAmount } from "@/lib/customer-amount";

describe("customer amount formatting", () => {
  it("truncates customer-visible amounts to two decimals", () => {
    expect(truncateCustomerAmount(15.3254281)).toBe(15.32);
    expect(formatCustomerNumber(1539.9100000)).toBe("1,539.91");
  });

  it("uses the active locale and always includes two decimal places", () => {
    expect(formatCustomerNumber(15.3254281, "pt-BR")).toBe("15,32");
    expect(formatCustomerNumber(10, "en-US")).toBe("10.00");
  });
});
