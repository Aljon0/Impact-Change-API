import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import nodemailer from 'nodemailer';
import path from 'path';
import Stripe from 'stripe';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (fs.existsSync('.env')) {
    dotenv.config();
    console.log('✅ Loaded local .env file');
} else {
    console.log('ℹ️ No .env file found, relying on Render environment variables');
}

// Check if Stripe key is loaded
if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌ STRIPE_SECRET_KEY not found in environment variables');
    console.log('Available env vars:', Object.keys(process.env).filter(key => key.includes('STRIPE')));
    process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

// CORS configuration - more permissive for development
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Allow all origins in development
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        
        // In production, you might want to restrict to specific domains
        callback(null, true);
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (for the logo)
app.use(express.static(__dirname));


// Helper function to format billing address
const formatBillingAddress = (paymentData) => {
    if (!paymentData || !paymentData.address) return '';
    
    const { line1, line2, city, state, postal_code, country } = paymentData.address;
    let address = line1 || '';
    if (line2) address += `, ${line2}`;
    if (city) address += `, ${city}`;
    if (state) address += `, ${state}`;
    if (postal_code) address += ` ${postal_code}`;
    if (country) address += `, ${country}`;
    
    return address;
};

// Create nodemailer transporter with better error handling
const createEmailTransporter = () => {
    try {
        // Check if we have custom SMTP configuration
        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            console.log('Using custom SMTP configuration');
            return nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });
        }
        
        // Fallback to Gmail
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            console.log('Using Gmail configuration');
            return nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });
        }
        
        // If no email configuration found, create a test transporter
        console.log('No email configuration found, using test mode');
        return nodemailer.createTransport({
            host: 'localhost',
            port: 1025,
            secure: false,
            auth: null,
            tls: {
                rejectUnauthorized: false
            }
        });
        
    } catch (error) {
        console.error('Error creating email transporter:', error);
        throw error;
    }
};

// Generate order number
const generateOrderNumber = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `ORD-${timestamp}-${random}`;
};

// Generate HTML email template - UPDATED VERSION WITH LOGO
const generateEmailHTML = (orderData) => {
  const {
      selectedService,
      paymentData,
      orderNumber,
      orderDate,
      calculateTotal
  } = orderData;

  const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
      });
  };

  const total = calculateTotal();
  
  // Get the base URL for the logo
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4242}`;
  const logoUrl = `${baseUrl}/images/ImpactChange.png`;

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmation - Impact Change</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px;">
          
          <!-- Logo/Header -->
          <div style="text-align: center; margin-bottom: 30px;">
              <img src="${logoUrl}" alt="Impact Change" style="max-height: 50px; max-width: 200px; display: block; margin: 0 auto;" onerror="this.style.display='none';" />
          </div>

          <!-- Main Title -->
          <div style="text-align: center; margin-bottom: 40px;">
              <h1 style="color: #333; font-size: 24px; margin: 0; font-weight: bold;">
                  Your Order is Confirmed!
              </h1>
          </div>

          <!-- Greeting -->
          <div style="margin-bottom: 30px;">
              <p style="color: #999; font-size: 16px; margin: 0 0 10px 0;">
                  Hi ${paymentData?.name || '[Client Name]'},
              </p>
              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
                  Thank you for your order! We have finished processing it and are excited to get started.
              </p>
          </div>

          <!-- Invoice Details Box -->
          <div style="border: 1px solid #ddd; padding: 20px; margin-bottom: 30px;">
              <h3 style="color: #333; font-size: 16px; margin: 0 0 15px 0; font-weight: bold;">
                  Invoice & Order Details
              </h3>
              
              <p style="color: #666; font-size: 14px; margin: 0 0 5px 0;">
                  <strong>Order Number:</strong> ${orderNumber}
              </p>
              <p style="color: #666; font-size: 14px; margin: 0 0 20px 0;">
                  <strong>Order Date:</strong> ${formatDate(orderDate)}
              </p>

              <!-- Product/Service Table -->
              <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                      <tr style="border-bottom: 1px solid #ddd;">
                          <th style="text-align: left; padding: 10px 0; color: #666; font-size: 14px; font-weight: bold;">
                              Product / Service
                          </th>
                          <th style="text-align: right; padding: 10px 0; color: #666; font-size: 14px; font-weight: bold;">
                              Price
                          </th>
                      </tr>
                  </thead>
                  <tbody>
                      <tr>
                          <td style="padding: 15px 0; border-bottom: 1px solid #eee;">
                              <span style="color: #666; font-size: 14px;">${selectedService?.name || '[Service Name]'}</span>
                          </td>
                          <td style="text-align: right; padding: 15px 0; border-bottom: 1px solid #eee;">
                              <span style="color: #666; font-size: 14px;">$${selectedService?.price || '[Amount]'}</span>
                          </td>
                      </tr>
                  </tbody>
              </table>

              <!-- Totals -->
              <div style="margin-top: 20px;">
                  <table style="width: 100%;">
                      <tr>
                          <td style="text-align: right; padding: 5px 0;">
                              <span style="color: #666; font-size: 14px;">Subtotal:</span>
                          </td>
                          <td style="text-align: right; padding: 5px 0; width: 80px;">
                              <span style="color: #666; font-size: 14px;">$${total}</span>
                          </td>
                      </tr>
                      <tr>
                          <td style="text-align: right; padding: 10px 0; border-top: 1px solid #333;">
                              <span style="color: #333; font-size: 16px; font-weight: bold;">Total:</span>
                          </td>
                          <td style="text-align: right; padding: 10px 0; border-top: 1px solid #333; width: 80px;">
                              <span style="color: #333; font-size: 16px; font-weight: bold;">$${total}</span>
                          </td>
                      </tr>
                  </table>
              </div>
          </div>

          <!-- Next Steps -->
          <div style="margin-bottom: 40px;">
              <h3 style="color: #333; font-size: 16px; margin: 0 0 15px 0; font-weight: bold;">
                  Next Steps
              </h3>
              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
                  Our team is now beginning work on your project. The estimated delivery time is <strong>one week</strong>. We will reach out if we have any questions and will send you an update midway through the process.
              </p>
          </div>

          <!-- Footer -->
          <div style="text-align: center; margin-top: 40px;">
              <p style="color: #666; font-size: 14px; margin: 0 0 5px 0;">
                  Thank you for your business!
              </p>
              <p style="color: #999; font-size: 12px; margin: 0 0 10px 0;">
                  The Impact Change Team
              </p>
              <p style="color: #999; font-size: 12px; margin: 0;">
                  www.impactchange.com
              </p>
          </div>
      </div>
  </body>
  </html>
  `;
};

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Create payment intent
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

