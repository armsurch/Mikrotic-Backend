require('dotenv').config();
const express = require('express');
const axios = require('axios');
// const RouterOSClient = require('node-routeros').RouterOSClient; // MikroTik client library

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION (from .env file) ---
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const MIKROTIK_HOST = process.env.MIKROTIK_HOST;
const MIKROTIK_USER = process.env.MIKROTIK_USER;
const MIKROTIK_PASSWORD = process.env.MIKROTIK_PASSWORD;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://your-hotspot-domain';

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
 * This is a placeholder for the actual MikroTik API call.
 */
async function addVoucherToMikroTik(voucherCode, plan) {
    console.log(`Adding voucher ${voucherCode} for plan ${plan.name} to MikroTik.`);
    // Example using node-routeros library:
    // const client = new RouterOSClient({ host: MIKROTIK_HOST, user: MIKROTIK_USER, password: MIKROTIK_PASSWORD });
    // await client.connect();
    // await client.write('/ip/hotspot/user/add', [
    //     `=name=${voucherCode}`,
    //     `=password=${voucherCode}`,
    //     `=profile=${plan.profileName}`, // e.g., '1-hour-profile'
    //     `=limit-uptime=${plan.duration}` // e.g., '1h' or '24h'
    // ]);
    // await client.close();
    return true; // Indicate success
}

/**
 * Sends the voucher via WhatsApp.
 * Placeholder for WhatsApp Cloud API call.
 */
async function sendWhatsAppVoucher(whatsappNumber, voucherCode) {
    console.log(`Sending voucher ${voucherCode} to WhatsApp number ${whatsappNumber}.`);
    // Logic to call WhatsApp API would go here.
    return true;
}


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

        // 2. Check if payment was successful and not already used
        if (status && data.status === 'success') {
            // TODO: Add logic to check if this transaction reference has been used before (check your DB)

            const { plan_id, whatsapp_number } = data.metadata;
            // TODO: Fetch plan details from your DB using plan_id
            const planDetails = { name: 'Daily Plan', profileName: '24-hour-profile', duration: '24h' };

            // 3. Generate and add voucher
            const voucherCode = generateVoucherCode();
            await addVoucherToMikroTik(voucherCode, planDetails);

            // 4. Send WhatsApp notification
            await sendWhatsAppVoucher(whatsapp_number, voucherCode);

            // 5. Redirect to success page with the voucher
            return res.redirect(`${FRONTEND_URL}/success.html?voucher=${voucherCode}`);
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