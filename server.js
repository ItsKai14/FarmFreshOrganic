const express = require('express');
const session = require('express-session');
require('dotenv').config();
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const server = express();
const path = require('path');
const mysql = require('mysql2');
const flash = require('connect-flash');
const pdf = require('html-pdf');
const ejs = require('ejs');
const rateLimit = require('express-rate-limit');
const numberToWords = require('number-to-words');

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many requests, please try again later.'
});  


server.use(flash());

server.use(bodyParser.urlencoded({ extended: false }));
server.use(express.urlencoded({ extended: true }));
server.use(session({ secret: 'your_secret', resave: false, saveUninitialized: true }));
server.set('view engine', 'ejs');
server.set('views', path.join(__dirname, 'views'));

server.use(express.static(path.join(__dirname, 'public')));
server.use(bodyParser.json());

server.use(session({
  secret: 'dasjkbdjasbdjhkadsadasfddasd', // Change this to a strong random string
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// MySQL Operations
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Root.14.WXDS',
  database: 'organicfarm'
});

db.connect((err) => {
  if (err) {
    console.log('DB Connection Error:', err);
    return;
  }
  console.log('Connected to MySQL Database.');
});

// Rest API

// routers
server.get('/', (req, res) => {
  res.render('index', { username: req.session.username });
});

server.get('/home', (req, res) => {
  // Sample data to be passed to EJS
  const items = [
    { title: 'Vegetables', text: 'Get fresh Vegetables at your doorsteps', img: '/img/products/vegetables/Vegetables.png', url: '/products#vegetables' },
    { title: 'Fruits', text: 'Get fresh Fruits at your doorsteps', img: '/img/products/fruits/Fruits.png', url: '/products#fruits' },
    { title: 'Seeds', text: 'Try growing crops yourself', img: '/img/products/seeds/Seeds.png', url: '/products#seeds' },
    { title: 'Nursery', text: 'Our very own Nursery', img: '/img/products/plants/Plants.png', url: '/comingsoon' }
  ];
  res.render('home', { items, username: req.session.username });
});


// route for products page

// Get products (filtered by category if provided)

server.get('/products', (req, res) => {
  const categoryId = req.query.category || null;
  const priceRange = req.query.price || null;

  // Define minPrice and maxPrice
  let minPrice = 0;
  let maxPrice = 1000000; // Set a high value as a practical upper limit

  // Base query to fetch products along with their category names
  let query = 'SELECT products.*, categories.catName FROM products JOIN categories ON products.catId = categories.catId';

  // Prepare an array for query parameters
  const queryParams = [];

  // Add category filter if a category is selected
  if (categoryId) {
      query += ' WHERE products.catId = ?';
      queryParams.push(categoryId);
  }

  // Add price filtering if a price range is selected
  if (priceRange) {
      const priceParts = priceRange.split('-');
      if (priceParts[0] !== undefined) {
          minPrice = parseInt(priceParts[0]);
      }
      if (priceParts[1] === '+') {
          maxPrice = 1000000; // Use a high value for '150+'
      } else if (priceParts[1] !== undefined) {
          maxPrice = parseInt(priceParts[1]);
      }

      // Add price filter to the query
      if (categoryId) {
          query += ' AND';
      } else {
          query += ' WHERE';
      }
      query += ' products.sellingP BETWEEN ? AND ?';
      queryParams.push(minPrice, maxPrice);
  }

  // Fetch categories for the filter
  db.query('SELECT * FROM categories', (err, categories) => {
      if (err) {
          console.error('Error fetching categories:', err);
          return res.status(500).send('Error fetching categories');
      }

      // Fetch products, optionally filtered by category and price
      db.query(query, queryParams, (err, products) => {
          if (err) {
              console.error('Error fetching products:', err);
              return res.status(500).send('Error fetching products');
          }

          // Group products by category for better display
          const productsByCategory = products.reduce((acc, product) => {
              if (!acc[product.catName]) acc[product.catName] = [];
              acc[product.catName].push(product);
              return acc;
          }, {});

          // Render the products view with the necessary data, including the selected category and price
          res.render('products', {
              categories,
              productsByCategory,
              username: req.session.username,
              selectedCategory: categoryId,
              selectedPrice: priceRange // Pass selected price range to frontend
          });
      });
  });
});




server.get('/products/:prodId', (req, res) => {
  const productId = req.params.prodId;

  // SQL query to get the product details
  const sql = `
      SELECT p.prodId, p.prodName, p.description, p.sellingP AS price, p.quat AS quant, p.imgURL, c.catName AS category_name,
             v.vitamin_content, f.sweetness_level, e.rarity_level
      FROM products p
      LEFT JOIN categories c ON p.catId = c.catId
      LEFT JOIN vegetables v ON p.prodId = v.product_id
      LEFT JOIN fruits f ON p.prodId = f.product_id
      LEFT JOIN exovegetables e ON p.prodId = e.product_id
      WHERE p.prodId = ?
  `;

  db.query(sql, [productId], (err, results) => {
      if (err) {
          console.error(err);
          return res.status(500).send('Database error');
      }

      if (results.length === 0) {
          return res.status(404).send('Product not found');
      }

      // Render the product details page with the product information
      const product = results[0]; // Assuming only one product is returned
      res.render('product-details', { product, username: req.session.username, err: null }); // Adjust 'product-details' to your actual EJS template name
  });
});

// Render Cart Page
server.get('/cart', (req, res) => {
  const userId = req.session.userId; // Assuming user is logged in
  const username = req.session.username; // Assuming the username is stored in session

  if (!userId) {
    return res.redirect('/login'); // Redirect to login if not authenticated
  }

  // Query to fetch cart items for the logged-in user
  db.query(`
    SELECT cart.id, products.prodId, products.prodName, products.sellingP, cart.quantity 
    FROM cart 
    JOIN products ON cart.prodId = products.prodId 
    WHERE cart.userId = ?
  `, [userId], (err, cartItems) => {
    if (err) {
      console.error('Database query error:', err);
      req.flash('error', 'Unable to fetch cart items. Please try again later.');
      return res.redirect('/products'); // Redirect to products if error occurs
    }

    // Render the cart page with cart items and flash messages
    res.render('cart', { 
      cartItems, 
      username, 
      message: req.flash('success'), 
      error: req.flash('error') 
    });
  });
});

// Add Product to Cart
server.post('/cart/add/:id', (req, res) => {
  const productId = req.params.id;
  const userId = req.session.userId;

  db.query('SELECT stock FROM products WHERE prodId = ?', [productId], (err, result) => {
    if (err) throw err;

    if (result[0].stock == 'In-Stock') {
      db.query('INSERT INTO cart (userId, prodId, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + 1', [userId, productId, 1], (err) => {
        if (err) throw err;
        req.flash('success', 'Product added to cart!');
        res.redirect('/cart');
      });
    } else {
      req.flash('error', 'Product is out of stock!');
      res.redirect('/cart'); // Redirect to products if out of stock
    }
  });
});

// Remove Item from Cart
server.post('/cart/remove/:id', (req, res) => {
  const cartId = req.params.id;
  const userId = req.session.userId; // Ensure user is logged in

  // Ensure user can only delete items from their own cart
  db.query('DELETE FROM cart WHERE id = ? AND userId = ?', [cartId, userId], (err, result) => {
    if (err) throw err;
    req.flash('success', 'Product removed!');
    res.redirect('/cart'); // Redirect back to cart after removal
  });
});

// Update Quantity in Cart
server.post('/cart/update/:id', (req, res) => {
  const cartId = req.params.id;
  const userId = req.session.userId;
  const newQuantity = req.body.quantity;

  // Ensure user can only update items in their own cart
  db.query('UPDATE cart SET quantity = ? WHERE id = ? AND userId = ?', [newQuantity, cartId, userId], (err, result) => {
    if (err) throw err;
    req.flash('success', 'Product Updated!');
    res.redirect('/cart'); // Redirect back to cart after update
  });
});


// Route for viewing orders
server.get('/orders', (req, res) => {
  const userId = req.session.userId; // Ensure the userId is available in the session

  if (!userId) {
      return res.status(401).send('You need to log in to view your orders.');
  }

  const sql = `
      SELECT o.order_id, o.order_date, o.user_id, p.prodId, p.prodName, p.sellingP AS price, o.quantity
      FROM orders o
      JOIN products p ON o.product_id = p.prodId
      WHERE o.user_id = ?
      ORDER BY o.order_date DESC
  `;

  db.query(sql, [userId], (err, results) => {
      if (err) {
          console.error(err);
          return res.status(500).send('Database error while fetching orders');
      }

      // Render the orders page with the user's orders
      res.render('user-orders', { orders: results, username: req.session.username, message: '' });
  });
});

// Route for generating a receipt
server.post('/generate-receipt', limiter, (req, res) => {
  const { orderId, userId } = req.body; // Get orderId and userId from the request body

  // SQL query to get the specific order with price from products
  const orderSql = `
      SELECT orders.order_id, orders.order_date, orders.quantity, products.sellingP AS price, products.prodName,
             users.name, orders.address, orders.postal_code, orders.state, orders.city, users.email
      FROM orders
      JOIN products ON orders.product_id = products.prodId
      JOIN users ON orders.user_id = users.userId
      WHERE orders.order_id = ? AND orders.user_id = ?
  `;

  // SQL query to get all orders for the logged-in user
  const userOrdersSql = `
      SELECT orders.order_id, orders.order_date, orders.quantity, products.sellingP AS price, products.prodName
      FROM orders
      JOIN products ON orders.product_id = products.prodId
      WHERE orders.user_id = ?
  `;

  // Fetch the specific order
  db.query(orderSql, [orderId, userId], (err, results) => {
      if (err) {
          console.error('Error fetching order details:', err);
          return res.render('user-orders', { orders: [], username: req.session.username, message: 'Internal server error' });
      }

      if (results.length === 0) {
          return res.render('user-orders', { orders: [], username: req.session.username, message: 'Order not found' });
      }

      const order = results[0]; // Found specific order

      // Fetch all orders for the logged-in user
      db.query(userOrdersSql, [userId], (err, userOrdersResults) => {
        if (err) {
            console.error('Error fetching user orders:', err);
            return res.render('user-orders', { orders: [], username: req.session.username, message: 'Internal server error' });
        }

        // Render the EJS template for the invoice
        ejs.renderFile('./views/invoice-template.ejs', { order, orders: [order], convertToWords: numberToWords.toWords }, (err, html) => {
          if (err) {
              console.error('Error rendering HTML:', err);
              return res.render('user-orders', { orders: userOrdersResults, username: req.session.username, message: 'Error generating the invoice' });
          }

          // Create the PDF from the rendered HTML
          pdf.create(html).toStream((err, stream) => {
              if (err) {
                  console.error('Error creating PDF:', err);
                  return res.render('user-orders', { orders: userOrdersResults, username: req.session.username, message: 'Error creating PDF' });
              }

              // Set response headers to serve the PDF
              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.order_id}.pdf"`);

              // Pipe the PDF stream to the response
              stream.pipe(res);
          });
        });
      });
  });
});

