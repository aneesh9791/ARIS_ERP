#!/bin/bash

# Ensure correct Node.js path
export PATH="/opt/homebrew/bin:$PATH"

# Verify Node.js and npm are available
echo "Node.js path: $(which node)"
echo "Node.js version: $(node --version)"
echo "npm path: $(which npm)"
echo "npm version: $(npm --version)"

# Check if Redis is running
echo "Checking Redis status..."
redis-cli ping > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Redis is running"
else
    echo "✗ Redis is not running"
fi

# Check PostgreSQL
echo "Checking PostgreSQL status..."
pg_isready -h localhost -p 5432 > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ PostgreSQL is running"
else
    echo "✗ PostgreSQL is not running"
fi

echo ""
echo "Environment setup complete!"
