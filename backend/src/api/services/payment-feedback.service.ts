import { AgentRepository } from '../../repositories/agent.repository';
import { OperationRepository } from '../repository/operation.repository';
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { logger } from '../../utils/logger';

export class PaymentFeedbackService {
  /**
   * Notify agent about completed payment and get confirmation message
   */
  static async notifyPaymentCompleted(
    sessionId: string,
    destinationName: string,
    amount: string,
    assetCode: string,
    transactionHash: string
  ): Promise<string> {
    try {
      const repository = new AgentRepository(require('../../config/supabase').supabase);
      const openaiApiKey = process.env.OPENAI_API_KEY || '';
      
      // Create a simple notification message to LLM
      const paymentMessage = `Pagamento concluído com sucesso!
- Destinatário: ${destinationName}
- Quantia: ${amount} ${assetCode}
- Hash da transação: ${transactionHash}

Por favor, confirme para o usuário que o pagamento foi realizado com sucesso.`;

      // Get LLM response
      const llm = new ChatOpenAI({
        openAIApiKey: openaiApiKey,
        temperature: 0.5,
        modelName: process.env.OPENAI_MODEL || "gpt-4o",
      });

      const response = await llm.invoke([new HumanMessage(paymentMessage)]);
      const responseText = typeof response.content === 'string' 
        ? response.content 
        : JSON.stringify(response.content);

      // Save assistant message to conversation history
      await repository.saveMessage(sessionId, 'assistant', responseText);

      logger.info(`Payment confirmation message saved for session ${sessionId}`);
      return responseText;
    } catch (error) {
      logger.error(`Error notifying agent about payment: ${error instanceof Error ? error.message : String(error)}`);
      // Return a safe default message if LLM fails
      return `✅ Pagamento de ${amount} ${assetCode} para ${destinationName} foi realizado com sucesso! (Hash: ${transactionHash})`;
    }
  }
}
