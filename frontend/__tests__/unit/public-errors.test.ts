import { mapPublicError } from "@/lib/public-errors"

describe("public error mapping", () => {
  it("shows recipient asset readiness guidance instead of the generic fallback", () => {
    const mapped = mapPublicError("Ana Silva ainda não pode receber CETES. Peça para ativar recebimento.", "pt-BR")

    expect(mapped.code).toBe("recipient_asset_not_ready")
    expect(mapped.message).toContain("destinatário")
    expect(mapped.message).toContain("receber esse ativo")
    expect(mapped.message).not.toContain("Tente novamente em alguns segundos")
  })

  it("shows Stellar submission failure as no-funds-left execution guidance", () => {
    const mapped = mapPublicError("Falha ao enviar a transação Stellar para Ana Silva. Nenhum valor saiu da conta.", "pt-BR")

    expect(mapped.code).toBe("execution_unavailable")
    expect(mapped.message).toContain("Nenhum valor saiu")
    expect(mapped.message).not.toContain("Tente novamente em alguns segundos")
  })

  it("shows wallet signing readiness guidance for incomplete legacy wallets", () => {
    const mapped = mapPublicError("wallet not found for payment confirmation", "pt-BR")

    expect(mapped.code).toBe("account_signing_unavailable")
    expect(mapped.message).toContain("assinar")
    expect(mapped.message).toContain("Entre novamente")
  })

  it("shows insufficient balance for asset-specific conversion debit errors", () => {
    const mapped = mapPublicError("Failed to build conversion transaction: Saldo de TESOURO insuficiente para a conversão. Necessário: 123, disponível: 89.6400000.", "pt-BR")

    expect(mapped.code).toBe("insufficient_balance")
    expect(mapped.message).toContain("Saldo insuficiente")
    expect(mapped.message).not.toContain("Tente novamente em alguns segundos")
  })
})
