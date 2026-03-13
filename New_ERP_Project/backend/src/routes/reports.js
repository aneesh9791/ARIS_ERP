const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/reports.log' })
  ]
});

// Get dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const { date_range = '30', center_id = '' } = req.query;
    
    let dateFilter = '';
    if (date_range === '7') {
      dateFilter = 'DATE_SUBTRACT(CURRENT_DATE, INTERVAL \'7 days\')';
    } else if (date_range === '30') {
      dateFilter = 'DATE_SUBTRACT(CURRENT_DATE, INTERVAL \'30 days\')';
    } else if (date_range === '90') {
      dateFilter = 'DATE_SUBTRACT(CURRENT_DATE, INTERVAL \'90 days\')';
    } else if (date_range === '365') {
      dateFilter = 'DATE_SUBTRACT(CURRENT_DATE, INTERVAL \'1 year\')';
    }

    // Revenue metrics
    const revenueQuery = `
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_revenue,
        COALESCE(AVG(CASE WHEN status = 'paid' THEN amount ELSE NULL END), 0) as avg_invoice_amount
      FROM invoices 
      WHERE ${dateFilter ? `created_at >= ${dateFilter}` : '1=1'}
    `;
    
    const revenueResult = await pool.query(revenueQuery);

    // Customer metrics
    const customerQuery = `
      SELECT 
        COUNT(*) as total_customers,
        COUNT(CASE WHEN active = true THEN 1 END) as active_customers,
        COUNT(CASE WHEN created_at >= ${dateFilter} THEN 1 END) as new_customers
      FROM customers 
      WHERE ${dateFilter ? `created_at >= ${dateFilter}` : '1=1'}
    `;
    
    const customerResult = await pool.query(customerQuery);

    // Patient metrics (if patients table exists)
    let patientMetrics = {};
    try {
      const patientQuery = `
        SELECT 
          COUNT(*) as total_patients,
          COUNT(CASE WHEN active = true THEN 1 END) as active_patients,
          COUNT(CASE WHEN created_at >= ${dateFilter} THEN 1 END) as new_patients
        FROM patients 
        WHERE ${dateFilter ? `created_at >= ${dateFilter}` : '1=1'}
      `;
      
      const patientResult = await pool.query(patientQuery);
      patientMetrics = patientResult.rows[0];
    } catch (error) {
      logger.warn('Patient metrics not available:', error.message);
    }

    // Expense metrics
    const expenseQuery = `
      SELECT 
        COUNT(*) as total_expenses,
        COALESCE(SUM(amount), 0) as total_expenses,
        COALESCE(AVG(amount), 0) as avg_expense,
        COALESCE(SUM(CASE WHEN category = 'utilities' THEN amount ELSE 0 END), 0) as utilities,
        COALESCE(SUM(CASE WHEN category = 'supplies' THEN amount ELSE 0 END), 0) as supplies
      FROM expenses 
      WHERE ${dateFilter ? `created_at >= ${dateFilter}` : '1=1'}
    `;
    
    const expenseResult = await pool.query(expenseQuery);

    // Product/Inventory metrics
    let inventoryMetrics = {};
    try {
      const inventoryQuery = `
        SELECT 
          COUNT(*) as total_products,
          COALESCE(SUM(stock_quantity), 0) as total_stock,
          COALESCE(SUM(stock_quantity * unit_price), 0) as total_inventory_value,
          COUNT(CASE WHEN stock_quantity <= reorder_level THEN 1 END) as low_stock_items
        FROM products 
        WHERE ${dateFilter ? `created_at >= ${dateFilter}` : '1=1'}
      `;
      
      const inventoryResult = await pool.query(inventoryQuery);
      inventoryMetrics = inventoryResult.rows[0];
    } catch (error) {
      logger.warn('Inventory metrics not available:', error.message);
    }

    const dashboardData = {
      revenue: revenueResult.rows[0] || {},
      customers: customerResult.rows[0] || {},
      patients: patientMetrics,
      expenses: expenseResult.rows[0] || {},
      inventory: inventoryMetrics,
      date_range,
      center_id
    };

    res.json(dashboardData);

  } catch (error) {
    logger.error('Dashboard data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Financial reports
router.get('/financial', async (req, res) => {
  try {
    const { 
      start_date = '', 
      end_date = '', 
      center_id = '', 
      report_type = 'summary' 
    } = req.query;

    let dateFilter = '';
    if (start_date && end_date) {
      dateFilter = `AND created_at >= '${start_date}' AND created_at <= '${end_date}'`;
    }

    let centerFilter = center_id ? `AND center_id = ${center_id}` : '';

    // Revenue by period
    const revenueQuery = `
      SELECT 
        DATE_TRUNC(created_at, 'month') as month,
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as revenue,
        COUNT(*) as invoice_count,
        AVG(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as avg_invoice
      FROM invoices 
      WHERE status = 'paid' ${dateFilter} ${centerFilter}
      GROUP BY DATE_TRUNC(created_at, 'month')
      ORDER BY month DESC
      LIMIT 12
    `;

    const revenueResult = await pool.query(revenueQuery);

    // Expenses by category
    const expenseQuery = `
      SELECT 
        category,
        SUM(amount) as total,
        COUNT(*) as count,
        AVG(amount) as average
      FROM expenses 
      WHERE 1=1 ${dateFilter} ${centerFilter}
      GROUP BY category
      ORDER BY total DESC
    `;

    const expenseResult = await pool.query(expenseQuery);

    // Top customers by revenue
    const topCustomersQuery = `
      SELECT 
        c.name,
        c.email,
        COALESCE(SUM(i.amount), 0) as total_revenue,
        COUNT(i.id) as invoice_count
      FROM customers c
      LEFT JOIN invoices i ON c.id = i.customer_id 
      WHERE i.status = 'paid' ${dateFilter} ${centerFilter}
      GROUP BY c.id, c.name, c.email
      ORDER BY total_revenue DESC
      LIMIT 10
    `;

    const topCustomersResult = await pool.query(topCustomersQuery);

    // Profit & Loss statement
    const profitLossQuery = `
      SELECT 
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as total_revenue,
        SUM(amount) as total_expenses,
        (SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) - SUM(amount)) as net_profit
      FROM (
        SELECT amount, status FROM invoices WHERE status = 'paid' ${dateFilter} ${centerFilter}
        UNION ALL
        SELECT amount, status FROM expenses WHERE 1=1 ${dateFilter} ${centerFilter}
      ) as combined
    `;

    const profitLossResult = await pool.query(profitLossQuery);

    const financialData = {
      revenue_by_month: revenueResult.rows,
      expenses_by_category: expenseResult.rows,
      top_customers: topCustomersResult.rows,
      profit_loss: profitLossResult.rows[0] || {},
      period: {
        start_date,
        end_date,
        center_id,
        report_type
      }
    };

    res.json(financialData);

  } catch (error) {
    logger.error('Financial report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Customer analytics
router.get('/customers', async (req, res) => {
  try {
    const { 
      start_date = '', 
      end_date = '', 
      center_id = '' 
    } = req.query;

    let dateFilter = '';
    if (start_date && end_date) {
      dateFilter = `AND created_at >= '${start_date}' AND created_at <= '${end_date}'`;
    }

    let centerFilter = center_id ? `AND center_id = ${center_id}` : '';

    // Customer acquisition
    const acquisitionQuery = `
      SELECT 
        DATE_TRUNC(created_at, 'month') as month,
        COUNT(*) as new_customers,
        COUNT(CASE WHEN active = true THEN 1 END) as active_customers
      FROM customers 
      WHERE 1=1 ${dateFilter} ${centerFilter}
      GROUP BY DATE_TRUNC(created_at, 'month')
      ORDER BY month DESC
      LIMIT 12
    `;

    const acquisitionResult = await pool.query(acquisitionQuery);

    // Customer retention
    const retentionQuery = `
      SELECT 
        COUNT(CASE WHEN last_order_date >= '${start_date || '1970-01-01'}' THEN 1 END) as returning_customers,
        COUNT(CASE WHEN last_order_date < '${start_date || '1970-01-01'}' THEN 1 END) as new_customers
      FROM customers 
      WHERE active = true ${centerFilter}
    `;

    const retentionResult = await pool.query(retentionQuery);

    // Customer demographics
    const demographicsQuery = `
      SELECT 
        COUNT(*) as total_customers,
        COUNT(CASE WHEN gender = 'male' THEN 1 END) as male_customers,
        COUNT(CASE WHEN gender = 'female' THEN 1 END) as female_customers,
        COUNT(CASE WHEN age BETWEEN 18 AND 25 THEN 1 END) as age_18_25,
        COUNT(CASE WHEN age BETWEEN 26 AND 35 THEN 1 END) as age_26_35,
        COUNT(CASE WHEN age BETWEEN 36 AND 50 THEN 1 END) as age_36_50,
        COUNT(CASE WHEN age > 50 THEN 1 END) as age_over_50
      FROM (
        SELECT *, 
          EXTRACT(YEAR FROM AGE(date_of_birth)) as age
        FROM customers 
        WHERE active = true ${centerFilter}
      ) as age_groups
    `;

    const demographicsResult = await pool.query(demographicsQuery);

    // Geographic distribution
    const geographicQuery = `
      SELECT 
        c.city,
        c.state,
        COUNT(*) as customer_count
      FROM customers c
      WHERE c.active = true ${centerFilter}
      GROUP BY c.city, c.state
      ORDER BY customer_count DESC
      LIMIT 20
    `;

    const geographicResult = await pool.query(geographicQuery);

    const customerData = {
      acquisition: acquisitionResult.rows,
      retention: retentionResult.rows,
      demographics: demographicsResult.rows,
      geographic: geographicResult.rows,
      period: {
        start_date,
        end_date,
        center_id
      }
    };

    res.json(customerData);

  } catch (error) {
    logger.error('Customer analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Inventory reports
router.get('/inventory', async (req, res) => {
  try {
    const { center_id = '' } = req.query;

    let centerFilter = center_id ? `WHERE center_id = ${center_id}` : '';

    // Stock levels
    const stockQuery = `
      SELECT 
        p.name,
        p.sku,
        p.stock_quantity,
        p.unit_price,
        p.reorder_level,
        p.stock_quantity * p.unit_price as inventory_value,
        CASE 
          WHEN p.stock_quantity <= p.reorder_level THEN 'Low Stock'
          WHEN p.stock_quantity <= p.reorder_level * 1.5 THEN 'Medium Stock'
          ELSE 'Good Stock'
        END as stock_status
      FROM products p
      ${centerFilter}
      ORDER BY inventory_value DESC
    `;

    const stockResult = await pool.query(stockQuery);

    // Inventory movements
    const movementQuery = `
      SELECT 
        DATE_TRUNC(created_at, 'day') as date,
        SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END) as stock_in,
        SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END) as stock_out,
        COUNT(*) as transactions
      FROM inventory_movements 
      WHERE 1=1 ${centerFilter}
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE_TRUNC(created_at, 'day')
      ORDER BY date DESC
      LIMIT 30
    `;

    let movementResult = {};
    try {
      movementResult = await pool.query(movementQuery);
    } catch (error) {
      logger.warn('Inventory movements not available:', error.message);
    }

    // Top products by value
    const topProductsQuery = `
      SELECT 
        p.name,
        p.stock_quantity,
        p.unit_price,
        p.stock_quantity * p.unit_price as inventory_value,
        p.category
      FROM products p
      ${centerFilter}
      ORDER BY inventory_value DESC
      LIMIT 20
    `;

    const topProductsResult = await pool.query(topProductsQuery);

    const inventoryData = {
      stock_levels: stockResult.rows,
      movements: movementResult.rows || [],
      top_products: topProductsResult.rows,
      center_id
    };

    res.json(inventoryData);

  } catch (error) {
    logger.error('Inventory report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sales performance
router.get('/sales', async (req, res) => {
  try {
    const { 
      start_date = '', 
      end_date = '', 
      center_id = '' 
    } = req.query;

    let dateFilter = '';
    if (start_date && end_date) {
      dateFilter = `AND i.created_at >= '${start_date}' AND i.created_at <= '${end_date}'`;
    }

    let centerFilter = center_id ? `AND i.center_id = ${center_id}` : '';

    // Sales by period
    const salesQuery = `
      SELECT 
        DATE_TRUNC(i.created_at, 'month') as month,
        COUNT(*) as invoice_count,
        SUM(i.amount) as revenue,
        AVG(i.amount) as avg_sale,
        COUNT(DISTINCT i.customer_id) as unique_customers
      FROM invoices i
      WHERE i.status = 'paid' ${dateFilter} ${centerFilter}
      GROUP BY DATE_TRUNC(i.created_at, 'month')
      ORDER BY month DESC
      LIMIT 12
    `;

    const salesResult = await pool.query(salesQuery);

    // Sales by product
    const salesByProductQuery = `
      SELECT 
        p.name as product_name,
        SUM(ii.quantity) as total_sold,
        SUM(ii.quantity * ii.unit_price) as total_revenue,
        COUNT(*) as sale_count
      FROM invoice_items ii
      LEFT JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN products p ON ii.product_id = p.id
      WHERE i.status = 'paid' ${dateFilter} ${centerFilter}
      GROUP BY p.id, p.name
      ORDER BY total_revenue DESC
      LIMIT 20
    `;

    const salesByProductResult = await pool.query(salesByProductQuery);

    // Sales performance by staff
    const staffPerformanceQuery = `
      SELECT 
        u.name as staff_name,
        COUNT(i.id) as sales_count,
        SUM(i.amount) as total_revenue,
        AVG(i.amount) as avg_sale
      FROM invoices i
      LEFT JOIN users u ON i.created_by = u.id
      WHERE i.status = 'paid' ${dateFilter} ${centerFilter}
      GROUP BY u.id, u.name
      ORDER BY total_revenue DESC
      LIMIT 10
    `;

    let staffPerformanceResult = {};
    try {
      staffPerformanceResult = await pool.query(staffPerformanceQuery);
    } catch (error) {
      logger.warn('Staff performance not available:', error.message);
    }

    const salesData = {
      sales_by_period: salesResult.rows,
      sales_by_product: salesByProductResult.rows,
      staff_performance: staffPerformanceResult.rows || [],
      period: {
        start_date,
        end_date,
        center_id
      }
    };

    res.json(salesData);

  } catch (error) {
    logger.error('Sales report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export reports (CSV/Excel)
router.post('/export', [
  body('report_type').isIn(['dashboard', 'financial', 'customers', 'inventory', 'sales']),
  body('format').isIn(['csv', 'excel']),
  body('start_date').isISO8601().toDate(),
  body('end_date').isISO8601().toDate(),
  body('center_id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { report_type, format, start_date, end_date, center_id } = req.body;

    let dateFilter = '';
    if (start_date && end_date) {
      dateFilter = `AND created_at >= '${start_date}' AND created_at <= '${end_date}'`;
    }

    let centerFilter = center_id ? `AND center_id = ${center_id}` : '';

    // Get data based on report type
    let data = [];
    let filename = '';

    switch (report_type) {
      case 'dashboard':
        filename = `dashboard_report_${Date.now()}.${format}`;
        const dashboardQuery = `
          SELECT 'Dashboard Data' as report_type,
          CURRENT_DATE as report_date,
          JSON_BUILD_OBJECT(
            'revenue', (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE status = 'paid' ${dateFilter}),
            'customers', (SELECT COUNT(*) FROM customers WHERE active = true ${dateFilter}),
            'expenses', (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE 1=1 ${dateFilter})
          ) as data
          FROM (SELECT 1) dummy
        `;
        const dashboardResult = await pool.query(dashboardQuery);
        data = dashboardResult.rows;
        break;

      case 'financial':
        filename = `financial_report_${Date.now()}.${format}`;
        const financialQuery = `
          SELECT 'Financial Report' as report_type,
          CURRENT_DATE as report_date,
          JSON_BUILD_OBJECT(
            'revenue_by_month', (SELECT JSON_AGG(CASE WHEN status = 'paid' THEN amount END ORDER BY month) FROM invoices WHERE status = 'paid' ${dateFilter}),
            'expenses_by_category', (SELECT JSON_OBJECT_AGG(category, SUM(amount)) FROM expenses WHERE 1=1 ${dateFilter})
          ) as data
          FROM (SELECT 1) dummy
        `;
        const financialResult = await pool.query(financialQuery);
        data = financialResult.rows;
        break;

      case 'customers':
        filename = `customers_report_${Date.now()}.${format}`;
        const customerQuery = `
          SELECT 'Customer Report' as report_type,
          CURRENT_DATE as report_date,
          JSON_BUILD_OBJECT(
            'total_customers', (SELECT COUNT(*) FROM customers WHERE active = true ${dateFilter}),
            'new_customers', (SELECT COUNT(*) FROM customers WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' ${dateFilter}),
            'demographics', (SELECT JSON_BUILD_OBJECT('male', (SELECT COUNT(*) FROM customers WHERE gender = 'male' AND active = true ${dateFilter}), 'female', (SELECT COUNT(*) FROM customers WHERE gender = 'female' AND active = true ${dateFilter})) FROM customers WHERE active = true ${dateFilter})
          ) as data
          FROM (SELECT 1) dummy
        `;
        const customerResult = await pool.query(customerQuery);
        data = customerResult.rows;
        break;

      case 'inventory':
        filename = `inventory_report_${Date.now()}.${format}`;
        const inventoryQuery = `
          SELECT 'Inventory Report' as report_type,
          CURRENT_DATE as report_date,
          JSON_BUILD_OBJECT(
            'stock_levels', (SELECT JSON_AGG(JSON_BUILD_OBJECT('name', stock_quantity, 'unit_price', 'stock_status') ORDER BY inventory_value DESC) FROM products p ${centerFilter})
          ) as data
          FROM (SELECT 1) dummy
        `;
        const inventoryResult = await pool.query(inventoryQuery);
        data = inventoryResult.rows;
        break;

      case 'sales':
        filename = `sales_report_${Date.now()}.${format}`;
        const salesQuery = `
          SELECT 'Sales Report' as report_type,
          CURRENT_DATE as report_date,
          JSON_BUILD_OBJECT(
            'sales_by_month', (SELECT JSON_AGG(CASE WHEN status = 'paid' THEN amount END ORDER BY month) FROM invoices WHERE status = 'paid' ${dateFilter}),
            'top_products', (SELECT JSON_AGG(JSON_BUILD_OBJECT('name', total_sold, total_revenue) ORDER BY total_revenue DESC) FROM invoice_items ii LEFT JOIN invoices i ON ii.invoice_id = i.id LEFT JOIN products p ON ii.product_id = p.id WHERE i.status = 'paid' ${dateFilter})
          ) as data
          FROM (SELECT 1) dummy
        `;
        const salesResult = await pool.query(salesQuery);
        data = salesResult.rows;
        break;
    }

    // Create CSV or Excel response
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Convert JSON to CSV
      const csv = convertToCSV(data);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Convert JSON to Excel (simplified)
      const excel = convertToExcel(data);
      res.send(excel);
    }

    logger.info(`Report exported: ${report_type} as ${filename}`);

  } catch (error) {
    logger.error('Export report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to convert JSON to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header] || '';
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',');
  });
  
  return csvHeaders + '\n' + csvRows.join('\n');
}

// Helper function to convert JSON to Excel (simplified)
function convertToExcel(data) {
  if (!data || data.length === 0) return '';
  
  // Simple Excel format (tab-separated values)
  const headers = Object.keys(data[0]);
  const excelHeaders = headers.join('\t');
  
  const excelRows = data.map(row => {
    return headers.map(header => {
      const value = row[header] || '';
      return String(value).replace(/\t/g, ' ').replace(/\n/g, '\\n');
    }).join('\t');
  });
  
  return excelHeaders + '\n' + excelRows.join('\n');
}

module.exports = router;
