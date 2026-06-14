# UX-PRINCIPLES.md — The Founder's Implicit Design System

> **Living document.** New principles added as founder feedback reveals new patterns.

Distilled from 41 WhatsApp testing messages. These are the rules.

## 1. Multi-Step, Not Scroll

Every operation must be **multi-step with explicit Continue**, never a long scroll.

> "coloque menos scroll e coloque tipo a nubank que vai avançando as páginas e confirmando as operações" (#20)

**Rule**: Split every flow into: (1) Input, (2) Review, (3) Confirm/PIN. Max 4 visible elements per step.

## 2. Explicit Confirm Before Advance

Never auto-advance. Every step requires user action.

> "so avance da chave pro pin quando o usuario apertar em confirmar" (#17)

**Rule**: Every step ends with a "Continuar" or "Confirmar" button. No auto-redirects.

## 3. Close Windows on Completion

When an operation completes, close the initiating window/screen.

> "after conversion done, the screen didn't close" (#4), "make sure to close the window also" (#18)

**Rule**: Post-condition of any transaction: dismiss the initiating surface. Show a brief "✅ Concluído" toast, then close.

## 4. Minimal Essential Text

Delete every unnecessary word. The founder explicitly banned several patterns.

> "nao coloque em nenhum caso summary" (#2), "tire essas palavras aleatorias espalhadas, deixe so o essencial" (#21)

**Rule**: Every word must earn its place. When in doubt, delete it. See `product/COPY-GUIDE.md` for banned patterns.

## 5. Quote Shown Only When Final

Never show a changing quote. Freeze it at intent creation.

> "nao mude durante, so de o valor qd carregar td" (#30)

**Rule**: Show loading state → show final quote → freeze until user cancels or confirms.

## 6. "Production Grade" Visual Consistency

Visual attributes must be uniform across all surfaces.

> "deixar mesmo sombreado e estetica em conversao e pix, normalizar a UI" (#5), "production grade" (#9)

**Rule**: Design tokens for shadows, colors, spacing. No inline styles for visual attributes.

## 7. Completion Screen = "Pagamento Concluído"

Don't auto-display receipts. Just show "Done."

> "tire o recibo do final das telas, mostre so o pagamento concluído" (#22)

**Rule**: Completion: "✅ Concluído" + amount + optional "Ver comprovante" link.

## 8. Nubank as Reference

The founder consistently references Nubank's UX patterns.

> "tipo nubank" (#5, #20)

**Rule**: When in doubt about a UX pattern, check how Nubank does it. Multi-step, minimal text, clean modals, explicit confirmation at every step.

## 9. Visual Empty States

Never leave a disabled button without explanation.

> "quando nao tem saldo, mostre visualmente pro usuário que nao tem saldo" (#25)

**Rule**: Every disabled/inactive state must explain WHY. "Saldo insuficiente: R$0.00" > gray button.

## 10. Mobile-First

All screens must work on mobile first. Desktop is secondary.

> "on Phone screen, the pin part is not appearing because its too low" (#14), "esta muito longa pra celular" (#23)

**Rule**: Test every screen at 375×667 (iPhone SE). Everything must scroll.
