import TelegramBot from 'node-telegram-bot-api';
import { storage } from '../../storage';
import { UserSession } from './types';

export abstract class ConversationFlow {
  protected bot: TelegramBot;
  protected chatId: number;
  protected session: UserSession;

  constructor(bot: TelegramBot, chatId: number, session: UserSession) {
    this.bot = bot;
    this.chatId = chatId;
    this.session = session;
  }

  abstract start(initialMessage?: string): Promise<void>;
  abstract handleMessage(message: TelegramBot.Message): Promise<void>;

  protected async sendMessage(text: string, options?: TelegramBot.SendMessageOptions) {
    await this.bot.sendMessage(this.chatId, text, options);
  }

  protected async endFlow() {
    await storage.deleteSession(this.chatId.toString());
  }

  protected async updateSession(data: Partial<UserSession['data']>) {
    this.session.data = { ...this.session.data, ...data };
    await storage.updateSession(this.chatId.toString(), this.session);
  }
}