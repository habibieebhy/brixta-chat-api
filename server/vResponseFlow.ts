//server/vResponseFlow.ts

import { storage } from "./storage";

export interface VendorResponseContext {
    vendorTelegramId: string;
    inquiryId: string;
    step?: string;
    data?: any;
}

export interface VendorFlowResponse {
    message: string;
    nextStep?: string;
    keyboard?: any;
    action?: string;
    data?: any;
}

export class VendorResponseFlow {
    // Store vendor response states
    private vendorStates: Map<string, VendorResponseContext> = new Map();

    // Initialize vendor response flow when they click "Enter Rate Amount"
    async startRateFlow(vendorTelegramId: string, inquiryId: string): Promise<VendorFlowResponse> {
        try {
            // Get inquiry details to show what types were requested
            const originalInquiryId = inquiryId.replace('-CEMENT', '').replace('-TMT', '');
            const inquiry = await storage.getInquiryById(originalInquiryId);

            if (!inquiry) {
                return {
                    message: "❌ Inquiry not found. Please try again.",
                    nextStep: 'error'
                };
            }

            // Store initial state
            this.vendorStates.set(vendorTelegramId, {
                vendorTelegramId,
                inquiryId,
                step: 'rate_entry',
                data: { inquiry, rates: {} }
            });

            return this.showRateEntryOptions(vendorTelegramId, inquiry);
        } catch (error) {
            console.error('Error starting rate flow:', error);
            return {
                message: "❌ Error starting rate entry. Please try again.",
                nextStep: 'error'
            };
        }
    }

    // Show rate entry options based on inquiry types
    private async showRateEntryOptions(_vendorTelegramId: string, inquiry: any): Promise<VendorFlowResponse> {
        let message = `💰 Please provide rates for the requested materials:\n\n`;
        let keyboard: any = { inline_keyboard: [] };

        // Build message and keyboard based on inquiry details
        if (inquiry.material === 'cement' && inquiry.cementTypes) {
            message += `🏗️ **Cement Types Requested:**\n`;
            inquiry.cementTypes.forEach((type: string, index: number) => {
                message += `${index + 1}. ${type}\n`;
            });
            message += `\nClick on each type to enter its rate:`;

            // Create buttons for each cement type
            const buttons = inquiry.cementTypes.map((type: string) => ({
                text: `💰 ${type}`,
                callback_data: `rate_cement_${encodeURIComponent(type)}_${inquiry.inquiryId}`
            }));

            // Split into rows of 1 button each for better readability
            keyboard.inline_keyboard = buttons.map(btn => [btn]);

        } else if (inquiry.material === 'tmt' && inquiry.tmtSizes) {
            message += `🔧 **TMT Sizes Requested:**\n`;
            inquiry.tmtSizes.forEach((size: string, index: number) => {
                message += `${index + 1}. ${size}\n`;
            });
            message += `\nClick on each size to enter its rate:`;

            // Create buttons for each TMT size
            const buttons = inquiry.tmtSizes.map((size: string) => ({
                text: `💰 ${size}`,
                callback_data: `rate_tmt_${encodeURIComponent(size)}_${inquiry.inquiryId}`
            }));

            keyboard.inline_keyboard = buttons.map(btn => [btn]);

        } else if (inquiry.material === 'both') {
            message += `🏗️ **Cement Types Requested:**\n`;
            if (inquiry.cementTypes) {
                inquiry.cementTypes.forEach((type: string, index: number) => {
                    message += `${index + 1}. ${type}\n`;
                });
            }

            message += `\n🔧 **TMT Sizes Requested:**\n`;
            if (inquiry.tmtSizes) {
                inquiry.tmtSizes.forEach((size: string, index: number) => {
                    message += `${index + 1}. ${size}\n`;
                });
            }

            message += `\nClick on each item to enter its rate:`;

            let buttons: any[] = [];

            // Add cement type buttons
            if (inquiry.cementTypes) {
                buttons = buttons.concat(inquiry.cementTypes.map((type: string) => ({
                    text: `🏗️ ${type}`,
                    callback_data: `rate_cement_${encodeURIComponent(type)}_${inquiry.inquiryId}`
                })));
            }

            // Add TMT size buttons
            if (inquiry.tmtSizes) {
                buttons = buttons.concat(inquiry.tmtSizes.map((size: string) => ({
                    text: `🔧 ${size}`,
                    callback_data: `rate_tmt_${encodeURIComponent(size)}_${inquiry.inquiryId}`
                })));
            }
            keyboard.inline_keyboard = buttons.map(btn => [btn]);
        }

        // Add "Done with rates" button at the end
        keyboard.inline_keyboard.push([{
            text: "✅ Done with all rates",
            callback_data: `rates_complete_${inquiry.inquiryId} `
        }]);

        return {
            message,
            keyboard,
            nextStep: 'awaiting_rates'
        };
    }

