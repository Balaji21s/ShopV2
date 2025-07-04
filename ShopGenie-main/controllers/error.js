exports.get404 = (req, res, next) => {
  res.status(404).render('404', {
    title: 'Page Not Found',
    path: '/404',
    isAuthenticated: req.session?.isLoggedIn || false,
    csrfToken: req.csrfToken?.() || ''
  });
};


exports.get500 = (error, req, res, next) => {
  console.error('[500 ERROR]', error);

  res.status(500).render('500', {
    title: 'Unexpected Error',
    path: '/500',
    isAuthenticated: req.session?.isLoggedIn || false, // ✅ Manual fallback
    csrfToken: req.csrfToken?.() || '' // ✅ Safe fallback if middleware skipped
  });
};
