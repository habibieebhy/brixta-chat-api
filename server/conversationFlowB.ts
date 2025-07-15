//server/conversationFLowB.ts
import { storage } from "./storage";
import { LocationManager } from './locationManager';

export interface ConversationContextB {
  chatId: string;
  userType?: 'telegram' | 'web';
  sessionId?: string;
  step?: string;
  data?: any;
  userEmail?: string;
}

export interface FlowResponse {
  message: string;
  nextStep?: string;
  action?: string;
  data?: any;
  showOptions?: string[];
}

const CEMENT_TYPES = [
  'OPC Grade 33',
  'OPC Grade 43',
  'OPC Grade 53',
  'PPC Grade 33',
  'PPC Grade 43',
  'PPC Grade 53',
  'Enter Other Specific Type'
];

const TMT_SIZES = ['5.5mm', '6mm', '8mm', '10mm', '12mm', '16mm', '18mm', '20mm', '24mm', '26mm', '28mm', '32mm', '36mm', '40mm'];

const CEMENT_COMPANIES = [
  'Ambuja',
  'Ultratech',
  'MAX',
  'Dalmia',
  'ACC',
  'Black Tiger',
  'Topcem',
  'Star',
  'Any Company'
];

const TMT_COMPANIES = [
  'Xtech',
  'TATA Tiscon',
  'JSW',
  'Shyam Steel',
  'Any Company'
];

