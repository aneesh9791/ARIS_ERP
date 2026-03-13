#!/bin/bash

# 🍎 Quick Mac Start Script for ARIS ERP
# Double-click this file to start the ARIS ERP system on macOS

echo "🍎 Starting ARIS ERP on macOS..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker Desktop is not running!"
    echo "Please start Docker Desktop first."
    echo ""
    echo "📋 Steps:"
    echo "1. Open Docker Desktop from Applications"
    echo "2. Wait for Docker to start (green icon in menu bar)"
    echo "3. Run this script again"
    echo ""
    read -p "Press Enter to open Docker Desktop..."
    open -a "Docker Desktop"
    exit 1
fi

echo "✅ Docker Desktop is running!"

# Navigate to project directory
cd "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project" || {
    echo "❌ Cannot find project directory!"
    echo "Please make sure the ARIS_ERP folder is accessible."
    exit 1
}

echo "✅ Found project directory!"

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 30

# Check if services are running
echo "🔍 Checking service status..."
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services are starting up!"
    
    # Wait a bit more for full startup
    echo "⏳ Waiting for full startup..."
    sleep 60
    
    # Check again
    if docker-compose ps | grep -q "Up"; then
        echo "✅ All services are running!"
        echo ""
        echo "🌐 Access Points:"
        echo "📱 Main Application: http://localhost:3000"
        echo "📊 Database Admin: http://localhost:5050"
        echo "🗄️ Redis Commander: http://localhost:8081"
        echo "⚙️ Backend API: http://localhost:5000"
        echo ""
        echo "👤 Login Credentials:"
        echo "Email: admin@aris.com"
        echo "Password: admin123"
        echo ""
        echo "🚀 Opening application in your default browser..."
        open http://localhost:3000
        
        echo "📊 Opening database admin..."
        open http://localhost:5050
        
        echo ""
        echo "✅ ARIS ERP is now running!"
        echo "📋 To stop services, run: cd '/Volumes/DATA HD/ARIS_ERP/New_ERP_Project' && docker-compose down"
        echo "📋 To view logs, run: cd '/Volumes/DATA HD/ARIS_ERP/New_ERP_Project' && docker-compose logs -f"
        
    else
        echo "❌ Services failed to start properly."
        echo "📋 Viewing logs:"
        docker-compose logs
        echo ""
        echo "🔧 Troubleshooting:"
        echo "1. Check Docker Desktop is running"
        echo "2. Check port conflicts: lsof -i :3000"
        echo "3. Restart Docker and try again"
    fi
else
    echo "❌ Services failed to start!"
    echo "📋 Viewing logs:"
    docker-compose logs
    echo ""
    echo "🔧 Troubleshooting:"
    echo "1. Check Docker Desktop is running"
    echo "2. Check port conflicts: lsof -i :3000"
    echo "3. Restart Docker and try again"
fi

echo ""
echo "🎉 Script completed!"
read -p "Press Enter to exit..."
