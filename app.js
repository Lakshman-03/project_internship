const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const flash = require("connect-flash");

const app = express();
const PORT = process.env.PORT || 10000;

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "login_register",
  password: "Lakshman123",
  port: 5432,
});

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(128) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        user_type VARCHAR(20) DEFAULT 'customer' CHECK (user_type IN ('customer', 'seller', 'admin')),
        account_status VARCHAR(20) DEFAULT 'pending' CHECK (account_status IN ('active', 'suspended', 'pending')),
        last_login TIMESTAMP,
        phone_verified BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(128) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        image VARCHAR(100) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_addresses (
        address_id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        address_type VARCHAR(20) CHECK (address_type IN ('billing', 'shipping')),
        street_address VARCHAR(255) NOT NULL,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        postal_code VARCHAR(20) NOT NULL,
        country VARCHAR(100) NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_verification (
        verification_id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        document_type VARCHAR(20) CHECK (document_type IN ('id_card', 'passport', 'driving_license')),
        document_number VARCHAR(100) NOT NULL,
        verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
        verification_date TIMESTAMP,
        verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert default admin if not exists
      INSERT INTO admins (full_name, email, password)
      SELECT 'Admin User', 'admin@gmail.com', '$2a$10$YourHashedPasswordHere'
      WHERE NOT EXISTS (SELECT 1 FROM admins WHERE email = 'admin@gmail.com');
    `);

    const adminExists = await pool.query(
      "SELECT * FROM admins WHERE email = $1",
      ["admin@example.com"]
    );

    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash("admin@123", 10);
      await pool.query(
        "INSERT INTO admins (full_name, email, password) VALUES ($1, $2, $3)",
        ["Admin User", "admin@gmail.com", hashedPassword]
      );
    }

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
  }
};

// Initialize database
initDB();

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session middleware
app.use(
  session({
    secret: "Hello",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);

app.use(flash());
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect("/admin_dashboard");
  }
};

const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.type === "admin") {
    next();
  } else {
    res.redirect("/admin/login");
  }
};
app.get("/", (req, res) => {
  res.render("index");
});

app.get("/login", (req, res) => {
  const message = req.query.message || "";
  res.render("login", { message });
});
app.get("/admin_login", (req, res) => {
  res.render("admin_login", { message: "" });
});

app.post("/admin_login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM admins WHERE email = $1", [
      email,
    ]);
    console.log(password);

    const admin = result.rows[0];
    if (admin || (await bcrypt.compare(admin["password"], password))) {
      req.session.user = {
        id: admin.id,
        type: "admin",
        email: admin.email,
        full_name: admin.full_name,
      };
      return res.redirect("/admin-dashboard");
    } else {
      return res.render("admin_login", {
        message: "Invalid admin credentials",
      });
    }
  } catch (error) {
    console.error("Admin login error:", error);
    res.render("admin_login", {
      message: "An error occurred during login",
    });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (req.body.admin_login) {
      const result = await pool.query("SELECT * FROM admins WHERE email = $1", [
        email,
      ]);

      const admin = result.rows[0];
      if (admin && (await bcrypt.compare(password, admin.password))) {
        req.session.user = {
          id: admin.id,
          type: "admin",
          email: admin.email,
          full_name: admin.full_name,
        };
        return res.redirect("/admin-dashboard");
      } else {
        return res.render("login", { message: "Invalid admin credentials" });
      }
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    const user = result.rows[0];
    if (user && (await bcrypt.compare(password, user.password))) {
      await pool.query(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1",
        [user.id]
      );

      req.session.user = {
        id: user.id,
        type: user.user_type,
        status: user.account_status,
      };

      if (user.account_status !== "active") {
        return res.render("login", { message: "Account is not active" });
      }
      res.redirect("/");
    } else {
      res.render("login", { message: "Invalid email or password" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.render("login", { message: "An error occurred during login" });
  }
});

app.post("/register", async (req, res) => {
  const { fullname, email, password, repeat_password } = req.body;

  try {
    if (password !== repeat_password) {
      return res.render("login", { message: "Passwords do not match" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (full_name, email, password, user_type, account_status) 
       VALUES ($1, $2, $3, 'customer', 'pending')`,
      [fullname, email, hashedPassword]
    );

    res.render("login", {
      message: "Registration successful! Please wait for account activation.",
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.render("login", { message: "An error occurred during registration" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login?message=logged_out");
});

app.get("/admin-dashboard", isAdmin, async (req, res) => {
  try {
    const products = await pool.query(
      "SELECT * FROM products ORDER BY created_at DESC"
    );
    const users = await pool.query(
      "SELECT * FROM users ORDER BY created_at DESC"
    );
    const orders = await pool.query(
      "SELECT * FROM orders ORDER BY created_at DESC"
    );

    res.render("admin_dashboard", {
      products: products.rows,
      users: users.rows,
      orders: orders.rows,
      message: req.flash("message"),
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.render("admin_dashboard", {
      products: [],
      users: [],
      orders: [],
      error: "Failed to load dashboard data",
    });
  }
});

app.post("/admin/add-product", isAdmin, async (req, res) => {
  try {
    const { name, price, description, category } = req.body;
    const image = req.files?.image;

    if (!image) {
      req.flash("message", "Please upload an image");
      return res.redirect("/admin-dashboard");
    }

    const imageName = Date.now() + "_" + image.name;
    await image.mv(`public/uploads/${imageName}`);
    await pool.query(
      `INSERT INTO products (name, price, description, category, image) 
       VALUES ($1, $2, $3, $4, $5)`,
      [name, price, description, category, imageName]
    );

    req.flash("message", "Product added successfully");
    res.redirect("/admin-dashboard");
  } catch (error) {
    console.error("Error adding product:", error);
    req.flash("message", "Error adding product");
    res.redirect("/admin-dashboard");
  }
});

app.post("/admin/delete-product/:id", isAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
    req.flash("message", "Product deleted successfully");
    res.redirect("/admin-dashboard");
  } catch (error) {
    console.error("Error deleting product:", error);
    req.flash("message", "Error deleting product");
    res.redirect("/admin-dashboard");
  }
});

app.post("/admin/update-product/:id", isAdmin, async (req, res) => {
  try {
    const { name, price, description, category } = req.body;
    const image = req.files?.image;

    if (image) {
      const imageName = Date.now() + "_" + image.name;
      await image.mv(`public/uploads/${imageName}`);
      await pool.query(
        `UPDATE products SET name=$1, price=$2, description=$3, category=$4, image=$5 
         WHERE id=$6`,
        [name, price, description, category, imageName, req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE products SET name=$1, price=$2, description=$3, category=$4 
         WHERE id=$5`,
        [name, price, description, category, req.params.id]
      );
    }

    req.flash("message", "Product updated successfully");
    res.redirect("/admin-dashboard");
  } catch (error) {
    console.error("Error updating product:", error);
    req.flash("message", "Error updating product");
    res.redirect("/admin-dashboard");
  }
});

app.get("/about", (req, res) => {
  res.render("about");
});

app.get("/contact", (req, res) => {
  res.render("contact");
});

app.get("/categories", (req, res) => {
  res.render("categories");
});

app.get("/text-book", (req, res) => {
  res.render("text-book");
});

app.get("/single", (req, res) => {
  res.render("single");
});

app.get("/book", (req, res) => {
  const itemName = req.query.itemName;
  res.render("book", {
    itemName,
    message: req.flash("message"),
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

app.get("/admin/login", (req, res) => {
  const message = req.query.message || "";
  res.render("admin_login", { message });
});

app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM admins WHERE email = $1", [
      email,
    ]);

    const admin = result.rows[0];
    if (admin && (await bcrypt.compare(password, admin.password))) {
      req.session.user = {
        id: admin.id,
        type: "admin",
        email: admin.email,
        full_name: admin.full_name,
      };
      return res.redirect("/admin-dashboard");
    } else {
      return res.render("admin_login", {
        message: "Invalid admin credentials",
      });
    }
  } catch (error) {
    console.error("Admin login error:", error);
    res.render("admin_login", {
      message: "An error occurred during login",
    });
  }
});
