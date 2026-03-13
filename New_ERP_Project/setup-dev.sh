#!/bin/bash

# ARIS ERP Development Setup Script
# This script sets up the development environment for the ARIS ERP system

set -e

echo "🚀 Setting up ARIS ERP Development Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[SETUP]${NC} $1"
}

# Check if Node.js is installed
check_nodejs() {
    print_header "Checking Node.js installation..."
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_status "Node.js is installed: $NODE_VERSION"
        
        # Check if version is compatible (>= 18)
        if node -e "process.exit(Number(process.version.slice(1).split('.')[0]) >= 18 ? 0 : 1)"; then
            print_status "Node.js version is compatible"
        else
            print_error "Node.js version must be >= 18.0.0"
            exit 1
        fi
    else
        print_error "Node.js is not installed. Please install Node.js >= 18.0.0"
        exit 1
    fi
}

# Check if PostgreSQL is installed
check_postgresql() {
    print_header "Checking PostgreSQL installation..."
    if command -v psql &> /dev/null; then
        PG_VERSION=$(psql --version | head -n1 | cut -d' ' -f3)
        print_status "PostgreSQL is installed: $PG_VERSION"
    else
        print_warning "PostgreSQL is not installed. Please install PostgreSQL >= 13"
        print_warning "Visit: https://www.postgresql.org/download/"
    fi
}

# Check if Redis is installed
check_redis() {
    print_header "Checking Redis installation..."
    if command -v redis-server &> /dev/null; then
        REDIS_VERSION=$(redis-server --version | head -n1 | cut -d' ' -f3)
        print_status "Redis is installed: $REDIS_VERSION"
    else
        print_warning "Redis is not installed. Please install Redis >= 6"
        print_warning "Visit: https://redis.io/download"
    fi
}

# Setup Backend
setup_backend() {
    print_header "Setting up Backend..."
    
    cd backend
    
    # Install dependencies
    print_status "Installing backend dependencies..."
    npm install
    
    # Create environment file
    if [ ! -f .env ]; then
        print_status "Creating .env file from template..."
        cp .env.example .env
        print_warning "Please update .env file with your database credentials"
    else
        print_status ".env file already exists"
    fi
    
    # Create logs directory
    if [ ! -d logs ]; then
        mkdir -p logs
        print_status "Created logs directory"
    fi
    
    # Run type check
    print_status "Running TypeScript type check..."
    npm run type-check
    
    # Run linting
    print_status "Running ESLint..."
    npm run lint
    
    cd ..
    print_status "Backend setup completed"
}

# Setup Frontend
setup_frontend() {
    print_header "Setting up Frontend..."
    
    cd frontend
    
    # Install dependencies
    print_status "Installing frontend dependencies..."
    npm install
    
    # Create environment file
    if [ ! -f .env ]; then
        print_status "Creating .env file..."
        cat > .env << EOF
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_ENV=development
REACT_APP_VERSION=1.0.0
REACT_APP_TITLE=ARIS ERP - Kerala Diagnostic Centers
EOF
        print_status "Created .env file"
    else
        print_status ".env file already exists"
    fi
    
    # Run type check
    print_status "Running TypeScript type check..."
    npm run type-check
    
    # Run linting
    print_status "Running ESLint..."
    npm run lint
    
    cd ..
    print_status "Frontend setup completed"
}

# Setup Database
setup_database() {
    print_header "Setting up Database..."
    
    # Check if database exists
    if command -v psql &> /dev/null; then
        print_status "Checking if database exists..."
        if psql -lqt | cut -d \| -f 1 | grep -qw aris_erp; then
            print_status "Database 'aris_erp' already exists"
        else
            print_status "Creating database 'aris_erp'..."
            createdb aris_erp
            print_status "Database created successfully"
        fi
        
        # Run migrations
        if [ -f backend/src/migrations/migrate.js ]; then
            print_status "Running database migrations..."
            cd backend
            npm run migrate
            cd ..
        else
            print_warning "No migration file found. Please run migrations manually."
        fi
        
        # Seed data
        if [ -f backend/src/migrations/seed.js ]; then
            print_status "Seeding database with sample data..."
            cd backend
            npm run seed
            cd ..
        else
            print_warning "No seed file found. Please seed data manually."
        fi
    else
        print_error "PostgreSQL is not installed. Cannot setup database."
    fi
}

# Setup Git Hooks
setup_git_hooks() {
    print_header "Setting up Git Hooks..."
    
    # Create pre-commit hook
    if [ ! -f .git/hooks/pre-commit ]; then
        cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Pre-commit hook for ARIS ERP

echo "Running pre-commit checks..."

# Check backend
if [ -d "backend" ]; then
    echo "Checking backend..."
    cd backend
    npm run lint
    npm run type-check
    cd ..
fi

# Check frontend
if [ -d "frontend" ]; then
    echo "Checking frontend..."
    cd frontend
    npm run lint
    npm run type-check
    cd ..
fi

echo "Pre-commit checks completed!"
EOF
        chmod +x .git/hooks/pre-commit
        print_status "Created pre-commit hook"
    else
        print_status "Pre-commit hook already exists"
    fi
}