    // Handle rate entry for specific type
    async handleRateEntry(vendorTelegramId: string, materialType: 'cement' | 'tmt', itemName: string, inquiryId: string): Promise<VendorFlowResponse> {
        // Store what we're waiting for
        const state = this.vendorStates.get(vendorTelegramId);
        if (state) {
            state.step = 'awaiting_rate_input'; // MAKE SURE THIS IS SET
            state.data.currentItem = { materialType, itemName };
            this.vendorStates.set(vendorTelegramId, state);

            console.log('🔍 DEBUG - Set state to awaiting_rate_input for:', itemName);
        }
        return {
            message: `💰 Enter rate for **${itemName}**:
Examples:
• Type "250" for ₹250 per unit
• Type "0" if this item is unavailable
Just type the number:`,
            nextStep: 'awaiting_rate_input'
        };
    }

    // Process rate input from vendor
    async processRateInput(vendorTelegramId: string, rateInput: string): Promise<VendorFlowResponse> {
        const state = this.vendorStates.get(vendorTelegramId);
        if (!state || !state.data.currentItem) {
            return {
                message: "❌ Session expired. Please start again.",
                nextStep: 'error'
            };
        }

        const rate = parseFloat(rateInput);
        if (isNaN(rate) || rate < 0) {
            return {
                message: "❌ Please enter a valid number (0 or higher). Example: 250",
                nextStep: 'awaiting_rate_input'
            };
        }

        const { materialType, itemName } = state.data.currentItem;

        // Store the rate
        if (!state.data.rates[materialType]) {
            state.data.rates[materialType] = {};
        }
        state.data.rates[materialType][itemName] = rate;

        // Clear current item
        delete state.data.currentItem;
        state.step = 'rate_entry';
        this.vendorStates.set(vendorTelegramId, state);

        const statusMessage = rate === 0 ?
            `✅ ${itemName}: ** Unavailable ** ` :
            `✅ ${itemName}: **₹${rate} per unit ** `;

        // Show updated rate entry options
        const response = await this.showRateEntryOptions(vendorTelegramId, state.data.inquiry);

        // Prepend the status message
        response.message = `${statusMessage} \n\n${response.message} `;

        return response;
    }

