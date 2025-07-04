const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { validationResult } = require('express-validator');
const User = require('../models/user');
const { forwardError, getErrorMessage } = require('../utils');

require('dotenv').config();

// Updated transporter configuration for better email authentication
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS // Make sure this is an App Password for Gmail
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test email connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Email configuration error:', error);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

exports.getLogin = (req, res) => {
  res.render('auth/login', {
    title: 'Login',
    path: '/login',
    errorMessage: getErrorMessage(req),
    oldInput: { email: '', password: '' },
    validationErrors: []
  });
};

exports.postLogin = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('auth/login', {
      title: 'Login',
      path: '/login',
      errorMessage: errors.array()[0].msg,
      oldInput: req.body,
      validationErrors: errors.array()
    });
  }

  User.findOne({ email: req.body.email })
    .then(user => {
      if (!user) {
        return res.status(422).render('auth/login', {
          title: 'Login',
          path: '/login',
          errorMessage: 'Invalid email or password.',
          oldInput: req.body,
          validationErrors: [{ param: 'email' }, { param: 'password' }]
        });
      }

      return bcrypt.compare(req.body.password, user.password)
        .then(doMatch => {
          if (doMatch) {
            req.session.user = user;
            req.session.isLoggedIn = true;
            return req.session.save(err => {
              if (err) console.log(err);
              res.redirect('/');
            });
          }
          req.flash('error', 'Invalid email or password.');
          res.redirect('/login');
        });
    })
    .catch(err => forwardError(err, next));
};

exports.getSignup = (req, res) => {
  res.render('auth/signup', {
    title: 'Signup',
    path: '/signup',
    errorMessage: getErrorMessage(req),
    oldInput: { email: '', password: '', confirmPassword: '' },
    validationErrors: []
  });
};

exports.postSignup = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('auth/signup', {
      title: 'Signup',
      path: '/signup',
      errorMessage: errors.array()[0].msg,
      oldInput: req.body,
      validationErrors: errors.array()
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 12);
    const user = new User({
      email: req.body.email,
      password: hashedPassword,
      cart: { products: [] }
    });
    await user.save();

    // Added error handling for email sending
    try {
      await transporter.sendMail({
        to: req.body.email,
        from: process.env.SMTP_USER,
        subject: 'Signup Success',
        html: '<h1>You successfully signed up!</h1>'
      });
      console.log('✅ Signup email sent successfully');
    } catch (emailError) {
      console.log('❌ Email sending failed:', emailError.message);
      // Continue with signup even if email fails
    }

    res.redirect('/login');
  } catch (err) {
    forwardError(err, next);
  }
};

exports.postLogout = (req, res) => {
  req.session.destroy(err => {
    if (err) console.log(err);
    res.redirect('/');
  });
};

// GET /reset - Show password reset request form
exports.getReset = (req, res) => {
  res.render('auth/reset', {
    pageTitle: 'Reset Password',
    path: '/reset',
    errorMessage: req.flash('error')[0],
    successMessage: null,
    csrfToken: req.csrfToken(),
    step: undefined, // Initial form load - no step
    oldInput: { email: '' },
    email: ''
  });
};

