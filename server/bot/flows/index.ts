import TelegramBot from 'node-telegram-bot-api';
import { storage } from '../../storage';
import { ConversationFlow } from './base';
import { UserSession } from './types';

// Import specific flows here
// e.g., import { BuyerInquiryFlow } from './buyer';

const flowRegistry: { [key: string]: any } = {
  // 'buyer-inquiry': BuyerInquiryFlow,
};

export class FlowManager {
  private bot: TelegramBot;

  constructor(bot: TelegramBot) {
    this.bot = bot;
  }

  async startFlow(flowName: string, chatId: number, initialMessage?: string) {
    const FlowClass = flowRegistry[flowName];
    if (!FlowClass) {
      throw new Error(`Flow ${flowName} not found`);
    }

    const session: UserSession = {
      currentFlow: flowName,
      step: 'start',
      data: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await storage.createSession(chatId.toString(), session);
    const flowInstance = new FlowClass(this.bot, chatId, session);
    await flowInstance.start(initialMessage);
  }

  async handleMessage(message: TelegramBot.Message) {
    const chatId = message.chat.id;
    const session = await storage.getSession(chatId.toString());

    if (session && flowRegistry[session.currentFlow]) {
      const FlowClass = flowRegistry[session.currentFlow];
      const flowInstance = new FlowClass(this.bot, chatId, session);
      await flowInstance.handleMessage(message);
    } else {
      // Default behavior if no active flow
      // This can be a welcome message or a main menu
    }
  }
}