    // Handle completion of rate entry
    async handleRatesComplete(vendorTelegramId: string, inquiryId: string): Promise<VendorFlowResponse> {
        const state = this.vendorStates.get(vendorTelegramId);
        if (!state) {
            return {
                message: "❌ Session expired. Please start again.",
                nextStep: 'error'
            };
        }

        // Check if any rates were entered
        const hasRates = Object.keys(state.data.rates).some(material =>
            Object.keys(state.data.rates[material]).length > 0
        );

        if (!hasRates) {
            return {
                message: "❌ Please enter at least one rate before completing.",
                nextStep: 'awaiting_rates'
            };
        }

        // Show summary and move to GST selection
        let summary = "📋 **Rate Summary:**\n";

        Object.keys(state.data.rates).forEach(material => {
            const materialRates = state.data.rates[material];
            Object.keys(materialRates).forEach(item => {
                const rate = materialRates[item];
                if (rate === 0) {
                    summary += `• ${item}: ** Unavailable **\n`;
                } else {
                    summary += `• ${item}: **₹${rate} per unit **\n`;
                }
            });
        });

        summary += `\nWhat's your GST percentage?`;

        const gstKeyboard = {
            inline_keyboard: [
                [
                    { text: "12% GST", callback_data: `gst_12_${inquiryId}` },
                    { text: "18% GST", callback_data: `gst_18_${inquiryId}` }
                ],
                [
                    { text: "📝 Enter Custom GST%", callback_data: `gst_custom_${inquiryId}` }
                ]
            ]
        };

        // Update state
        state.step = 'awaiting_gst';
        this.vendorStates.set(vendorTelegramId, state);

        return {
            message: summary,
            keyboard: gstKeyboard,
            nextStep: 'awaiting_gst'
        };
    }

    // Handle GST selection
    async handleGstSelection(vendorTelegramId: string, gst: string, inquiryId: string): Promise<VendorFlowResponse> {
        const state = this.vendorStates.get(vendorTelegramId);
        if (!state) {
            return {
                message: "❌ Session expired. Please start again.",
                nextStep: 'error'
            };
        }

        if (gst === 'custom') {
            state.step = 'entering_gst';
            this.vendorStates.set(vendorTelegramId, state);

            return {
                message: `📊 Please enter GST percentage:

Example: 18
(Just type the number, I'll add %)`,
                nextStep: 'awaiting_gst_input'
            };
        } else {
            // Store GST and move to delivery
            state.data.gst = parseFloat(gst);
            return this.showDeliveryOptions(vendorTelegramId, inquiryId);
        }
    }

    // Process custom GST input
    async processGstInput(vendorTelegramId: string, gstInput: string): Promise<VendorFlowResponse> {
        const state = this.vendorStates.get(vendorTelegramId);
        if (!state) {
            return {
                message: "❌ Session expired. Please start again.",
                nextStep: 'error'
            };
        }

        const gst = parseFloat(gstInput);
        if (isNaN(gst) || gst < 0 || gst > 30) {
            return {
                message: "❌ Please enter a valid GST percentage (0-30). Example: 18",
                nextStep: 'awaiting_gst_input'
            };
        }

        state.data.gst = gst;
        return this.showDeliveryOptions(vendorTelegramId, state.data.inquiry.inquiryId);
    }

    // Show delivery options
    private async showDeliveryOptions(vendorTelegramId: string, inquiryId: string): Promise<VendorFlowResponse> {
        const state = this.vendorStates.get(vendorTelegramId);
        if (!state) {
            return {
                message: "❌ Session expired. Please start again.",
                nextStep: 'error'
            };
        }

        const deliveryKeyboard = {
            inline_keyboard: [
                [
                    { text: "🆓 Free Delivery", callback_data: `delivery_0_${inquiryId}` }
                ],
                [
                    { text: "🚚 Enter Delivery Amount", callback_data: `delivery_custom_${inquiryId}` }
                ]
            ]
        };

        state.step = 'awaiting_delivery';
        this.vendorStates.set(vendorTelegramId, state);

        return {
            message: `✅ GST set: ${state.data.gst}%

What's your delivery charge?`,
            keyboard: deliveryKeyboard,
            nextStep: 'awaiting_delivery'
        };
    }

    // Handle delivery selection
    async handleDeliverySelection(vendorTelegramId: string, delivery: string, inquiryId: string): Promise<VendorFlowResponse> {
        const state = this.vendorStates.get(vendorTelegramId);
        if (!state) {
            return {
                message: "❌ Session expired. Please start again.",
                nextStep: 'error'
            };
        }

        if (delivery === 'custom') {
            state.step = 'entering_delivery';
            this.vendorStates.set(vendorTelegramId, state);

            return {
                message: `🚚 Please enter delivery charge:

Example: 400
(Just type the number for delivery charge, or 0 for free delivery)`,
                nextStep: 'awaiting_delivery_input'
            };
        } else {
            // Store delivery and complete quote
            state.data.delivery = parseFloat(delivery);
            return this.completeQuote(vendorTelegramId);
        }
    }

