# Code Changes - PIN Reset Session ID Fix

## File 1: backend/src/agent/graph.ts

### Change 1: Add sessionId parameter to invokeWithTools() signature
```typescript
// BEFORE
private async invokeWithTools(
  messages: BaseMessage[],
  userId?: string,
  maxRounds: number = 3
): Promise<string> {

// AFTER
private async invokeWithTools(
  messages: BaseMessage[],
  userId?: string,
  sessionId?: string,
  maxRounds: number = 3
): Promise<string> {
```

### Change 2: Inject session_id into tool call arguments
```typescript
// BEFORE (Line ~278)
for (const toolCall of toolCalls) {
  logger.info(`[invokeWithTools] Executing tool: ${toolCall.name} with args: ${JSON.stringify(toolCall.args)}`);
  const toolResult = await executeTool(toolCall.name, toolCall.args || {});
  // ...
}

// AFTER
for (const toolCall of toolCalls) {
  // Inject session_id into tool args if available and tool expects it
  const toolArgs = toolCall.args || {};
  if (sessionId && !toolArgs.session_id) {
    toolArgs.session_id = sessionId;
  }
  
  logger.info(`[invokeWithTools] Executing tool: ${toolCall.name} with args: ${JSON.stringify(toolArgs)}`);
  const toolResult = await executeTool(toolCall.name, toolArgs);
  // ...
}
```

### Change 3: Pass session_id when calling invokeWithTools()
```typescript
// BEFORE (Line ~1180)
const responseContent = await this.invokeWithTools(preMessages, state.session_data?.user_id);

// AFTER
const responseContent = await this.invokeWithTools(preMessages, state.session_data?.user_id, state.session_id);
```

### Change 4: Add PIN reset keyword detection
```typescript
// In detectIntentByKeyword() method
private detectIntentByKeyword(message: string): IntentType | undefined {
  // ... existing keyword detection ...
  
  // NEW: PIN reset intent
  const pinResetWords = [
    'redefinir pin', 'resetar pin', 'esqueci pin', 
    'esqueci o pin', 'mudar pin', 'alterar pin', 
    'change pin', 'reset pin', 'forgot pin', 'pin reset'
  ];
  if (pinResetWords.some((word) => normalized.includes(word))) {
    return IntentType.GENERAL; // Will be handled by LLM with tools available
  }

  return undefined;
}
```

## File 2: backend/src/agent/routes.ts

### Change: Add PIN reset instructions to system prompt
```typescript
// Add this section before "## AVAILABLE TOOLS"

## PIN RESET AND SECURITY
- When user says "redefinir pin", "resetar pin", "esqueci pin", "mudar pin", "alterar pin" or similar: IMMEDIATELY use the reset_pin tool.
- The reset_pin tool only needs session_id (you will always have this in the current session context).
- After calling reset_pin, respond in Portuguese with the reset link and explain that it's valid for 15 minutes.
- Example user messages that trigger reset_pin: "Quero redefinir o meu PIN", "Esqueci meu PIN", "Como resetar o PIN?", "Preciso alterar o PIN"
- When user says "restart", "create account", "setup PIN", "setup passkey" or similar during onboarding: use restart_onboarding tool.
```

## Summary of Changes

| Component | Type | Impact |
|-----------|------|--------|
| Session ID passing | Enhancement | Enables tool to access session context |
| Tool arg injection | Bug fix | Resolves tool execution with session_id |
| PIN keyword detection | Enhancement | Improves intent recognition |
| System prompt | Clarification | Guides LLM to use reset_pin tool |

## Testing After Changes

```bash
# 1. Rebuild backend
cd backend && npm run build

# 2. Start backend
npm run dev

# 3. Test PIN reset endpoint
curl -X POST http://localhost:3001/api/agent/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "quero redefinir o meu pin",
    "session_id": "93745365-4808-45fd-92e5-926237def028"
  }'

# Expected: Returns reset link with JWT token
```

## Deployment Notes

### Backwards Compatibility
- ✅ Old sessions continue to work
- ✅ Session ID injection is conditional (only if sessionId provided)
- ✅ No database migrations required
- ✅ No frontend changes needed

### Rollback Plan
If issues arise:
1. Revert `graph.ts` - Remove 3 changes (session param, injection logic, keyword detection)
2. Revert `routes.ts` - Remove PIN RESET AND SECURITY section
3. Rebuild: `npm run build`
4. Restart backend

### Performance Impact
- Negligible (single parameter assignment per tool call)
- No additional database queries
- Session ID already in memory

---

**Review Checklist**:
- [ ] Code compiles without TypeScript errors
- [ ] PIN reset returns valid JWT link
- [ ] Reset link valid for 15 minutes
- [ ] Frontend can load `/change-pin` with token
- [ ] User can change PIN successfully
- [ ] Session ID flows through Telegram → Agent → Tool
