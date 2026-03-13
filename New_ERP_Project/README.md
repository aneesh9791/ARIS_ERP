# ARIS ERP - Kerala Diagnostic Centers Management System

A comprehensive ERP system designed specifically for diagnostic centers in Kerala, India. Built with modern technologies and following 2024 best practices.

## 🏥 Features
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── pages/        # Page components
│   │   ├── services/      # API service functions
│   │   └── utils/         # Frontend utilities
│   ├── public/
│   └── package.json
├── nginx/                 # Nginx configuration
│   └── nginx.conf
├── docker-compose.yml       # Container orchestration
└── README.md              # This file
```

## � Features

### Core Modules
- **🔐 Authentication**: JWT-based login with refresh tokens
- **👥 User Management**: Multi-role system with permissions
- **💰 Financial Management**: Invoicing, expenses, payments
- **👥 Customer Management**: Complete customer lifecycle
- **📦 Inventory Management**: Products, stock, tracking
- **📊 Reporting & Analytics**: Dashboard with real-time data
- **⚙️ System Settings**: Configurable business parameters

### Technical Features
- **🎨 Modern UI**: Responsive design with Tailwind CSS
- **🔒 Security**: Role-based access control, audit logging
- **📱 Mobile Responsive**: Works on all devices
- **🚀 Performance**: Optimized queries, caching with Redis
- **🐳 Containerized**: Docker for easy deployment
- **📡 Real-time**: WebSocket support for live updates

## 🛠️ Development

### Backend Technologies
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL 15+
- **Cache**: Redis for sessions
- **Auth**: JWT with refresh tokens
- **Validation**: Express-validator
- **File Upload**: Multer
- **Logging**: Winston

### Frontend Technologies
- **Framework**: React 18+
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **State**: Zustand
- **HTTP Client**: Axios
- **Charts**: Chart.js
- **Forms**: React Hook Form

## 🚀 Deployment

### Production Ready
- **SSL**: HTTPS with Let's Encrypt
- **Load Balancing**: Nginx reverse proxy
- **Database Backups**: Automated backups
- **Monitoring**: Health checks and logging
- **Scaling**: Horizontal scaling ready

## 📋 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `POST /api/auth/change-password` - Change password

### Customers
- `GET /api/customers` - List customers
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### Invoices
- `GET /api/invoices` - List invoices
- `POST /api/invoices` - Create invoice
- `PUT /api/invoices/:id` - Update invoice
- `DELETE /api/invoices/:id` - Delete invoice

### Reports
- `GET /api/reports/dashboard` - Dashboard data
- `GET /api/reports/financial` - Financial reports
- `GET /api/reports/customers` - Customer analytics

## 🔐 Security Features

- **JWT Authentication**: Secure token-based auth
- **Role-Based Access**: Granular permissions
- **Input Validation**: Sanitize all inputs
- **Rate Limiting**: Prevent brute force attacks
- **CORS**: Configured cross-origin requests
- **SQL Injection Prevention**: Parameterized queries
- **Audit Logging**: Track all user actions

## 📊 Database Schema

### Core Tables
- **users**: User accounts and roles
- **customers**: Customer information
- **invoices**: Billing and payments
- **expenses**: Financial expenses
- **products**: Product inventory
- **audit_log**: System audit trail
- **sessions**: Active user sessions

## 🎨 UI Features

- **Responsive Design**: Mobile-first approach
- **Dark Mode**: Theme switching capability
- **Loading States**: Skeleton screens
- **Error Handling**: User-friendly error pages
- **Accessibility**: WCAG 2.1 AA compliance
- **Micro-interactions**: Smooth animations

## 🧪 Testing

- **Unit Tests**: Jest for backend
- **Integration Tests**: Supertest for APIs
- **E2E Tests**: Playwright for user flows
- **Database Tests**: Query validation
- **Performance Tests**: Load testing

## 📈 Monitoring

- **Health Checks**: `/api/health` endpoint
- **Application Logs**: Winston structured logging
- **Performance Metrics**: Response times, error rates
- **Database Monitoring**: Connection pool status
- **Error Tracking**: Detailed error reporting

## 🚀 Getting Started

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd new-erp
   cp .env.example .env
   ```

2. **Start Development**
   ```bash
   docker-compose up -d
   docker-compose exec backend npm run migrate
   docker-compose exec backend npm run seed
   ```

3. **Access Application**
   - Open http://localhost in your browser
   - Login with default admin credentials
   - Explore all features

4. **Development Workflow**
   - Backend: `cd backend && npm run dev`
   - Frontend: `cd frontend && npm start`
   - Hot reload enabled for both

## � Next Steps

### Phase 1: Core Features
- [x] Authentication system
- [x] User management
- [x] Customer management
- [x] Dashboard with analytics
- [ ] Invoice management
- [ ] Expense tracking

### Phase 2: Advanced Features
- [ ] Inventory management
- [ ] Reporting system
- [ ] Multi-tenant support
- [ ] API documentation
- [ ] Mobile apps

### Phase 3: Enterprise Features
- [ ] Advanced analytics
- [ ] Workflow automation
- [ ] Integration APIs
- [ ] SaaS capabilities
- [ ] AI-powered insights

## 📞 Support

For support and documentation:
- **Documentation**: Check the `/docs` directory
- **Issues**: Report bugs via GitHub Issues
- **Features**: Request features via Discussions
- **Community**: Join our Discord server

---

## 🎉 Ready to Build!

This ERP system provides a solid foundation for modern business management. Start with the core features and extend as needed!

**Built with ❤️ using modern web technologies**