# Setup VS Code workspace
setup_vscode() {
    print_header "Setting up VS Code workspace..."
    
    if [ -d ".vscode" ]; then
        print_status ".vscode directory already exists"
    else
        mkdir -p .vscode
        
        # Create workspace settings
        cat > .vscode/settings.json << 'EOF'
{
    "typescript.preferences.importModuleSpecifier": "relative",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true,
        "source.organizeImports": true
    },
    "files.exclude": {
        "**/node_modules": true,
        "**/dist": true,
        "**/build": true,
        "**/.git": true,
        "**/.DS_Store": true,
        "**/Thumbs.db": true
    },
    "search.exclude": {
        "**/node_modules": true,
        "**/dist": true,
        "**/build": true,
        "**/.git": true
    },
    "typescript.suggest.autoImports": true,
    "typescript.updateImportsOnFileMove.enabled": "always",
    "eslint.workingDirectories": ["backend", "frontend"],
    "prettier.configPath": ".prettierrc"
}
EOF
        
        # Create launch configuration
        cat > .vscode/launch.json << 'EOF'
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Debug Backend",
            "type": "node",
            "request": "launch",
            "program": "${workspaceFolder}/backend/src/app.js",
            "env": {
                "NODE_ENV": "development"
            },
            "console": "integratedTerminal",
            "restart": true,
            "runtimeExecutable": "nodemon"
        },
        {
            "name": "Debug Frontend",
            "type": "node",
            "request": "launch",
            "program": "${workspaceFolder}/frontend/node_modules/.bin/react-scripts",
            "args": ["start"],
            "cwd": "${workspaceFolder}/frontend",
            "console": "integratedTerminal",
            "env": {
                "BROWSER": "none"
            }
        }
    ]
}
EOF
        
        # Create tasks
        cat > .vscode/tasks.json << 'EOF'
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "Start Backend",
            "type": "shell",
            "command": "npm",
            "args": ["run", "dev"],
            "options": {
                "cwd": "${workspaceFolder}/backend"
            },
            "group": "build",
            "presentation": {
                "echo": true,
                "reveal": "always",
                "focus": false,
                "panel": "new"
            }
        },
        {
            "label": "Start Frontend",
            "type": "shell",
            "command": "npm",
            "args": ["start"],
            "options": {
                "cwd": "${workspaceFolder}/frontend"
            },
            "group": "build",
            "presentation": {
                "echo": true,
                "reveal": "always",
                "focus": false,
                "panel": "new"
            }
        },
        {
            "label": "Run Tests",
            "type": "shell",
            "command": "npm",
            "args": ["test"],
            "options": {
                "cwd": "${workspaceFolder}/backend"
            },
            "group": "test",
            "presentation": {
                "echo": true,
                "reveal": "always",
                "focus": false,
                "panel": "new"
            }
        }
    ]
}
EOF
        
        print_status "Created VS Code workspace configuration"
    fi
}

# Create development scripts
create_dev_scripts() {
    print_header "Creating development scripts..."
    
    # Create start script
    cat > start-dev.sh << 'EOF'
#!/bin/bash

# Start development servers
echo "Starting ARIS ERP development servers..."

# Start backend
echo "Starting backend server..."
cd backend
npm run dev &
BACKEND_PID=$!

# Start frontend
echo "Starting frontend server..."
cd ../frontend
npm start &
FRONTEND_PID=$!

# Wait for user input to stop
echo "Press Ctrl+C to stop all servers"

# Trap to kill processes on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

# Wait for processes
wait
EOF
    chmod +x start-dev.sh
    
    # Create test script
    cat > run-tests.sh << 'EOF'
#!/bin/bash

# Run all tests
echo "Running ARIS ERP tests..."

# Backend tests
echo "Running backend tests..."
cd backend
npm test
BACKEND_RESULT=$?

# Frontend tests
echo "Running frontend tests..."
cd ../frontend
npm test -- --watchAll=false
FRONTEND_RESULT=$!

# Results
if [ $BACKEND_RESULT -eq 0 ] && [ $FRONTEND_RESULT -eq 0 ]; then
    echo "All tests passed!"
    exit 0
else
    echo "Some tests failed!"
    exit 1
fi
EOF
    chmod +x run-tests.sh
    
    # Create build script
    cat > build.sh << 'EOF'
#!/bin/bash

# Build the application
echo "Building ARIS ERP..."

# Build backend
echo "Building backend..."
cd backend
npm run build
BACKEND_RESULT=$?

# Build frontend
echo "Building frontend..."
cd ../frontend
npm run build
FRONTEND_RESULT=$?

# Results
if [ $BACKEND_RESULT -eq 0 ] && [ $FRONTEND_RESULT -eq 0 ]; then
    echo "Build completed successfully!"
    exit 0
else
    echo "Build failed!"
    exit 1
fi
EOF
    chmod +x build.sh
    
    print_status "Created development scripts"
}

# Main execution
main() {
    echo "🎯 ARIS ERP Development Setup"
    echo "================================"
    
    # Check prerequisites
    check_nodejs
    check_postgresql
    check_redis
    
    # Setup components
    setup_backend
    setup_frontend
    setup_database
    setup_git_hooks
    setup_vscode
    create_dev_scripts
    
    echo ""
    echo "🎉 Setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Update backend/.env with your database credentials"
    echo "2. Update frontend/.env if needed"
    echo "3. Start the development servers: ./start-dev.sh"
    echo "4. Run tests: ./run-tests.sh"
    echo "5. Open VS Code and start developing!"
    echo ""
    echo "Useful commands:"
    echo "- Backend dev: cd backend && npm run dev"
    echo "- Frontend dev: cd frontend && npm start"
    echo "- Run tests: ./run-tests.sh"
    echo "- Build: ./build.sh"
    echo "- Type check: npm run type-check"
    echo "- Lint: npm run lint"
    echo ""
    echo "📚 Documentation: http://localhost:5000/api-docs"
    echo "🌐 Frontend: http://localhost:3000"
    echo "🔧 Backend API: http://localhost:5000/api"
}

# Run main function
main