server.get('/generate-receipt', (req, res) => {
  const userId = req.session.userId; // Assuming you have a session set up
  
  // Fetch orders for the user from the database
  const query = 'SELECT * FROM orders WHERE userId = ?';
  db.query(query, [userId], (error, results) => {
      if (error) {
          console.error(error);
          return res.render('error', { message: 'Failed to retrieve orders.' });
      }
      
      // Render the invoice template with the retrieved orders
      res.render('invoice-template', {
        orders: orders,
        order: order,
        convertToWords: convertToWords // Pass the function here
      });;
  });
});

// Route for order checkout
server.post('/order/checkout/:productId', (req, res) => {
  const { quantity, name, address, city, state, postal_code, phone } = req.body;
  const productId = req.params.productId;
  const userId = req.session.userId; // Get the logged-in user ID from the session

  // Check if user is logged in
  if (!userId) {
      return res.render('login', { username: req.session.username, error: 'You must Login before making any purchase.', successMessage: null, });
  }

  // SQL query to insert the order into the orders table
  const query = `
      INSERT INTO orders (user_id, product_id, quantity, name, address, city, state, postal_code, phone, order_date, shipment_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 4 HOUR))
  `;

  db.query(query, [userId, productId, quantity, name, address, city, state, postal_code, phone], (err, results) => {
      if (err) {
          console.error(err);
          res.render('product-details', { product: null, username: req.session.username, err: 'Error Placing order' });
      }

      // Optionally, redirect the user to an order confirmation page or display a success message
      res.redirect('/order-confirmation');
  });
});


