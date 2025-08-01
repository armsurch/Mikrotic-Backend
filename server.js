require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS Configuration for Security ---
// Only allow requests from the frontend URL specified in your .env file
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'https://mikrotest.vercel.app/'
};

// --- MIDDLEWARE ---
app.use(cors(corsOptions));

// --- API ENDPOINTS ---
app.use('/api', apiRoutes);

app.listen(PORT, () => {
    console.log(`MikroTik Hotspot Backend listening on port ${PORT}`);
});