// Send invoice email
app.post('/send-invoice-email', async (req, res) => {
    try {
        console.log('Received invoice email request:', JSON.stringify(req.body, null, 2));

        const {
            selectedService,
            paymentData,
            paymentIntentId,
            orderNumber,
            orderDate
        } = req.body;

        console.log('Sending invoice email to:', paymentData?.email);

        // Validate required fields
        if (!selectedService || !paymentData?.email) {
            return res.status(400).json({
                error: 'Missing required fields: selectedService or paymentData.email',
                receivedData: {
                    hasSelectedService: !!selectedService,
                    hasPaymentData: !!paymentData,
                    hasEmail: !!paymentData?.email
                }
            });
        }

        // Generate order number if not provided
        const finalOrderNumber = orderNumber || generateOrderNumber();
        const finalOrderDate = orderDate || new Date().toISOString();

        // Calculate total
        const calculateTotal = () => selectedService.price || 0;

        // Prepare order data
        const orderData = {
            selectedService,
            paymentData,
            paymentIntentId,
            orderNumber: finalOrderNumber,
            orderDate: finalOrderDate,
            calculateTotal
        };

        // Create email transporter
        const transporter = createEmailTransporter();

        // Generate email HTML
        const emailHTML = generateEmailHTML(orderData);

        // Email options
        const mailOptions = {
            from: process.env.EMAIL_FROM || `"Impact Change" <${process.env.EMAIL_USER || 'noreply@impactchange.com'}>`,
            to: paymentData.email,
            subject: `Order Confirmation #${finalOrderNumber} - Impact Change`,
            html: emailHTML,
            // Optional: Add plain text version
            text: `
Thank you for your order #${finalOrderNumber}!

Service: ${selectedService.name}
Category: ${selectedService.categoryName || selectedService.category}
Total: $${calculateTotal()}

Our team will begin work on your project and deliver within one week.

Payment Reference: ${paymentIntentId || 'N/A'}

Thank you for choosing Impact Change!
            `.trim()
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        
        console.log('Email sent successfully:', info.messageId);
        console.log('Preview URL:', nodemailer.getTestMessageUrl(info));

        res.json({
            success: true,
            messageId: info.messageId,
            orderNumber: finalOrderNumber,
            previewUrl: nodemailer.getTestMessageUrl(info)
        });

    } catch (error) {
        console.error('Error sending invoice email:', error);
        res.status(500).json({
            error: 'Failed to send invoice email',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Test email configuration
app.post('/test-email', async (req, res) => {
    try {
        const transporter = createEmailTransporter();
        
        // Verify transporter configuration
        await transporter.verify();
        
        res.json({ 
            success: true, 
            message: 'Email configuration is valid',
            service: transporter.options.service || transporter.options.host
        });
        
    } catch (error) {
        console.error('Email configuration error:', error);
        res.status(500).json({
            error: 'Email configuration failed',
            details: error.message,
            service: process.env.SMTP_HOST || 'gmail'
        });
    }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    console.log(`📧 Email service: ${process.env.EMAIL_USER || process.env.SMTP_USER ? 'Configured' : 'Not configured'}`);
    if (!process.env.EMAIL_USER && !process.env.SMTP_USER) {
        console.log('⚠️  Email not configured. Set EMAIL_USER/EMAIL_PASS or SMTP_HOST/SMTP_USER/SMTP_PASS environment variables');
    }
});