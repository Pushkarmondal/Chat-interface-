#!/bin/bash
set -euo pipefail
exec > /var/log/userdata.log 2>&1

# ─────────────────────────────────────────────
# 1. System update
# ─────────────────────────────────────────────
apt-get update -y
apt-get upgrade -y

# ─────────────────────────────────────────────
# 2. Install Nginx
# ─────────────────────────────────────────────
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx

# ─────────────────────────────────────────────
# 3. Install Node.js v20 (LTS, satisfies v18+ requirement)
# ─────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify Node and npm
node -v
npm -v

# Install PM2 globally
npm install -g pm2

# ─────────────────────────────────────────────
# 4. Install MongoDB Community Edition 7.0
# ─────────────────────────────────────────────
apt-get install -y gnupg curl

# Import MongoDB public GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg

# Add MongoDB repository for Ubuntu 24.04 (Noble)
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/7.0 multiverse" \
  | tee /etc/apt/sources.list.d/mongodb-org-7.0.list

apt-get update -y
apt-get install -y mongodb-org

# Enable and start MongoDB
systemctl daemon-reload
systemctl enable mongod
systemctl start mongod

# Wait for MongoDB to be ready
for i in {1..10}; do
  mongosh --eval "db.runCommand({ ping: 1 })" --quiet && break
  echo "Waiting for MongoDB... attempt $i"
  sleep 3
done

# ─────────────────────────────────────────────
# 5. Clone and run the Node.js app
# ─────────────────────────────────────────────
APP_DIR="/opt/node_dummy_app"

if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR" && git pull
else
  git clone https://bitbucket.org/divyam-singal/node_dummy_app.git "$APP_DIR"
fi

cd "$APP_DIR"
npm install

# Start app with PM2 under the ubuntu user, on port 3000
# PM2 ecosystem file keeps config clean and restartable
cat > /opt/node_dummy_app/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: "node_dummy_app",
      script: "./index.js",        // adjust if entry point differs
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        MONGO_URL: "mongodb://127.0.0.1:27017/mydb"
      }
    }
  ]
};
EOF

# Start via PM2 as root (userdata runs as root)
pm2 start /opt/node_dummy_app/ecosystem.config.js
pm2 save

# Make PM2 start on system boot (for root)
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root

# ─────────────────────────────────────────────
# 6. Verify GET /mongo returns success
# ─────────────────────────────────────────────
# Wait for the app to bind on port 3000
for i in {1..15}; do
  curl -sf http://localhost:3000/mongo && break
  echo "Waiting for app on :3000 ... attempt $i"
  sleep 4
done

RESPONSE=$(curl -s http://localhost:3000/mongo)
echo "GET /mongo response: $RESPONSE"

if echo "$RESPONSE" | grep -qi "success"; then
  echo "✅ /mongo health check PASSED"
else
  echo "⚠️  /mongo did not return 'success'. Check app logs: pm2 logs node_dummy_app"
fi

# ─────────────────────────────────────────────
# 7. Configure Nginx reverse proxy
# ─────────────────────────────────────────────
cat > /etc/nginx/sites-available/node_dummy_app << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;          # catch-all; replace with your domain if you have one

    # Proxy all traffic to the Node.js app on port 3000
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Required for WebSocket support (and good practice)
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Forward real client info to the app
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable the site, disable the default placeholder
ln -sf /etc/nginx/sites-available/node_dummy_app /etc/nginx/sites-enabled/node_dummy_app
rm -f /etc/nginx/sites-enabled/default

# Test config and reload
nginx -t
systemctl reload nginx

echo "✅ Bootstrap complete. App is live on port 80 via Nginx → 3000."