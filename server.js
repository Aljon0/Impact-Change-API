import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import Stripe from 'stripe';

// Load environment variables
dotenv.config();

if (fs.existsSync('.env')) {
    dotenv.config();
    console.log(' Loaded local .env file');
  } else {
    console.log(' No .env file found, relying on Render environment variables');
  }
// Check if Stripe key is loaded
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY not found in environment variables');
  console.log('Available env vars:', Object.keys(process.env).filter(key => key.includes('STRIPE')));
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

// Simple CORS and middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Create payment intent - SIMPLE VERSION
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body;
    
    console.log('Creating payment intent for $', amount);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log('Success! Payment intent created:', paymentIntent.id);

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send({ error: error.message });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});