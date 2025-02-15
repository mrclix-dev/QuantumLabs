function authenticateAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    const base64Credentials = authHeader && authHeader.split(' ')[1];
    const credentials = base64Credentials && Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials ? credentials.split(':') : [];
  
    if (username === 'user' && password === 'password') {
      return next();
    }
  
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
    res.status(401).send('Access denied');
  }
  
  module.exports = authenticateAdmin;
  