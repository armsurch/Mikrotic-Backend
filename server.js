require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { RouterOSClient } = require('node-routeros');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS Configuration for Security ---
const corsOptions = {
  origin: process.env.FRONTEND_URL // Only allow requests from the URL specified in your .env file
};

// --- MIDDLEWARE ---
app.use(cors(corsOptions)); // Enable CORS for a specific origin

// --- CONFIGURATION (from .env file) ---
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const MIKROTIK_HOST = process.env.MIKROTIK_HOST;
const MIKROTIK_USER = process.env.MIKROTIK_USER;
const MIKROTIK_PASSWORD = process.env.MIKROTIK_PASSWORD;
const FRONTEND_URL = process.env.FRONTEND_URL || https://mikrotest.vercel.app/';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// --- DATA (In a real app, this would come from a database) ---
const plans = [
    { id: 'plan_1h', name: '1 Hour Plan', duration: '1 Hour', price: 100, description: 'Perfect for a quick session.', icon: 'clock', profileName: '1-hour-profile', limitUptime: '1h' },
    { id: 'plan_24h', name: 'Daily Plan', duration: '24 Hours', price: 500, description: 'All-day access for heavy users.', icon: 'calendar', profileName: '24-hour-profile', limitUptime: '24h' },
    { id: 'plan_30d', name: 'Monthly Plan', duration: '30 Days', price: 3000, description: 'Best value for long-term use.', icon: 'rocket', profileName: '30-day-profile', limitUptime: '30d' }
];

/**
 * In-memory store to prevent replay attacks.
 * A database (like Redis or PostgreSQL) is recommended for production.
 */
const processedTransactions = new Set();

/**
 * Generates a unique voucher code.
 * In a real app, ensure this is truly unique.
 */
function generateVoucherCode() {
    const prefix = 'NET-';
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${randomPart}`;
}

/**
 * Adds the generated voucher to the MikroTik hotspot.
 * This is the real implementation.
 */
async function addVoucherToMikroTik(voucherCode, plan) {
    console.log(`Adding voucher ${voucherCode} for plan ${plan.name} to MikroTik.`);
    const client = new RouterOSClient({
        host: MIKROTIK_HOST,
        user: MIKROTIK_USER,
        password: MIKROTIK_PASSWORD,
        port: 8728, // Ensure your API port is correct
    });
    await client.connect();
    await client.write('/ip/hotspot/user/add', [
        `=name=${voucherCode}`,
        `=password=${voucherCode}`, // Using the same code for username and password
        `=profile=${plan.profileName}`,
        `=limit-uptime=${plan.limitUptime}`
    ]);
    await client.close();
    return true; // Indicate success
}

/**
 * Sends the voucher via WhatsApp.
 * This is the real implementation for the WhatsApp Cloud API.
 */
async function sendWhatsAppVoucher(whatsappNumber, voucherCode) {
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        console.warn("WhatsApp credentials not set in .env file. Skipping message send.");
        return; // Don't block the process if WhatsApp isn't configured
    }

    const message = `Welcome! Your Wi-Fi voucher is: *${voucherCode}*\n\nUse this code as both username and password to log in. Enjoy your internet access!`;
    const apiUrl = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    try {
        console.log(`Sending voucher ${voucherCode} to WhatsApp number ${whatsappNumber}.`);
        await axios.post(apiUrl, {
            messaging_product: "whatsapp",
            to: whatsappNumber,
            type: "text",
            text: {
                preview_url: false,
                body: message
            }
        }, {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log("WhatsApp message sent successfully.");
    } catch (error) {
        console.error("Failed to send WhatsApp message:", error.response ? error.response.data : error.message);
        // Do not block the main process if WhatsApp fails, but log the error.
        // In a production system, you might add this to a retry queue.
    }
}

// --- API ENDPOINTS ---

app.get('/api/plans', (req, res) => {
    res.json(plans);
});


// The core verification endpoint
app.get('/api/verify-payment', async (req, res) => {
    const { ref } = req.query;

    if (!ref) {
        return res.redirect(`${FRONTEND_URL}/error.html`);
    }

    try {
        // 1. Verify transaction with Paystack
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${ref}`, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
            }
        });

        const { status, data } = response.data;

        // 2. Check if payment was successful
        if (status && data.status === 'success') {
            // 3. CRITICAL: Check if this transaction has already been processed
            if (processedTransactions.has(ref)) {
                console.warn(`Attempt to reuse already processed transaction: ${ref}`);
                // Redirect to an error page indicating the issue
                return res.redirect(`${FRONTEND_URL}/error.html?reason=used_reference`);
            }

            const { plan_id, whatsapp_number } = data.metadata;
            // Find the plan details from our plans array
            const planDetails = plans.find(p => p.id === plan_id);

            if (!planDetails) {
                console.error(`Invalid plan_id received from payment metadata: ${plan_id}`);
                return res.redirect(`${FRONTEND_URL}/error.html`);
            }

            let voucherCode;
            try {
                // 4. Generate and add voucher to MikroTik
                voucherCode = generateVoucherCode();
                await addVoucherToMikroTik(voucherCode, planDetails);

                // 5. Send WhatsApp notification
                await sendWhatsAppVoucher(whatsapp_number, voucherCode);

                // 6. Mark transaction as processed and redirect to success
                processedTransactions.add(ref);
                return res.redirect(`${FRONTEND_URL}/success.html?voucher=${voucherCode}`);

            } catch (integrationError) {
                console.error("Error during MikroTik/WhatsApp integration:", integrationError);
                // TODO: Here you should implement a retry mechanism or alert an admin,
                // as the customer has paid but not received their service.
                return res.redirect(`${FRONTEND_URL}/error.html?reason=integration_failed`);
            }
        } else {
            // Payment failed or status is not 'success'
            return res.redirect(`${FRONTEND_URL}/error.html`);
        }

    } catch (error) {
        console.error("Verification Error:", error);
        return res.redirect(`${FRONTEND_URL}/error.html`);
    }
});


app.listen(PORT, () => {
    console.log(`MikroTik Hotspot Backend listening on port ${PORT}`);
});