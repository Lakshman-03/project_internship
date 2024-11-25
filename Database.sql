CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) DEFAULT 'customer' CHECK (
        user_type IN ('customer', 'seller', 'admin')
    ),
    account_status VARCHAR(20) DEFAULT 'pending' CHECK (
        account_status IN (
            'active',
            'suspended',
            'pending'
        )
    ),
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
    price DECIMAL(10, 2) NOT NULL,
    image VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_addresses (
    address_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users (id) ON DELETE CASCADE,
    address_type VARCHAR(20) CHECK (
        address_type IN ('billing', 'shipping')
    ),
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
    user_id INTEGER REFERENCES users (id) ON DELETE CASCADE,
    document_type VARCHAR(20) CHECK (
        document_type IN (
            'id_card',
            'passport',
            'driving_license'
        )
    ),
    document_number VARCHAR(100) NOT NULL,
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (
        verification_status IN (
            'pending',
            'approved',
            'rejected'
        )
    ),
    verification_date TIMESTAMP,
    verified_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin if not exists
INSERT INTO
    admins (full_name, email, password)
SELECT 'Admin User', 'admin@gmail.com', '$2a$10$YourHashedPasswordHere'
WHERE
    NOT EXISTS (
        SELECT 1
        FROM admins
        WHERE
            email = 'admin@gmail.com'
    );

ALTER TABLE products
ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;