export class ConversationFlowB {
  // Helper function to capitalize city names
  private capitalizeCity(cityName: string): string {
    return cityName
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  async processMessage(context: ConversationContextB, message: string): Promise<FlowResponse> {
    const { chatId, step, data = {} } = context;

    // Handle /start command
    if (message === '/start' || !step) {
      return {
        message: `🏗️ Welcome to CemTemBot! 

Let's get you started with your enquiry...
I help you get instant pricing for cement and TMT bars from verified vendors in your city.

Reply with the Number of the option to send purchase enquiry to vendors:
1 Buy Materials 
2 <System>`,
        nextStep: 'user_type'
      };
    }

    // Handle user type selection
    if (step === 'user_type') {
      if (message === '1') {
        return {
          message: `🏗️ Great! I'll help you get pricing for cement and TMT bars.

What material do you need pricing for?
1 Cement
2 TMT Bars
3 Both Cement & TMT Bars

Reply with 1 or 2 or 3`,
          nextStep: 'buyer_material',
          data: { userType: 'buyer' }
        };
      } else if (message === '2') {
        return {
          message: `📊 **Sales Record Entry**
Choose the item you sold:
1 Cement
2 TMT
3 Both`,
          nextStep: 'sales_item_type',
          data: { userType: 'sales_rep' }
        };
      } else {
        return {
          message: 'Please select a valid option:\n\n1 Buy Materials\n2 Enter Sales Records (For Sales Rep.)',
          nextStep: 'user_type'
        };
      }
    }

    // Buyer flow - Updated
    if (step === 'buyer_material') {
      let material, materialDisplay;

      if (message === '1') {
        material = 'cement';
        materialDisplay = 'cement';
      } else if (message === '2') {
        material = 'tmt';
        materialDisplay = 'TMT bars';
      } else if (message === '3') {
        material = 'both';
        materialDisplay = 'cement & TMT bars';
      } else {
        return {
          message: `Please reply with 1 for Cement or 2 for TMT Bars and 3 for both`,
          nextStep: 'buyer_material'
        };
      }

      // Move to company preference based on material
      if (material === 'cement') {
        return {
          message: `🏭 Select cement company preference (reply with number):

${CEMENT_COMPANIES.map((company, index) => `${index + 1}. ${company}`).join('\n')}`,
          nextStep: 'buyer_cement_company_select',
          data: { ...data, material },
          showOptions: CEMENT_COMPANIES
        };
      } else if (material === 'tmt') {
        return {
          message: `🏗️ Select TMT company preference (reply with number):

${TMT_COMPANIES.map((company, index) => `${index + 1}. ${company}`).join('\n')}`,
          nextStep: 'buyer_tmt_company_select',
          data: { ...data, material },
          showOptions: TMT_COMPANIES
        };
      } else if (material === 'both') {
        return {
          message: `🏭 Let's start with cement. Select cement company preference (reply with number):

${CEMENT_COMPANIES.map((company, index) => `${index + 1}. ${company}`).join('\n')}`,
          nextStep: 'buyer_cement_company_select',
          data: { ...data, material },
          showOptions: CEMENT_COMPANIES
        };
      }
    }

    // NEW: Cement company selection
    if (step === 'buyer_cement_company_select') {
      const selectedIndex = parseInt(message.trim()) - 1;
      const selectedCompany = CEMENT_COMPANIES[selectedIndex];

      if (!selectedCompany) {
        return {
          message: `Please select a valid number (1-${CEMENT_COMPANIES.length})`,
          nextStep: 'buyer_cement_company_select'
        };
      }

      return {
        message: `🏗️ Select cement types you need (reply with numbers separated by commas, e.g., "1,3,5")
        Choose Grade 33 for repairs/small fixings AND Grade 43 for general house-building::

${CEMENT_TYPES.map((type, index) => `${index + 1}. ${type}`).join('\n')}`,
        nextStep: 'buyer_cement_types',
        data: { ...data, cementCompany: selectedCompany },
        showOptions: CEMENT_TYPES
      };
    }

    // NEW: Cement types selection
    if (step === 'buyer_cement_types') {
      const selectedIndices = message.split(',').map(num => parseInt(num.trim()) - 1);
      const selectedTypes = selectedIndices
        .filter(index => index >= 0 && index < CEMENT_TYPES.length)
        .map(index => CEMENT_TYPES[index]);

      if (selectedTypes.length === 0) {
        return {
          message: `Please select valid cement types using numbers (e.g., "1,3,5")`,
          nextStep: 'buyer_cement_types'
        };
      }

      // Handle "Enter Other Specific Type"
      if (selectedTypes.includes('Enter Other Specific Type')) {
        return {
          message: `Please specify your custom cement type:`,
          nextStep: 'buyer_cement_custom',
          data: { ...data, cementTypes: selectedTypes.filter(t => t !== 'Enter Other Specific Type') }
        };
      }

      // Check if we need TMT info (for "both" material)
      if (data.material === 'both') {
        return {
          message: `✅ Cement company: ${data.cementCompany}
✅ Cement types: ${selectedTypes.join(', ')}

🏗️ Now for TMT bars. Select TMT company preference (reply with number):

${TMT_COMPANIES.map((company, index) => `${index + 1}. ${company}`).join('\n')}`,
          nextStep: 'buyer_tmt_company_select',
          data: { ...data, cementTypes: selectedTypes },
          showOptions: TMT_COMPANIES
        };
      } else {
        // Only cement selected, move to city
        return {
          message: `✅ Company: ${data.cementCompany}
✅ Types: ${selectedTypes.join(', ')}

📍 Which city/location do you need these materials in?

Please enter your city name:`,
          nextStep: 'buyer_city',
          data: { ...data, cementTypes: selectedTypes }
        };
      }
    }

    // NEW: Handle custom cement type
    if (step === 'buyer_cement_custom') {
      const customType = message.trim();
      const allCementTypes = [...data.cementTypes, customType];

      if (data.material === 'both') {
        return {
          message: `✅ Cement company: ${data.cementCompany}
✅ Cement types: ${allCementTypes.join(', ')}

🏗️ Now for TMT bars. Select TMT company preference (reply with number):

${TMT_COMPANIES.map((company, index) => `${index + 1}. ${company}`).join('\n')}`,
          nextStep: 'buyer_tmt_company_select',
          data: { ...data, cementTypes: allCementTypes },
          showOptions: TMT_COMPANIES
        };
      } else {
        return {
          message: `✅ Company: ${data.cementCompany}
✅ Types: ${allCementTypes.join(', ')}

📍 Which city/location do you need these materials in?

Please enter your city name:`,
          nextStep: 'buyer_city',
          data: { ...data, cementTypes: allCementTypes }
        };
      }
    }

    // NEW: TMT company selection
    if (step === 'buyer_tmt_company_select') {
      const selectedIndex = parseInt(message.trim()) - 1;
      const selectedCompany = TMT_COMPANIES[selectedIndex];

      if (!selectedCompany) {
        return {
          message: `Please select a valid number (1-${TMT_COMPANIES.length})`,
          nextStep: 'buyer_tmt_company_select'
        };
      }

      return {
        message: `🔧 Select TMT sizes you need (reply with numbers separated by commas, e.g., "3,5,7"):

${TMT_SIZES.map((size, index) => `${index + 1}. ${size}`).join('\n')}`,
        nextStep: 'buyer_tmt_sizes',
        data: { ...data, tmtCompany: selectedCompany },
        showOptions: TMT_SIZES
      };
    }

    // NEW: TMT sizes selection
    if (step === 'buyer_tmt_sizes') {
      const selectedIndices = message.split(',').map(num => parseInt(num.trim()) - 1);
      const selectedSizes = selectedIndices
        .filter(index => index >= 0 && index < TMT_SIZES.length)
        .map(index => TMT_SIZES[index]);

      if (selectedSizes.length === 0) {
        return {
          message: `Please select valid TMT sizes using numbers (e.g., "3,5,7")`,
          nextStep: 'buyer_tmt_sizes'
        };
      }

      return {
        message: `✅ TMT company: ${data.tmtCompany}
✅ TMT sizes: ${selectedSizes.join(', ')}

📍 Which city/location do you need these materials in?

Please enter your city name:`,
        nextStep: 'buyer_city',
        data: { ...data, tmtSizes: selectedSizes }
      };
    }

    // Updated city step to handle new data structure
    if (step === 'buyer_city') {
      if (context.userType === 'web') {
        // For web users: expects "cityId:localityId" format
        let formattedLocation = message;
        let cityId, localityId;

        // Try to parse if it's in cityId:localityId format
        if (message.includes(':')) {
          [cityId, localityId] = message.split(':');
          const validLocation = LocationManager.getFormattedLocation(cityId, localityId);
          if (validLocation && validLocation !== 'Unknown Location') {
            formattedLocation = validLocation;
          }
        }

        //const formattedLocation = LocationManager.getFormattedLocation(cityId, localityId);

        let materialSummary = '';
        if (data.material === 'cement') {
          materialSummary = `Cement (${data.cementCompany}): ${data.cementTypes.join(', ')}`;
        } else if (data.material === 'tmt') {
          materialSummary = `TMT (${data.tmtCompany}): ${data.tmtSizes.join(', ')}`;
        } else if (data.material === 'both') {
          materialSummary = `Cement (${data.cementCompany}): ${data.cementTypes.join(', ')}\nTMT (${data.tmtCompany}): ${data.tmtSizes.join(', ')}`;
        }

        return {
          message: `📦 How much do you need?

Materials requested:
${materialSummary}
📍 Location: ${formattedLocation}

Please specify quantity (For both Cement and TMT if both are selected) (e.g., "50 bags cement or/and 200 pieces or 40kg TMT"):`,
          nextStep: 'buyer_quantity',
          data: { ...data, city: formattedLocation, cityId, localityId } // FIX: Use formattedLocation instead of capitalizedCity, add cityId & localityId
        };
      } else {
        // For Telegram users: show available locations
        const defaults = LocationManager.getDefaults();
        const defaultLocation = defaults.city && defaults.locality ?
          LocationManager.getFormattedLocation(defaults.city.id, defaults.locality.id) :
          'Ganeshguri, Guwahati';

        return {
          message: `📍 We currently serve ${defaultLocation}.

Type "yes" to continue with this location or "no" if you're in a different area:`,
          nextStep: 'buyer_city_confirm',
          data: { ...data, city: defaultLocation, cityId: 'guwahati', localityId: 'ganeshguri' }
        };
      }
    }

    // Add confirmation step for Telegram users
    if (step === 'buyer_city_confirm') {
      if (message.toLowerCase() === 'yes' || message.toLowerCase() === 'y') {
        // Continue with default location
        let materialSummary = '';
        if (data.material === 'cement') {
          materialSummary = `Cement (${data.cementCompany}): ${data.cementTypes.join(', ')}`;
        } else if (data.material === 'tmt') {
          materialSummary = `TMT (${data.tmtCompany}): ${data.tmtSizes.join(', ')}`;
        } else if (data.material === 'both') {
          materialSummary = `Cement (${data.cementCompany}): ${data.cementTypes.join(', ')}\nTMT (${data.tmtCompany}): ${data.tmtSizes.join(', ')}`;
        }

        return {
          message: `📦 How much do you need?

Materials requested:
${materialSummary}
📍 Location: ${data.city}

Please specify quantity (e.g., "50 bags cement or/and 200 pieces TMT"):`,
          nextStep: 'buyer_quantity',
          data: data
        };
      } else {
        return {
          message: `Sorry, we currently only serve Guwahati area. We'll be expanding to more cities soon!

Type /start to try again or contact us for updates on new service areas.`,
          nextStep: 'completed'
        };
      }
    }

    if (step === 'buyer_quantity') {
      return {
        message: `📱 Great! Please provide your phone number for vendors to contact you:`,
        nextStep: 'buyer_phone',
        data: { ...data, quantity: message }
      };
    }

    // Updated phone step with detailed summary
    if (step === 'buyer_phone') {
      let materialDisplay = '';
      if (data.material === 'cement') {
        materialDisplay = `🏗️ Cement Types: ${data.cementTypes.join(', ')}
🏭 Company: ${data.cementCompany}`;
      } else if (data.material === 'tmt') {
        materialDisplay = `🔧 TMT Sizes: ${data.tmtSizes.join(', ')}
🏭 Company: ${data.tmtCompany}`;
      } else if (data.material === 'both') {
        materialDisplay = `🏗️ Cement Types: ${data.cementTypes.join(', ')}
🏭 Cement Company: ${data.cementCompany}
🔧 TMT Sizes: ${data.tmtSizes.join(', ')}
🏭 TMT Company: ${data.tmtCompany}`;
      }

      return {
        message: `✅ Perfect! Your inquiry has been created and sent to vendors in ${data.city}.

📋 **Your Inquiry Summary:**
${materialDisplay}
📍 City: ${data.city}
📦 Quantity: ${data.quantity}
📱 Contact: ${message}

Vendors will send you detailed quotes shortly!`,
        nextStep: 'completed',
        action: 'create_inquiry',
        data: { ...data, phone: message }
      };
    }

    // ========== SALES RECORDS FLOW ==========

    // Handle sales item type selection
    if (step === 'sales_item_type') {
      if (message === '1') {
        return {
          message: `🏗️ **Cement Sales Record**

First, select the cement company:

1. Ambuja
2. ACC
3. Ultratech
4. MAX
5. DALMIA
6. Topcem
7. Black Tiger
8. Others`,
          nextStep: 'cement_company_select',
          data: { ...data, salesType: 'cement' }
        };
      } else if (message === '2') {
        return {
          message: `🔧 **TMT Sales Record**

First, select the TMT company:

1. Tata Tiscon
2. JSW
3. Shyam Steel
4. Xtech
5. Others`,
          nextStep: 'tmt_company_select',
          data: { ...data, salesType: 'tmt' }
        };
      } else if (message === '3') {
        return {
          message: `🏗️🔧 **Both Cement & TMT Sales Record**

Let's start with cement company:

1. Ambuja
2. ACC
3. Ultratech
4. MAX
5. DALMIA
6. Topcem
7. Black Tiger
8. Others`,
          nextStep: 'cement_company_select',
          data: { ...data, salesType: 'both', currentItem: 'cement' }
        };
      } else {
        return {
          message: 'Please select a valid option:\n\n1. Cement\n2. TMT\n3. Both',
          nextStep: 'sales_item_type',
          data: data
        };
      }
    }

    // Handle cement company selection
    if (step === 'cement_company_select') {
      const cementCompanies = ['Ambuja', 'ACC', 'Ultratech', 'MAX', 'DALMIA', 'Topcem', 'Black Tiger'];
      let selectedCompany = '';

      if (['1', '2', '3', '4', '5', '6', '7'].includes(message)) {
        selectedCompany = cementCompanies[parseInt(message) - 1];

        return {
          message: `✅ Company: ${selectedCompany} selected

Enter the quantity sold:

Qty Sold (${selectedCompany} Cement): ____

Enter the quantity in bags (e.g., 100, 500, 1000)`,
          nextStep: 'cement_qty_input',
          data: { ...data, cementCompany: selectedCompany }
        };
      } else if (message === '8') {
        return {
          message: `📝 **Enter Custom Company**

Please enter the cement company name:

Company Name: ____`,
          nextStep: 'cement_company_custom',
          data: data
        };
      } else {
        return {
          message: 'Please select a valid option (1-8):\n\n1. Ambuja\n2. ACC\n3. Ultratech\n4. MAX\n5. DALMIA\n6. Topcem\n7. Black Tiger\n8. Others',
          nextStep: 'cement_company_select',
          data: data
        };
      }
    }

    // Handle custom cement company input
    if (step === 'cement_company_custom') {
      if (!message || message.trim().length < 2) {
        return {
          message: 'Please enter a valid company name (minimum 2 characters)',
          nextStep: 'cement_company_custom',
          data: data
        };
      }

      return {
        message: `✅ Company: ${message} selected

Enter the quantity sold:

Qty Sold (${message} Cement): ____

Enter the quantity in bags (e.g., 100, 500, 1000)`,
        nextStep: 'cement_qty_input',
        data: { ...data, cementCompany: message }
      };
    }

    // Handle cement quantity input
    if (step === 'cement_qty_input') {
      const qty = parseInt(message);
      if (isNaN(qty) || qty <= 0) {
        return {
          message: 'Please enter a valid quantity number (e.g., 100, 500, 1000)',
          nextStep: 'cement_qty_input',
          data: data
        };
      }

      return {
        message: `✅ Quantity: ${qty} bags recorded

Enter the price per bag:

Price per bag (₹): ____

Enter the price in rupees (e.g., 350, 400, 450)`,
        nextStep: 'cement_price_input',
        data: { ...data, cementQty: qty }
      };
    }

    // Handle cement price input
    if (step === 'cement_price_input') {
      const price = parseFloat(message);
      if (isNaN(price) || price <= 0) {
        return {
          message: 'Please enter a valid price number (e.g., 350, 400, 450)',
          nextStep: 'cement_price_input',
          data: data
        };
      }

      const salesData = { ...data, cementPrice: price };

      // If both selected, move to TMT company selection
      if (data.salesType === 'both') {
        return {
          message: `✅ Cement price: ₹${price} per bag recorded

Now let's record TMT details:

Select the TMT company:

1. Tata Tiscon
2. JSW
3. Shyam Steel
4. Xtech
5. Others`,
          nextStep: 'tmt_company_select',
          data: { ...salesData, currentItem: 'tmt' }
        };
      } else {
        // Single cement sale, go to project owner
        return {
          message: `✅ Cement price: ₹${price} per bag recorded

Now enter the project owner name:

Project Owner Name: ____

Enter the full name of the project owner/client`,
          nextStep: 'project_owner_input',
          data: salesData
        };
      }
    }

    // Handle TMT company selection
    if (step === 'tmt_company_select') {
      const tmtCompanies = ['Tata Tiscon', 'JSW', 'Shyam Steel', 'Xtech'];
      let selectedCompany = '';

      if (['1', '2', '3', '4'].includes(message)) {
        selectedCompany = tmtCompanies[parseInt(message) - 1];

        return {
          message: `✅ Company: ${selectedCompany} selected

Select the TMT sizes sold (multiple selections allowed):

1. 5.5mm    2. 6mm     3. 8mm     4. 10mm
5. 12mm     6. 16mm    7. 18mm    8. 20mm
9. 24mm     10. 26mm   11. 28mm   12. 32mm
13. 36mm    14. 40mm

Enter the numbers separated by commas (e.g., 1,4,5,8 for 5.5mm, 10mm, 12mm, 20mm)`,
          nextStep: 'tmt_sizes_select',
          data: { ...data, tmtCompany: selectedCompany }
        };
      } else if (message === '5') {
        return {
          message: `📝 **Enter Custom TMT Company**

Please enter the TMT company name:

Company Name: ____`,
          nextStep: 'tmt_company_custom',
          data: data
        };
      } else {
        return {
          message: 'Please select a valid option (1-5):\n\n1. Tata Tiscon\n2. JSW\n3. Shyam Steel\n4. Xtech\n5. Others',
          nextStep: 'tmt_company_select',
          data: data
        };
      }
    }

    // Handle custom TMT company input
    if (step === 'tmt_company_custom') {
      if (!message || message.trim().length < 2) {
        return {
          message: 'Please enter a valid company name (minimum 2 characters)',
          nextStep: 'tmt_company_custom',
          data: data
        };
      }

      return {
        message: `✅ Company: ${message} selected

Select the TMT sizes sold (multiple selections allowed):

1. 5.5mm    2. 6mm     3. 8mm     4. 10mm
5. 12mm     6. 16mm    7. 18mm    8. 20mm
9. 24mm     10. 26mm   11. 28mm   12. 32mm
13. 36mm    14. 40mm

Enter the numbers separated by commas (e.g., 1,4,5,8 for 5.5mm, 10mm, 12mm, 20mm)`,
        nextStep: 'tmt_sizes_select',
        data: { ...data, tmtCompany: message }
      };
    }

    // Handle TMT sizes selection
    if (step === 'tmt_sizes_select') {
      const TMT_SIZES = ['5.5mm', '6mm', '8mm', '10mm', '12mm', '16mm', '18mm', '20mm', '24mm', '26mm', '28mm', '32mm', '36mm', '40mm'];

      const selections = message.split(',').map(s => s.trim());
      const validSelections = selections.filter(s => {
        const num = parseInt(s);
        return !isNaN(num) && num >= 1 && num <= 14;
      });

      if (validSelections.length === 0) {
        return {
          message: 'Please enter valid size numbers separated by commas (e.g., 1,4,5,8)\n\nAvailable sizes: 1-14',
          nextStep: 'tmt_sizes_select',
          data: data
        };
      }

      const selectedSizes = validSelections.map(s => TMT_SIZES[parseInt(s) - 1]);
      const firstSize = selectedSizes[0];

      return {
        message: `✅ Selected sizes: ${selectedSizes.join(', ')}

Now enter the quantity for each size:

Quantity for ${firstSize} (in kg): ____

Enter the quantity in kg (e.g., 100, 500, 1000)`,
        nextStep: 'tmt_qty_input',
        data: {
          ...data,
          tmtSizes: selectedSizes,
          currentQtyIndex: 0,
          tmtQuantities: {}
        }
      };
    }

    // Handle TMT quantity input
    if (step === 'tmt_qty_input') {
      const qty = parseInt(message);
      if (isNaN(qty) || qty <= 0) {
        const currentSize = data.tmtSizes[data.currentQtyIndex];
        return {
          message: `Please enter a valid quantity for ${currentSize} (e.g., 100, 500, 1000)`,
          nextStep: 'tmt_qty_input',
          data: data
        };
      }

      const currentSize = data.tmtSizes[data.currentQtyIndex];
      const updatedQuantities = { ...data.tmtQuantities, [currentSize]: qty };
      const nextIndex = data.currentQtyIndex + 1;

      // Check if more sizes need quantities
      if (nextIndex < data.tmtSizes.length) {
        const nextSize = data.tmtSizes[nextIndex];
        return {
          message: `✅ Quantity for ${currentSize}: ${qty} kg recorded

Quantity for ${nextSize} (in kg): ____

Enter the quantity in kg (e.g., 100, 500, 1000)`,
          nextStep: 'tmt_qty_input',
          data: {
            ...data,
            tmtQuantities: updatedQuantities,
            currentQtyIndex: nextIndex
          }
        };
      } else {
        // All quantities collected, now ask for prices
        const firstSize = data.tmtSizes[0];
        return {
          message: `✅ All quantities recorded

Now enter the price for each size:

Price for ${firstSize} (₹ per kg): ____

Enter the price in rupees (e.g., 65, 70, 75)`,
          nextStep: 'tmt_price_input',
          data: {
            ...data,
            tmtQuantities: updatedQuantities,
            currentPriceIndex: 0,
            tmtPrices: {}
          }
        };
      }
    }

    // Handle TMT price input
    if (step === 'tmt_price_input') {
      const price = parseFloat(message);
      if (isNaN(price) || price <= 0) {
        const currentSize = data.tmtSizes[data.currentPriceIndex];
        return {
          message: `Please enter a valid price number for ${currentSize} (e.g., 65, 70, 75)`,
          nextStep: 'tmt_price_input',
          data: data
        };
      }

      const currentSize = data.tmtSizes[data.currentPriceIndex];
      const updatedPrices = { ...data.tmtPrices, [currentSize]: price };
      const nextIndex = data.currentPriceIndex + 1;

      // Check if more sizes to price
      if (nextIndex < data.tmtSizes.length) {
        const nextSize = data.tmtSizes[nextIndex];
        return {
          message: `✅ Price for ${currentSize}: ₹${price} per kg recorded

Price for ${nextSize} (₹ per kg): ____

Enter the price in rupees (e.g., 65, 70, 75)`,
          nextStep: 'tmt_price_input',
          data: {
            ...data,
            tmtPrices: updatedPrices,
            currentPriceIndex: nextIndex
          }
        };
      } else {
        // All prices collected, move to project owner
        const finalData = {
          ...data,
          tmtPrices: updatedPrices
        };
        delete finalData.currentPriceIndex; // Clean up temp data

        return {
          message: `✅ All TMT prices recorded

Now enter the project owner name:

Project Owner Name: ____

Enter the full name of the project owner/client`,
          nextStep: 'project_owner_input',
          data: finalData
        };
      }
    }

    // Handle project owner input
    if (step === 'project_owner_input') {
      if (!message || message.trim().length < 2) {
        return {
          message: 'Please enter a valid project owner name (minimum 2 characters)',
          nextStep: 'project_owner_input',
          data: data
        };
      }
      return {
        message: `📝 **Manual Project Entry**

Enter the project name and/or location:

Project Name/Location: ____

Example: "XYZ Apartments, Guwahati" or "ABC Complex, Ganeshguri"`,
        nextStep: 'manual_project_input',
        data: { ...data, projectOwner: message }
      };
    }

    // Handle manual project input
    if (step === 'manual_project_input') {
      if (!message || message.trim().length < 2) {
        return {
          message: 'Please enter a valid project name/location (minimum 2 characters)',
          nextStep: 'manual_project_input',
          data: data
        };
      }

      return {
        message: `✅ Project: ${message} recorded

Enter estimated time of completion:

Estimated Time of Completion: ____ years

Enter in years (e.g., 1, 2, 3, 5)`,
        nextStep: 'completion_time_input',
        data: { ...data, projectName: message }
      };
    }

    // Handle completion time input
    if (step === 'completion_time_input') {
      const years = parseInt(message);
      if (isNaN(years) || years <= 0) {
        return {
          message: 'Please enter a valid number of years (e.g., 1, 2, 3, 5)',
          nextStep: 'completion_time_input',
          data: data
        };
      }

      return {
        message: `✅ Completion time: ${years} years recorded

Enter your contact number:

Contact Number of Sales Rep: ____

Enter your 10-digit mobile number`,
        nextStep: 'sales_contact_input',
        data: { ...data, completionTime: years }
      };
    }

    // Handle sales contact input
    if (step === 'sales_contact_input') {
      const phone = message.replace(/\s+/g, '');
      if (!/^\d{10}$/.test(phone)) {
        return {
          message: 'Please enter a valid 10-digit mobile number',
          nextStep: 'sales_contact_input',
          data: data
        };
      }

      let summaryMessage = `✅ **Sales Record Complete!**

Thank you for providing your sales information. Your record has been successfully saved.

📊 **Summary:**
`;

      if (data.salesType === 'cement') {
        summaryMessage += `🏗️ Cement: ${data.cementQty} bags @ ₹${data.cementPrice}/bag`;
      } else if (data.salesType === 'tmt') {
        summaryMessage += `🔧 TMT: ${Object.entries(data.tmtQuantities).map(([size, qty]) => `${size}: ${qty}kg @ ₹${data.tmtPrices[size]}/kg`).join(', ')}`;
      } else if (data.salesType === 'both') {
        summaryMessage += `🏗️ Cement: ${data.cementQty} bags @ ₹${data.cementPrice}/bag\n🔧 TMT: ${Object.entries(data.tmtQuantities).map(([size, qty]) => `${size}: ${qty}kg @ ₹${data.tmtPrices[size]}/kg`).join(', ')}`;
      }

      summaryMessage += `
👤 Owner: ${data.projectOwner}
🏗️ Project: ${data.projectName}
⏱️ Completion: ${data.completionTime} years
📱 Contact: ${phone}

Type /start to record another sale.`;

      return {
        message: summaryMessage,
        nextStep: 'completed',
        action: 'create_sales_record',
        data: { ...data, contactNumber: phone }
      };
    }

    // ========== END SALES RECORDS FLOW ==========

    // Default response
    return {
      message: `I didn't understand that. Type /start to begin again.`,
      nextStep: 'user_type'
    };
  }
}

export const conversationFlowB = new ConversationFlowB();