server.get('/order-confirmation', (req, res) => {
  res.render('order-confirmation', { username: req.session.username });
})

// About Page
server.get('/about', (req, res) => {
  res.render('about', { username: req.session.username });
});

// Contact Page
server.get('/contact', (req, res) => {
  res.render('contact', { username: req.session.username });
});

// Login Page
server.get('/login', (req, res) => {
  res.render('login', { error: null, successMessage: null, username: req.session.username }); // Send initial state
});

// Login route
server.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Step 1: Verify username and password
  db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.render('login', { error: 'An error occurred, please try again.', successMessage: null });
    }

    // Check if user exists and password matches
    if (results.length === 0) {
      return res.render('login', { error: 'Invalid username or password.', successMessage: null });
    }

    const user = results[0];

    // Check password
    if (password !== user.password) {
      return res.render('login', { error: 'Invalid username or password.', successMessage: null });
    }

    req.session.username = user.username; // Save username to session
    req.session.userId = user.userId; // Save Userid to session

    // Login successful
    console.log('Login successful for user:', user.username);

    // Render success message with redirection
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Success!</title>
            <link rel="icon" sizes="200x200" href="/img/tab-logo.png">

            <!-- Bootstrap, CSS -->
            <link rel="stylesheet" href="/css/bootstrap.css">
            <link rel="stylesheet" href="/css/style.css">
        </head>
        <body>
            <nav class="navbar navbar-expand-lg">
              <div class="container-fluid">
                  <a class="navbar-brand fs-3" href="/">
                      <img src="/img/logo.png" width="65" height="45" alt="Bootstrap Logo">&nbsp;&nbsp;FarmFreshOrganic
                  </a>
                  <a class="navbar-brand" href="#"></a>
                  <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarScroll" aria-controls="navbarScroll" aria-expanded="false" aria-label="Toggle navigation">
                  <span class="navbar-toggler-icon"></span>
                  </button>
                  <div class="collapse navbar-collapse" id="navbarScroll">
                      <ul class="navbar-nav me-auto my-2 my-lg-0 navbar-nav-scroll" style="--bs-scroll-height: 100px;">
                          <li class="nav-item"><a class="nav-link active" aria-current="page" href="/home">Farmstead</a></li>
                          <li class="nav-item"><a class="nav-link" href="/products">Products</a></li>
                          <li class="nav-item"><a class="nav-link" href="/about">About</a></li>
                          <li class="nav-item"><a class="nav-link" href="/contact">Contact</a></li>
                          <li class="nav-item dropdown">
                              <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                                  ${user.username}
                              </a>
                              <ul class="dropdown-menu" aria-labelledby="navbarDropdown">
                                  <li><form action="/cart" method="GET"><button type="submit" class="dropdown-item">Cart</button></form></li>
                                  <li><form action="/orders" method="GET"><button type="submit" class="dropdown-item">My Orders</button></form></li>
                                  <li><form action="/logout" method="POST"><button type="submit" class="dropdown-item">Logout</button></form></li>
                              </ul>
                          </li>
                      </ul>
                      <form class="d-flex ml-auto" action="/search" method="GET">
                          <input class="form-control me-2" type="search" name="q" placeholder="Search" aria-label="Search">
                          <button class="btn btn-outline-success cust-btn" type="submit">Search</button>
                      </form>
                  </div>
              </div>
          </nav>

            <div class="d-flex flex-column align-items-center justify-content-center cust-container bg-light">
                <div style="text-align: center;"><p class="alert alert-success" style="width: 27rem;">Login Successful!</p></div>
                <div class="card shadow p-4 text-center" style="width: 27rem;">
                  <h1 class="card-title mb-4">Welcome Back, ${user.name}!</h1>
                  <p class="card-text">Head back to the main area using following buttons</p>
                  <a href="/" class="btn btn-secondary mt-2">Go to Home</a>
                  <button class="btn btn-primary cust-btn mt-3" onclick="goBack()">Go Back</button>
                </div>
            </div>
            
            <!-- Footer -->
            <footer class="bg-dark text-white py-4 mt-auto">
                <div class="container text-center">
                    <p>&copy; 2024 FarmFreshOrganic. All rights reserved.</p>
                    <p><a href="/privacy" class="text-white">Privacy Policy</a> | <a href="/terms" class="text-white">Terms of Service</a></p>
                </div>
            </footer>

            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
            <script>
                function goBack() {
                history.back(); // To get back to the last visited page
                }
            </script>
        </body>
      </html>  
     `);
  });
});;

server.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect('/home'); // Handle error appropriately
    }
    res.redirect('/login'); // Redirect to login or home
  });
});



// GET route for signup
server.get('/signup', (req, res) => {
  res.render('signup', { message: null, username: req.session.username, name: null, email: null, username: null, age: null, gender: null });
});

// Sign up route
server.post('/signup', (req, res) => {
  const { name, email, username, password, age, gender, agreeTerms } = req.body;

  // Simple server-side validations
  if (!name || !email || !username || !password || !age || !gender || !agreeTerms) {
      return res.render('signup', {
          message: 'All fields are required',
          name, email, username, age, gender
      });
  }

  // Check if email or username already exists
  db.query('SELECT * FROM users WHERE email = ?', [email], (emailErr, emailCheck) => {
      if (emailErr) {
          console.error(emailErr);
          return res.render('signup', { message: 'Internal server error', name, email, username, age, gender });
      }

      if (emailCheck.length > 0) {
          return res.render('signup', {
              message: 'Email already in use',
              name, email, username, age, gender
          });
      }

      db.query('SELECT * FROM users WHERE username = ?', [username], (usernameErr, usernameCheck) => {
          if (usernameErr) {
              console.error(usernameErr);
              return res.render('signup', { message: 'Internal server error', name, email, username, age, gender });
          }

          if (usernameCheck.length > 0) {
              return res.render('signup', {
                  message: 'Username already taken',
                  name, email, username, age, gender
              });
          }

          // Insert new user into the database
          const newUser = {
              name,
              email,
              username,
              password, // In production, hash the password using bcrypt
              age,
              gender,
              created_at: new Date(),
          };

          db.query('INSERT INTO users SET ?', newUser, (insertErr) => {
              if (insertErr) {
                  console.error(insertErr);
                  return res.render('signup', { message: 'Internal server error', name, email, username, age, gender });
              }

              // Render success confirmation page
              return res.send(`
                <!DOCTYPE html>
                <html lang="en">

                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Success!</title>
                    <link rel="icon" sizes="200x200" href="/img/tab-logo.png">
                    <!-- Bootstrap, CSS -->
                    <link rel="stylesheet" href="./public/css/bootstrap.css">
                    <link rel="stylesheet" href="./public/css/style.css">
                </head>
                    <body>
                        <nav class="navbar navbar-expand-lg">
                            <div class="container-fluid">
                                <a class="navbar-brand fs-3" href="/">
                                    <img src="/img/logo.png" width="65" height="45" alt="Bootstrap Logo">&nbsp;&nbsp;FarmFreshOrganic
                                </a>
                                <a class="navbar-brand" href="#"></a>
                                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarScroll"
                                    aria-controls="navbarScroll" aria-expanded="false" aria-label="Toggle navigation">
                                    <span class="navbar-toggler-icon"></span>
                                </button>
                                <div class="collapse navbar-collapse" id="navbarScroll">
                                    <ul class="navbar-nav me-auto my-2 my-lg-0 navbar-nav-scroll" style="--bs-scroll-height: 100px;">
                                        <li class="nav-item"><a class="nav-link active" aria-current="page" href="/home">Farmstead</a></li>
                                        <li class="nav-item"><a class="nav-link" href="/products">Products</a></li>
                                        <li class="nav-item"><a class="nav-link" href="/about">About</a></li>
                                        <li class="nav-item"><a class="nav-link" href="/contact">Contact</a></li>
                                        <li class="nav-item"><a class="nav-link" href="/login">Login</a></li>
                                    </ul>
                                    <form class="d-flex ml-auto" action="/search" method="GET">
                                        <input class="form-control me-2" type="search" name="q" placeholder="Search" aria-label="Search">
                                        <button class="btn btn-outline-success cust-btn" type="submit">Search</button>
                                    </form>
                                </div>
                            </div>
                        </nav>

                        <div class="d-flex flex-column align-items-center justify-content-center cust-container bg-light">
                            <div style="text-align: center;">
                                <p class="alert alert-success" style="width: 27rem;">Account Created Successfully!</p>
                            </div>
                            <div class="card shadow p-4 text-center" style="width: 27rem;">
                                <h1 class="card-title mb-4">Welcome, ${name}!</h1>
                                <p class="card-text">Thank you for joining us here in <strong>FarmFreshOrganic</strong>! You may now log in using your credintials. Use Login tab from navbar or use the button below to open Login page.</p>
                                <a href="/login" class="btn btn-secondary mt-2">Go to Login</a>
                                <button class="btn btn-primary cust-btn mt-3" onclick="goBack()">Go Back</button>
                            </div>
                        </div>

                        <!-- Footer -->
                        <footer class="bg-dark text-white py-4 mt-auto">
                            <div class="container text-center">
                                <p>&copy; 2024 FarmFreshOrganic. All rights reserved.</p>
                                <p><a href="/privacy" class="text-white">Privacy Policy</a> | <a href="/terms" class="text-white">Terms of
                                        Service</a></p>
                            </div>
                        </footer>

                        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
                        <script>
                            function goBack() {
                                history.back(); // To get back to the last visited page
                            }
                        </script>
                    </body>
                </html>
              `);
          });
      });
  });
});


server.get('/search', (req, res) => {
  const searchQuery = req.query.q; // Trim any whitespace

  if (!searchQuery) {
    console.log(searchQuery);
    return res.render('search', { products: [], searchQuery: "", username: req.session.username, message: "Please enter a valid search query." });
  }

  const sql = `
    SELECT p.prodId, p.prodName, p.description, p.sellingP AS price, p.imgURL, c.catName AS category_name,
           v.vitamin_content, f.sweetness_level, e.rarity_level
    FROM products p
    LEFT JOIN categories c ON p.catId = c.catId
    LEFT JOIN vegetables v ON p.prodId = v.product_id
    LEFT JOIN fruits f ON p.prodId = f.product_id
    LEFT JOIN exovegetables e ON p.prodId = e.product_id
    WHERE p.prodName LIKE ? 
       OR p.description LIKE ?
       OR v.vitamin_content LIKE ?
       OR f.sweetness_level LIKE ?
       OR e.rarity_level LIKE ?
  `;

  const searchParam = `%${searchQuery}%`;

  db.query(sql, [searchParam, searchParam, searchParam, searchParam, searchParam], (err, results) => {
    if (err) throw err;
    res.render('search', { products: results, searchQuery, username: req.session.username });
  });
});


// Contact Route to Handle Form Submission
server.post('/res-recieved', (req, res) => {
  const { name, email, message } = req.body;

  // Insert data into MySQL (or any database)
  const sql = 'INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)';
  db.query(sql, [name, email, message], (err, result) => {
    if (err) {
      console.log('Error inserting data: ', err);
      return res.status(500).send('An error occurred. Please try again.');
    }

    // Send email logic
    sendConfirmationEmail(name, email);

    // Respond with HTML to display in the new tab
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title> Thank You | FarmFreshOrganic </title>
        <link rel="icon" sizes="200x200" href="/img/tab-logo.png">
        <link rel="stylesheet" href="/css/bootstrap.css">
        <link rel="stylesheet" href="/css/style.css">
      </head>
      <body class="d-flex flex-column align-items-center justify-content-center vh-100 bg-light">
        <div class="card shadow p-4 text-center" style="width: 24rem;">
          <h1 class="card-title mb-4 text-success">Thank You, ${name}!</h1>
          <p class="card-text">Your message has been received. We will get back to you shortly.</p>
          <p class="text-muted">You will also receive an email confirmation at <strong>${email}</strong>.</p>
          <a href="/" class="btn btn-secondary mt-2">Return to Home</a>
          <button class="btn btn-primary mt-3" onclick="goBack()">Go Back</button>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
        <script>
          function goBack() {
            history.back(); // To get back to the last visited page
          }
        </script>
      </body>
      </html>
    `);
  });
});

server.get('/terms', (req, res) => {
  res.render('terms', { username: req.session.username })
});

server.get('/privacy', (req, res) => {
  res.render('privacy', { username: req.session.username })
})

// Function to send confirmation email
const sendConfirmationEmail = (name, email) => {
  // Set up NodeMailer
  let transporter = nodemailer.createTransport({
    secure: true,
    host: "smtp.gmail.com",
    port: 465,
    auth: {
      user: process.env.SUP_EMAIL_USER,
      pass: process.env.SUP_EMAIL_PASS // Use environment variable for security
    }
  });

  // Email content
  let mailOptions = {
    from: process.env.SUP_EMAIL_USER,
    to: email,
    subject: 'Contact Request Received',
    html: `<p>Dear ${name},</p>
           <p>Thank you for reaching out to FarmFreshOrganic! 🌱</p>
           <p>We've received your message and one of our friendly agents will get back to you soon.</p>
           <p>In the meantime, feel free to browse our <a href="">products</a> or learn more <a href="">about us</a>.</p>
           <p>Best regards,<br>FarmFreshOrganic Team</p>`
  };

  // Send the email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Error sending email: ', error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
};

server.listen(3100, () => {
  console.log('Server is running on http://localhost:3100');
});