// POST /reset - Handle password reset request
exports.postReset = (req, res, next) => {
  crypto.randomBytes(32, async (err, buffer) => {
    if (err) {
      console.log('[RESET] Token generation error:', err);
      return res.render('auth/reset', {
        pageTitle: 'Reset Password',
        path: '/reset',
        errorMessage: 'Something went wrong. Please try again.',
        successMessage: null,
        csrfToken: req.csrfToken(),
        step: undefined,
        oldInput: req.body,
        email: ''
      });
    }

    const token = buffer.toString('hex');
    try {
      const user = await User.findOne({ email: req.body.email });
      if (!user) {
        return res.render('auth/reset', {
          pageTitle: 'Reset Password',
          path: '/reset',
          errorMessage: 'No account with that email address found.',
          successMessage: null,
          csrfToken: req.csrfToken(),
          step: undefined,
          oldInput: req.body,
          email: ''
        });
      }

      user.resetToken = token;
      user.resetTokenExpiration = Date.now() + 3600000;
      await user.save();

      // Send reset email
      try {
        await transporter.sendMail({
          to: req.body.email,
          from: process.env.SMTP_USER,
          subject: 'Password Reset',
          html: `
            <p>You requested a password reset</p>
            <p>Click this <a href="http://localhost:3000/reset/${token}">link</a> to reset your password.</p>
            <p>This link will expire in 1 hour.</p>
          `
        });
        console.log('✅ Reset email sent successfully');

        // SUCCESS: Render with confirmed step to show popup
        res.render('auth/reset', {
          pageTitle: 'Reset Password',
          path: '/reset',
          errorMessage: null,
          successMessage: null,
          csrfToken: req.csrfToken(),
          step: 'confirmed', // This triggers the success popup
          oldInput: { email: '' },
          email: req.body.email
        });

      } catch (emailError) {
        console.log('❌ Reset email sending failed:', emailError.message);
        res.render('auth/reset', {
          pageTitle: 'Reset Password',
          path: '/reset',
          errorMessage: 'Password reset email could not be sent. Please try again.',
          successMessage: null,
          csrfToken: req.csrfToken(),
          step: undefined,
          oldInput: req.body,
          email: ''
        });
      }

    } catch (err) {
      console.log('[RESET] Database error:', err);
      res.render('auth/reset', {
        pageTitle: 'Reset Password',
        path: '/reset',
        errorMessage: 'Something went wrong. Please try again.',
        successMessage: null,
        csrfToken: req.csrfToken(),
        step: undefined,
        oldInput: req.body,
        email: ''
      });
    }
  });
};

exports.getNewPassword = (req, res, next) => {
  const token = req.params.token;
  console.log('[DEBUG] /reset/:token route hit. Token =', token);

  User.findOne({
    resetToken: token,
    resetTokenExpiration: { $gt: Date.now() }
  })
    .then(user => {
      if (!user) {
        console.log('[DEBUG] Invalid or expired token.');
        return res.render('auth/reset', {
          pageTitle: 'Reset Password',
          path: '/reset',
          errorMessage: 'Password reset token is invalid or expired.',
          successMessage: null,
          csrfToken: req.csrfToken(),
          step: undefined,
          oldInput: { email: '' },
          email: ''
        });
      }

      console.log('[DEBUG] Token valid. Rendering password reset form for:', user.email);
      res.render('auth/new-password', {
        title: 'New Password',
        path: '/new-password',
        errorMessage: getErrorMessage(req),
        userId: user._id.toString(),
        passwordToken: token,
        csrfToken: req.csrfToken()
      });
    })
    .catch(err => {
      console.error('[ERROR] Unexpected in getNewPassword:', err);
      forwardError(err, next);
    });
};

exports.postNewPassword = (req, res, next) => {
  const { password, userId, passwordToken } = req.body;
  let resetUser;

  User.findOne({
    resetToken: passwordToken,
    resetTokenExpiration: { $gt: Date.now() },
    _id: userId
  })
    .then(user => {
      if (!user) throw new Error('Invalid token or user not found');
      resetUser = user;
      return bcrypt.hash(password, 12);
    })
    .then(hashedPassword => {
      resetUser.password = hashedPassword;
      resetUser.resetToken = null;
      resetUser.resetTokenExpiration = undefined;
      return resetUser.save();
    })
    .then(() => {
      // SUCCESS: Show reset success popup
      res.render('auth/reset', {
        pageTitle: 'Password Reset Complete',
        path: '/reset',
        errorMessage: null,
        successMessage: null,
        csrfToken: req.csrfToken(),
        step: 'reset-success', // This triggers the success popup
        oldInput: { email: '' },
        email: ''
      });
    })
    .catch(err => {
      console.log('[RESET] Password update error:', err);
      res.render('auth/reset', {
        pageTitle: 'Reset Password',
        path: '/reset',
        errorMessage: 'Failed to reset password. Please try again.',
        successMessage: null,
        csrfToken: req.csrfToken(),
        step: undefined,
        oldInput: { email: '' },
        email: ''
      });
    });
};
