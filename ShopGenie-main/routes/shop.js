// routes/shop.js
const express = require('express');
const shopController = require('../controllers/shop');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

router.get('/', shopController.getIndex);
router.get('/products', shopController.getProducts);
router.get('/products/:productId', shopController.getProduct);

router.get('/cart', isAuth, shopController.getCart);
router.post('/cart', isAuth, shopController.postCart);
router.post('/cart-delete-item', isAuth, shopController.postCartDeleteProduct);

router.get('/checkout', isAuth, shopController.getCheckout);
router.get('/checkout/success', isAuth, shopController.getCheckoutSuccess);

router.get('/orders', isAuth, shopController.getOrders);
router.get('/orders/:orderId', isAuth, shopController.getInvoice);
router.post('/create-order', isAuth, async (req, res) => {
  const axios = require('axios');

  const payload = {
    customer_details: {
      customer_email: req.body.email,
      customer_name: req.body.name,
      customer_phone: req.body.phone
    },
    link_amount: parseFloat(req.body.amount || 0).toFixed(2),
    link_currency: "INR",
    link_purpose: "Cart Checkout",
    link_expiry_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    link_notify: {
      send_email: true,
      send_sms: false
    },
    link_auto_reminders: true,
    link_partial_payments: false,
    link_meta: {
      return_url: "http://localhost:3000/checkout/success"
    }
  };
  console.log("✅ Final Payload:", payload); 

  try {
    const response = await axios.post(
      'https://sandbox.cashfree.com/pg/links',
      payload,
      {
        headers: {
          "x-api-version": "2023-08-01",
          "x-client-id": process.env.CF_APP_ID,
          "x-client-secret": process.env.CF_SECRET_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      upi_link: response.data.link_url,
      order_id: response.data.link_id
    });

  } catch (err) {
    // 🛠 Add this:
    console.error("Cashfree error response:", err.response?.data || err.message);
    res.json({ error: err.response?.data?.message || err.message });
  }
});



module.exports = router;
