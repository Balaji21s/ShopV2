require('dotenv').config(); // ✅ Load .env first

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDbSessionStore = require('connect-mongodb-session')(session);
const csrf = require('csurf');
const flash = require('connect-flash');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const adminRoutes = require('./routes/admin');
const shopRoutes = require('./routes/shop');
const authRoutes = require('./routes/auth');

const errorController = require('./controllers/error');
const User = require('./models/user');
const { forwardError } = require('./utils');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shopping';

const app = express();

// ✅ Ensure "images" directory exists
const imageDir = path.join(__dirname, 'images');
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir);
}

// ✅ Setup session store
const store = new MongoDbSessionStore({
  uri: MONGODB_URI,
  collection: 'sessions'
});

// ✅ Multer config for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'images'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/png', 'image/jpg', 'image/jpeg'];
  cb(null, allowedTypes.includes(file.mimetype));
};

// ✅ View engine
app.set('view engine', 'ejs');
app.set('views', 'views');

// ✅ Log to access.log
const accessLogStream = fs.createWriteStream(
  path.join(__dirname, 'access.log'),
  { flags: 'a' }
);

// ✅ Middleware setup
app.use(helmet());
app.use(compression());
app.use(morgan('combined', { stream: accessLogStream }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(multer({ storage, fileFilter }).single('image'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// ✅ Session and flash
app.use(session({
  secret: 'my secret', // 🔐 In production, use process.env.SESSION_SECRET
  resave: false,
  saveUninitialized: false,
  store
}));
const csrfExclude = ['/create-order', '/check-status'];
app.use((req, res, next) => {
  if (csrfExclude.includes(req.path)) return next();
  csrf()(req, res, next);
});
app.use(flash());

// ✅ Set CSRF & auth state for views
app.use((req, res, next) => {
  try {
    res.locals.csrfToken = req.csrfToken();
  } catch {
    res.locals.csrfToken = '';
  }
  res.locals.isAuthenticated = req.session?.isLoggedIn || false;
  next();
});

// ✅ Attach user to request
app.use((req, res, next) => {
  if (!req.session.user) return next();
  User.findById(req.session.user._id)
    .then(user => {
      if (!user) return next();
      req.user = user;
      next();
    })
    .catch(err => forwardError(err, next));
});
app.use(express.json());

// ✅ Route usage
app.use('/admin', adminRoutes);
app.use(shopRoutes);
app.use(authRoutes);

// ✅ 404 and 500 error handling
app.use(errorController.get404);

// Replace with safer version:
app.use((error, req, res, next) => {
  console.error('❌ Uncaught error:', error);
  res.status(500).render('500', {
    title: 'Unexpected Error',
    path: '/500',
    isAuthenticated: req.session?.isLoggedIn || false
  });
});

// ✅ Connect to DB and start server
mongoose
  .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('✅ Connected to MongoDB');
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`🚀 Server running at http://localhost:${port}`);
    });
  })
  .catch(err => console.error('❌ DB connection error:', err));