    // Process custom delivery input
    async processDeliveryInput(vendorTelegramId: string, deliveryInput: string): Promise<VendorFlowResponse> {
        const state = this.vendorStates.get(vendorTelegramId);
        if (!state) {
            return {
                message: "❌ Session expired. Please start again.",
                nextStep: 'error'
            };
        }

        const delivery = parseFloat(deliveryInput);
        if (isNaN(delivery) || delivery < 0) {
            return {
                message: "❌ Please enter a valid delivery charge (0 or higher). Example: 400",
                nextStep: 'awaiting_delivery_input'
            };
        }

        state.data.delivery = delivery;
        return this.completeQuote(vendorTelegramId);
    }

    // Complete the quote and send to buyer
    private async completeQuote(vendorTelegramId: string): Promise<VendorFlowResponse> {
        const state = this.vendorStates.get(vendorTelegramId);
        if (!state) {
            return {
                message: "❌ Session expired. Please start again.",
                nextStep: 'error'
            };
        }

        // Clean up state
        this.vendorStates.delete(vendorTelegramId);

        // Build final summary
        let summary = `✅ Quote submitted successfully!\n\n📋 **Your Complete Quote:**\n`;

        // Add rates for each material type
        Object.keys(state.data.rates).forEach(material => {
            const materialRates = state.data.rates[material];
            summary += `\n**${material.toUpperCase()}:**\n`;
            Object.keys(materialRates).forEach(item => {
                const rate = materialRates[item];
                if (rate === 0) {
                    summary += `• ${item}: Unavailable\n`;
                } else {
                    summary += `• ${item}: ₹${rate} per unit\n`;
                }
            });
        });

        summary += `\n📊 GST: ${state.data.gst}%`;
        summary += `\n🚚 Delivery: ${state.data.delivery === 0 ? 'Free' : '₹' + state.data.delivery}`;
        summary += `\n\nInquiry ID: ${state.data.inquiry.inquiryId}`;
        summary += `\n\nYour detailed quote has been sent to the buyer!`;

        return {
            message: summary,
            nextStep: 'completed',
            action: 'send_quote_to_buyer',
            data: {
                inquiryId: state.data.inquiry.inquiryId,
                rates: state.data.rates,
                gst: state.data.gst,
                delivery: state.data.delivery,
                vendorTelegramId
            }
        };
    }

    // Process text input based on current state
    async processTextInput(vendorTelegramId: string, text: string): Promise<VendorFlowResponse> {
        const state = this.vendorStates.get(vendorTelegramId);
        if (!state) {
            return {
                message: "❌ No active session. Please start a new quote.",
                nextStep: 'error'
            };
        }

        switch (state.step) {
            case 'awaiting_rate_input':
            case 'entering_rate': // ADD THIS CASE
                return this.processRateInput(vendorTelegramId, text);
            case 'awaiting_gst_input':
            case 'entering_gst': // ADD THIS CASE
                return this.processGstInput(vendorTelegramId, text);
            case 'awaiting_delivery_input':
            case 'entering_delivery': // ADD THIS CASE
                return this.processDeliveryInput(vendorTelegramId, text);
            default:
                console.log('🔍 DEBUG - Unexpected step:', state.step);
                return {
                    message: "❌ Unexpected input. Please use the buttons provided.",
                    nextStep: state.step
                };
        }
    }

    // Get vendor state (for debugging)
    getVendorState(vendorTelegramId: string): VendorResponseContext | undefined {
        return this.vendorStates.get(vendorTelegramId);
    }

    // Clear vendor state (for cleanup)
    clearVendorState(vendorTelegramId: string): void {
        this.vendorStates.delete(vendorTelegramId);
    }
}

export const vendorResponseFlow = new VendorResponseFlow();