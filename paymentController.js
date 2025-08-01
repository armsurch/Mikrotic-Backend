const axios = require('axios');
const { RouterOSClient } = require('node-routeros');
const { plans, processedTransactions } = require('../database');

// --- CONFIGURATION (from .env file) ---
const {
    PAYSTACK_SECRET_KEY,
    MIKROTIK_HOST,
    MIKROTIK_USER,
    MIKROTIK_PASSWORD,
    FRONTEND_URL,
    WHATSAPP_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID
} = process.env;

// --- HELPER FUNCTIONS ---

function generateVoucherCode() {
    const prefix = 'NET-';
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${randomPart}`;
}

async function addVoucherToMikroTik(voucherCode, plan) {
    console.log(`Adding voucher ${voucherCode} for plan ${plan.name} to MikroTik.`);
    const client = new RouterOSClient({
        host: MIKROTIK_HOST,
        user: MIKROTIK_USER,
        password: MIKROTIK_PASSWORD,
        port: 8728,
    });
    await client.connect();
    await client.write('/ip/hotspot/user/add', [
        `=name=${voucherCode}`,
        `=password=${voucherCode}`,
        `=profile=${plan.profileName}`,
        `=limit-uptime=${plan.limitUptime}`
    ]);
    await client.close();
}

async function sendWhatsAppVoucher(whatsappNumber, voucherCode) {
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        console.warn("WhatsApp credentials not set. Skipping message send.");
        return;
    }

    const message = `Welcome! Your Wi-Fi voucher is: *${voucherCode}*\n\nUse this code as both username and password to log in. Enjoy your internet access!`;
    const apiUrl = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    try {
        console.log(`Sending voucher ${voucherCode} to WhatsApp number ${whatsappNumber}.`);
        await axios.post(apiUrl, {
            messaging_product: "whatsapp",
            to: whatsappNumber,
            type: "text",
            text: { preview_url: false, body: message }
        }, {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log("WhatsApp message sent successfully.");
    } catch (error) {
        console.error("Failed to send WhatsApp message:", error.response ? error.response.data : error.message);
    }
}

// --- MAIN CONTROLLER FUNCTION ---

const verifyPayment = async (req, res) => {
    const { ref } = req.query;

    if (!ref) {
        return res.redirect(`${FRONTEND_URL}/error.html`);
    }

    try {
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${ref}`, {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
        });

        const { status, data } = response.data;

        if (status && data.status === 'success') {
            if (processedTransactions.has(ref)) {
                console.warn(`Attempt to reuse already processed transaction: ${ref}`);
                return res.redirect(`${FRONTEND_URL}/error.html?reason=used_reference`);
            }

            const { plan_id, whatsapp_number } = data.metadata;
            const planDetails = plans.find(p => p.id === plan_id);

            if (!planDetails) {
                console.error(`Invalid plan_id received from payment metadata: ${plan_id}`);
                return res.redirect(`${FRONTEND_URL}/error.html`);
            }

            const expectedAmount = planDetails.price * 100;
            if (data.amount !== expectedAmount) {
                console.error(`SECURITY ALERT: Tampered amount detected for transaction ${ref}. Expected ${expectedAmount}, but received ${data.amount}.`);
                return res.redirect(`${FRONTEND_URL}/error.html?reason=tampered_amount`);
            }

            try {
                const voucherCode = generateVoucherCode();
                await addVoucherToMikroTik(voucherCode, planDetails);
                await sendWhatsAppVoucher(whatsapp_number, voucherCode);

                processedTransactions.add(ref);
                return res.redirect(`${FRONTEND_URL}/success.html?voucher=${voucherCode}`);

            } catch (integrationError) {
                console.error("Error during MikroTik/WhatsApp integration:", integrationError);
                return res.redirect(`${FRONTEND_URL}/error.html?reason=integration_failed`);
            }
        } else {
            return res.redirect(`${FRONTEND_URL}/error.html`);
        }

    } catch (error) {
        console.error("Verification Error:", error);
        return res.redirect(`${FRONTEND_URL}/error.html`);
    }
};

module.exports = { verifyPayment };