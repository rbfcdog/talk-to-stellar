# ADR-002: WhatsApp-First Surface Strategy

**Date**: Early 2026
**Status**: Accepted

## Context
Need to choose the primary user surface for TalkToStellar. Options: WhatsApp, Telegram, web-only, or mobile app.

## Decision
**WhatsApp first**, with Telegram and web as secondary surfaces.

## Reasons
1. **Brazil market**: WhatsApp is the dominant messaging platform in Brazil (120M+ users)
2. **No install required**: Users already have WhatsApp — zero friction onboarding
3. **Conversational money**: The product concept is "talk to send money" — chat is the natural interface
4. **Evolution API**: Mature WhatsApp Business API integration available

## Consequences
- Heavy dependency on Evolution API reliability
- WhatsApp message formatting limitations
- Web screens still needed for complex operations (conversion, investments) — multi-surface maintenance burden
- i18n complexity: different surfaces have different locale resolution chains (#10)
