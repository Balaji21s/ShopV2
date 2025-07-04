const axios = require('axios');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const Product = require('../models/product');
const Order = require('../models/order');
const { fetchAllProducts, forwardError } = require('../utils');

// INDEX PAGE
exports.getIndex = (req, res, next) => {
  fetchAllProducts('shop/index', 'Shop', '/', req, res, next);
};

// PRODUCT LIST PAGE
exports.getProducts = (req, res, next) => {
  fetchAllProducts('shop/product-list', 'All Products', '/products', req, res, next);
};

// PRODUCT DETAILS PAGE
exports.getProduct = (req, res, next) => {
  Product.findById(req.params.productId)
    .then(product => {
      res.render('shop/product-detail', {
        title: product.title,
        path: '/products',
        product
      });
    })
    .catch(err => forwardError(err, next));
};

// CART PAGE
exports.getCart = (req, res, next) => {
  req.user
    .populate('cart.products.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.products;
      const totalPrice = products.reduce((sum, p) => sum + p.quantity * p.productId.price, 0);
      res.render('shop/cart', {
        title: 'Your Cart',
        path: '/cart',
        products,
        totalPrice
      });
    })
    .catch(err => forwardError(err, next));
};

// ADD TO CART
exports.postCart = (req, res, next) => {
  Product.findById(req.body.productId)
    .then(product => req.user.addToCart(product))
    .then(() => res.redirect('/cart'))
    .catch(err => forwardError(err, next));
};

// DELETE FROM CART
exports.postCartDeleteProduct = (req, res, next) => {
  req.user
    .deleteProductFromCart(req.body.productId)
    .then(() => res.redirect('/cart'))
    .catch(err => forwardError(err, next));
};

// CHECKOUT WITH CASHFREE
exports.getCheckout = async (req, res, next) => {
  try {
    const user = await req.user.populate('cart.products.productId').execPopulate();
    const products = user.cart.products;
    const totalPrice = products.reduce(
      (sum, p) => sum + p.quantity * p.productId.price,
      0
    );

    res.render('shop/checkout-form', {
      title: 'Checkout',
      path: '/checkout',
      totalPrice // ✅ this enables the EJS to fill the input
    });

  } catch (err) {
    forwardError(err, next);
  }
};


exports.getInvoice = (req, res, next) => {
  const orderId = req.params.orderId;

  Order.findById(orderId)
    .then(order => {
      if (!order) {
        return next(new Error('No order found.'));
      }

      if (order.user.userId.toString() !== req.user._id.toString()) {
        return next(new Error('Unauthorized'));
      }

      const invoiceName = `invoice-${orderId}.pdf`;
      const invoicePath = path.join('data', 'invoices', invoiceName);

      const pdfDoc = new PDFDocument();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${invoiceName}"`);

      pdfDoc.pipe(fs.createWriteStream(invoicePath));
      pdfDoc.pipe(res);

      pdfDoc.fontSize(26).text('Invoice', { underline: true });
      pdfDoc.text('--------------------------');
      let totalPrice = 0;
      order.products.forEach(p => {
        pdfDoc.fontSize(14).text(
          `${p.product.title} - ${p.quantity} x ₹${p.product.price}`
        );
        totalPrice += p.quantity * p.product.price;
      });
      pdfDoc.text('--------------------------');
      pdfDoc.fontSize(18).text(`Total Price: ₹${totalPrice}`);

      pdfDoc.end();
    })
    .catch(err => next(err));
};

exports.getOrders = (req, res, next) => {
  Order.find({ 'user.userId': req.user._id })
    .then(orders => {
      res.render('shop/orders', {
        title: 'Your Orders',
        path: '/orders',
        orders
      });
    })
    .catch(err => forwardError(err, next));
};



// AFTER PAYMENT SUCCESS
exports.getCheckoutSuccess = (req, res, next) => {
  req.user
    .populate('cart.products.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.products.map(p => ({
        product: { ...p.productId._doc },
        quantity: p.quantity
      }));

      return new Order({
        user: {
          email: req.user.email,
          userId: req.user
        },
        products
      });
    })
    .then(order => order.save())
    .then(() => req.user.clearCart())
    .then(() => res.redirect('/orders'))
    .catch(err => forwardError(err, next));
};


