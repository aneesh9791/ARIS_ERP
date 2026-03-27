const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();

// Chart of Accounts Management Class
class ChartOfAccounts {
  // Get chart of accounts with hierarchy
  static async getChartOfAccounts(filters = {}) {
    try {
      const { account_type, account_category, parent_account_id, is_active, include_balances = true } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (account_type) {
        whereClause += ` AND coa.account_type = $${paramIndex++}`;
        queryParams.push(account_type);
      }

      if (account_category) {
        whereClause += ` AND coa.account_category = $${paramIndex++}`;
        queryParams.push(account_category);
      }

      if (parent_account_id !== undefined) {
        if (parent_account_id === null) {
          whereClause += ` AND coa.parent_account_id IS NULL`;
        } else {
          whereClause += ` AND coa.parent_account_id = $${paramIndex++}`;
          queryParams.push(parent_account_id);
        }
      }

      if (is_active !== undefined) {
        whereClause += ` AND coa.is_active = $${paramIndex++}`;
        queryParams.push(is_active);
      }

      const balanceSelect = include_balances ? `
        COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) as current_balance,
        CASE
          WHEN COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) > 0
          THEN COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)
          ELSE 0
        END as debit_balance,
        CASE
          WHEN COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0) > 0
          THEN COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0)
          ELSE 0
        END as credit_balance,
        COUNT(jel.id) as transaction_count,
        COALESCE(SUM(jel.debit_amount), 0) as total_debits,
        COALESCE(SUM(jel.credit_amount), 0) as total_credits,
        MAX(je.entry_date) as last_transaction_date
      ` : 'NULL as current_balance, NULL as debit_balance, NULL as credit_balance, 0 as transaction_count';

      const query = `
        SELECT 
          coa.id,
          coa.account_code,
          coa.account_name,
          coa.account_type,
          coa.account_category,
          coa.account_subcategory,
          coa.parent_account_id,
          coa.account_level,
          coa.nature,
          coa.normal_balance,
          ${balanceSelect},
          coa.description,
          coa.opening_balance,
          coa.currency,
          coa.is_consolidated,
          coa.is_active,
          coa.requires_approval,
          coa.approval_limit,
          coa.tax_applicable,
          coa.gst_rate,
          coa.tds_applicable,
          coa.tds_rate,
          coa.department_id,
          coa.center_id,
          d.name as department_name,
          c.name as center_name,
          parent.account_name as parent_account_name,
          parent.account_code as parent_account_code,
          CASE 
            WHEN coa.parent_account_id IS NULL THEN 'Root'
            ELSE 'Child'
          END as hierarchy_level,
          CASE 
            WHEN coa.is_consolidated THEN 'consolidated'
            WHEN coa.requires_approval THEN 'restricted'
            ELSE 'normal'
          END as account_class
        FROM chart_of_accounts coa
        LEFT JOIN departments d ON coa.department_id = d.id
        LEFT JOIN centers c ON coa.center_id = c.id
        LEFT JOIN chart_of_accounts parent ON coa.parent_account_id = parent.id
        LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
        LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'POSTED'
        WHERE ${whereClause}
        GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type, coa.account_category, 
                 coa.account_subcategory, coa.parent_account_id, coa.account_level, coa.nature, 
                 coa.normal_balance, coa.description, coa.opening_balance, coa.currency, 
                 coa.is_consolidated, coa.is_active, coa.requires_approval, coa.approval_limit, 
                 coa.tax_applicable, coa.gst_rate, coa.tds_applicable, coa.tds_rate, 
                 coa.department_id, coa.center_id, d.name, c.name, parent.account_name, parent.account_code
        ORDER BY coa.account_code
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting chart of accounts:', error);
      throw error;
    }
  }

  // Create new account
  static async createAccount(accountData) {
    try {
      const {
        account_code,
        account_name,
        account_type,
        account_category,
        account_subcategory,
        parent_account_id,
        nature,
        normal_balance,
        description,
        opening_balance = 0,
        currency = 'INR',
        is_consolidated = false,
        requires_approval = false,
        approval_limit = 0,
        tax_applicable = false,
        gst_rate = 0,
        tds_applicable = false,
        tds_rate = 0,
        department_id,
        center_id,
        created_by
      } = accountData;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Calculate account level
        let accountLevel = 1;
        if (parent_account_id) {
          const parentResult = await client.query(
            'SELECT account_level FROM chart_of_accounts WHERE id = $1',
            [parent_account_id]
          );
          if (parentResult.rows.length > 0) {
            accountLevel = parentResult.rows[0].account_level + 1;
          }
        }

        // Insert account
        const query = `
          INSERT INTO chart_of_accounts (
            account_code, account_name, account_type, account_category, account_subcategory,
            parent_account_id, account_level, nature, normal_balance, description,
            opening_balance, current_balance, currency, is_consolidated, requires_approval,
            approval_limit, tax_applicable, gst_rate, tds_applicable, tds_rate,
            department_id, center_id, created_by, created_at, updated_at, updated_by
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20,
            $21, $22, $23, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $24
          ) RETURNING *
        `;

        const result = await client.query(query, [
          account_code, account_name, account_type, account_category, account_subcategory,
          parent_account_id, accountLevel, nature, normal_balance, description,
          opening_balance, opening_balance, currency, is_consolidated, requires_approval,
          approval_limit, tax_applicable, gst_rate, tds_applicable, tds_rate,
          department_id, center_id, created_by, created_by
        ]);

        await client.query('COMMIT');
        
        logger.info(`Chart of account created: ${account_code} - ${account_name}`);
        return result.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error creating chart of account:', error);
      throw error;
    }
  }

  // Get transaction types
  static async getTransactionTypes(filters = {}) {
    try {
      const { is_active } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (is_active !== undefined) {
        whereClause += ` AND tt.is_active = $${paramIndex++}`;
        queryParams.push(is_active);
      }

      const query = `
        SELECT 
          tt.*,
          debit_account.account_name as debit_account_name,
          debit_account.account_code as debit_account_code,
          credit_account.account_name as credit_account_name,
          credit_account.account_code as credit_account_code
        FROM transaction_types tt
        LEFT JOIN chart_of_accounts debit_account ON tt.default_debit_account_id = debit_account.id
        LEFT JOIN chart_of_accounts credit_account ON tt.default_credit_account_id = credit_account.id
        WHERE ${whereClause}
        ORDER BY tt.type_name
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting transaction types:', error);
      throw error;
    }
  }

  // Create journal entry
  static async createJournalEntry(entryData) {
    try {
      const {
        entry_date,
        transaction_type_id,
        reference_type,
        reference_id,
        description,
        lines,
        center_id,
        department_id,
        created_by
      } = entryData;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Validate and prepare lines
        let totalDebit = 0;
        let totalCredit = 0;
        const processedLines = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const debitAmount = parseFloat(line.debit_amount) || 0;
          const creditAmount = parseFloat(line.credit_amount) || 0;

          totalDebit += debitAmount;
          totalCredit += creditAmount;

          processedLines.push({
            account_id: line.account_id,
            description: line.description,
            debit_amount: debitAmount,
            credit_amount: creditAmount
          });
        }

        // Validate debits equal credits
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          throw new Error(`Total debits (${totalDebit}) must equal total credits (${totalCredit})`);
        }

        // Generate entry number
        const entryNumber = `JE-${new Date(entry_date).toLocaleDateString('en-CA').replace(/-/g, '')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

        // Create journal entry
        const entryQuery = `
          INSERT INTO journal_entries (
            entry_number, entry_date, transaction_type_id, reference_type,
            reference_id, description, total_debit, total_credit,
            center_id, department_id, created_by, created_at
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11, CURRENT_TIMESTAMP
          ) RETURNING *
        `;

        const entryResult = await client.query(entryQuery, [
          entryNumber, entry_date, transaction_type_id, reference_type,
          reference_id, description, totalDebit, totalCredit,
          center_id, department_id, created_by
        ]);

        const newEntry = entryResult.rows[0];

        // Create journal entry lines
        for (let i = 0; i < processedLines.length; i++) {
          const line = processedLines[i];

          await client.query(`
            INSERT INTO journal_entry_lines (
              journal_entry_id, line_number, account_id, description,
              debit_amount, credit_amount, created_at
            ) VALUES (
              $1, $2, $3, $4,
              $5, $6, CURRENT_TIMESTAMP
            )
          `, [
            newEntry.id, i + 1, line.account_id, line.description,
            line.debit_amount, line.credit_amount
          ]);

          // Update account balance
          await client.query(`
            UPDATE chart_of_accounts 
            SET current_balance = current_balance + 
              CASE 
                WHEN coa.normal_balance = 'DEBIT' THEN 
                  $1 - $2
                ELSE 
                  $2 - $1
              END,
              updated_at = CURRENT_TIMESTAMP
            FROM chart_of_accounts coa
            WHERE coa.id = $3
          `, [line.debit_amount, line.credit_amount, line.account_id]);
        }

        await client.query('COMMIT');
        
        logger.info(`Journal entry created: ${entryNumber}`);
        return newEntry;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error creating journal entry:', error);
      throw error;
    }
  }

  // Get journal entries
  static async getJournalEntries(filters = {}) {
    try {
      const {
        entry_date_from,
        entry_date_to,
        transaction_type_id,
        status,
        center_id,
        department_id,
        reference_type,
        reference_id,
        page = 1,
        limit = 50
      } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (entry_date_from && entry_date_to) {
        whereClause += ` AND je.entry_date BETWEEN $${paramIndex++} AND $${paramIndex++}`;
        queryParams.push(entry_date_from, entry_date_to);
      }

      if (transaction_type_id) {
        whereClause += ` AND je.transaction_type_id = $${paramIndex++}`;
        queryParams.push(transaction_type_id);
      }

      if (status) {
        whereClause += ` AND je.status = $${paramIndex++}`;
        queryParams.push(status);
      }

      if (center_id) {
        whereClause += ` AND je.center_id = $${paramIndex++}`;
        queryParams.push(center_id);
      }

      if (department_id) {
        whereClause += ` AND je.department_id = $${paramIndex++}`;
        queryParams.push(department_id);
      }

      if (reference_type) {
        whereClause += ` AND je.reference_type = $${paramIndex++}`;
        queryParams.push(reference_type);
      }

      if (reference_id) {
        whereClause += ` AND je.reference_id = $${paramIndex++}`;
        queryParams.push(reference_id);
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          je.*,
          tt.type_name as transaction_type,
          c.name as center_name,
          d.name as department_name,
          creator.name as created_by_name,
          approver.name as approved_by_name,
          poster.name as posted_by_name,
          COUNT(jel.id) as line_count,
          STRING_AGG(DISTINCT coa.account_name, ', ') as affected_accounts
        FROM journal_entries je
        LEFT JOIN transaction_types tt ON je.transaction_type_id = tt.id
        LEFT JOIN centers c ON je.center_id = c.id
        LEFT JOIN departments d ON je.department_id = d.id
        LEFT JOIN users creator ON je.created_by = creator.id
        LEFT JOIN users approver ON je.approved_by = approver.id
        LEFT JOIN users poster ON je.posted_by = poster.id
        LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        LEFT JOIN chart_of_accounts coa ON jel.account_id = coa.id
        WHERE ${whereClause}
        GROUP BY je.id, je.entry_number, je.entry_date, tt.type_name, je.reference_type, 
                 je.reference_id, je.description, je.total_debit, je.total_credit, je.status,
                 je.currency, c.name, d.name, creator.name, approver.name, poster.name
        ORDER BY je.entry_date DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(limit, offset);

      const countQuery = `
        SELECT COUNT(DISTINCT je.id) as total
        FROM journal_entries je
        WHERE ${whereClause}
      `;

      const [result, countResult] = await Promise.all([
        pool.query(query, queryParams),
        pool.query(countQuery, queryParams.slice(0, -2))
      ]);

      return {
        entries: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      };
    } catch (error) {
      logger.error('Error getting journal entries:', error);
      throw error;
    }
  }

  // Get trial balance
  static async getTrialBalance(periodId) {
    try {
      const query = `
        SELECT 
          coa.account_code,
          coa.account_name,
          coa.account_type,
          coa.account_category,
          coa.normal_balance,
          COALESCE(coa.opening_balance, 0) as opening_balance,
          COALESCE(SUM(jel.debit_amount), 0) as total_debits,
          COALESCE(SUM(jel.credit_amount), 0) as total_credits,
          COALESCE(coa.opening_balance, 0) + 
            CASE 
              WHEN coa.normal_balance = 'DEBIT' THEN 
                COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)
              ELSE 
                COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0)
            END as closing_balance,
          CASE 
            WHEN coa.normal_balance = 'DEBIT' THEN 
              COALESCE(coa.opening_balance, 0) + 
              (COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0))
            ELSE 0
          END as debit_balance,
          CASE 
            WHEN coa.normal_balance = 'CREDIT' THEN 
              COALESCE(coa.opening_balance, 0) + 
              (COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0))
            ELSE 0
          END as credit_balance
        FROM chart_of_accounts coa
        LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
        LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id 
          AND je.status = 'POSTED'
          AND je.entry_date >= (SELECT start_date FROM financial_periods WHERE id = $1)
          AND je.entry_date <= (SELECT end_date FROM financial_periods WHERE id = $1)
        WHERE coa.is_active = true
        GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type, 
                 coa.account_category, coa.normal_balance, coa.opening_balance
        ORDER BY coa.account_code
      `;

      const result = await pool.query(query, [periodId]);

      // Calculate totals
      const totals = result.rows.reduce((acc, row) => {
        acc.total_debits += row.debit_balance;
        acc.total_credits += row.credit_balance;
        return acc;
      }, { total_debits: 0, total_credits: 0 });

      return {
        period_id: periodId,
        accounts: result.rows,
        totals: totals,
        is_balanced: Math.abs(totals.total_debits - totals.total_credits) < 0.01
      };
    } catch (error) {
      logger.error('Error getting trial balance:', error);
      throw error;
    }
  }

  // Get balance sheet
  static async getBalanceSheet(periodId) {
    try {
      const query = `
        WITH account_balances AS (
          SELECT 
            coa.account_type,
            coa.account_category,
            coa.account_name,
            coa.normal_balance,
            COALESCE(coa.opening_balance, 0) + 
              CASE 
                WHEN coa.normal_balance = 'DEBIT' THEN 
                  COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)
                ELSE 
                  COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0)
              END as balance
          FROM chart_of_accounts coa
          LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
          LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id 
            AND je.status = 'POSTED'
            AND je.entry_date >= (SELECT start_date FROM financial_periods WHERE id = $1)
            AND je.entry_date <= (SELECT end_date FROM financial_periods WHERE id = $1)
          WHERE coa.is_active = true
          GROUP BY coa.id, coa.account_type, coa.account_category, coa.account_name, coa.normal_balance, coa.opening_balance
        )
        SELECT 
          account_type,
          account_category,
          SUM(CASE WHEN normal_balance = 'DEBIT' THEN balance ELSE 0 END) as debit_balance,
          SUM(CASE WHEN normal_balance = 'CREDIT' THEN balance ELSE 0 END) as credit_balance
        FROM account_balances
        GROUP BY account_type, account_category
        ORDER BY account_type, account_category
      `;

      const result = await pool.query(query, [periodId]);

      // Calculate totals
      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalEquity = 0;

      result.rows.forEach(row => {
        if (row.account_type === 'ASSET') {
          totalAssets += row.debit_balance;
        } else if (row.account_type === 'LIABILITY') {
          totalLiabilities += row.credit_balance;
        } else if (row.account_type === 'EQUITY') {
          totalEquity += row.credit_balance;
        }
      });

      return {
        period_id: periodId,
        assets: result.rows.filter(row => row.account_type === 'ASSET'),
        liabilities: result.rows.filter(row => row.account_type === 'LIABILITY'),
        equity: result.rows.filter(row => row.account_type === 'EQUITY'),
        totals: {
          total_assets: totalAssets,
          total_liabilities: totalLiabilities,
          total_equity: totalEquity,
          total_liabilities_equity: totalLiabilities + totalEquity
        },
        is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
      };
    } catch (error) {
      logger.error('Error getting balance sheet:', error);
      throw error;
    }
  }

  // Get profit and loss statement
  static async getProfitLoss(periodId) {
    try {
      const query = `
        WITH account_balances AS (
          SELECT 
            coa.account_type,
            coa.account_category,
            coa.account_name,
            coa.normal_balance,
            COALESCE(SUM(jel.debit_amount), 0) as total_debits,
            COALESCE(SUM(jel.credit_amount), 0) as total_credits
          FROM chart_of_accounts coa
          LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
          LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id 
            AND je.status = 'POSTED'
            AND je.entry_date >= (SELECT start_date FROM financial_periods WHERE id = $1)
            AND je.entry_date <= (SELECT end_date FROM financial_periods WHERE id = $1)
          WHERE coa.is_active = true
            AND coa.account_type IN ('REVENUE', 'EXPENSE')
          GROUP BY coa.id, coa.account_type, coa.account_category, coa.account_name, coa.normal_balance
        )
        SELECT 
          account_type,
          account_category,
          account_name,
          CASE 
            WHEN account_type = 'REVENUE' THEN total_credits - total_debits
            WHEN account_type = 'EXPENSE' THEN total_debits - total_credits
            ELSE 0
          END as net_amount
        FROM account_balances
        ORDER BY account_type, account_category
      `;

      const result = await pool.query(query, [periodId]);

      // Calculate totals
      let totalRevenue = 0;
      let totalExpenses = 0;

      result.rows.forEach(row => {
        if (row.account_type === 'REVENUE') {
          totalRevenue += row.net_amount;
        } else if (row.account_type === 'EXPENSE') {
          totalExpenses += row.net_amount;
        }
      });

      const grossProfit = totalRevenue;
      const operatingExpenses = totalExpenses;
      const netIncome = grossProfit - operatingExpenses;

      return {
        period_id: periodId,
        revenue: result.rows.filter(row => row.account_type === 'REVENUE'),
        expenses: result.rows.filter(row => row.account_type === 'EXPENSE'),
        totals: {
          total_revenue: totalRevenue,
          total_expenses: totalExpenses,
          gross_profit: grossProfit,
          operating_expenses: operatingExpenses,
          net_income: netIncome
        }
      };
    } catch (error) {
      logger.error('Error getting profit and loss:', error);
      throw error;
    }
  }

  // Get cost centers
  static async getCostCenters(filters = {}) {
    try {
      const { center_id, is_active } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (center_id) {
        whereClause += ` AND cc.center_id = $${paramIndex++}`;
        queryParams.push(center_id);
      }

      if (is_active !== undefined) {
        whereClause += ` AND cc.is_active = $${paramIndex++}`;
        queryParams.push(is_active);
      }

      const query = `
        SELECT 
          cc.*,
          c.name as center_name,
          d.name as department_name,
          manager.name as manager_name,
          CASE 
            WHEN cc.budget_limit > 0 THEN ROUND((cc.current_expense / cc.budget_limit) * 100, 2)
            ELSE 0
          END as budget_utilization_percentage,
          CASE 
            WHEN cc.current_expense > cc.budget_limit THEN 'OVER_BUDGET'
            WHEN cc.current_expense > cc.budget_limit * 0.9 THEN 'NEAR_LIMIT'
            ELSE 'WITHIN_BUDGET'
          END as budget_status
        FROM cost_centers cc
        LEFT JOIN centers c ON cc.center_id = c.id
        LEFT JOIN departments d ON cc.department_id = d.id
        LEFT JOIN users manager ON cc.manager_id = manager.id
        WHERE ${whereClause}
        ORDER BY cc.cost_center_code
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting cost centers:', error);
      throw error;
    }
  }

  // Get account reconciliation
  static async getAccountReconciliation(accountId, reconciliationDate) {
    try {
      const query = `
        SELECT 
          ar.*,
          coa.account_code,
          coa.account_name,
          coa.current_balance as book_balance
        FROM account_reconciliation ar
        LEFT JOIN chart_of_accounts coa ON ar.account_id = coa.id
        WHERE ar.account_id = $1 AND ar.reconciliation_date = $2
      `;

      const result = await pool.query(query, [accountId, reconciliationDate]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting account reconciliation:', error);
      throw error;
    }
  }

  // Create account reconciliation
  static async createReconciliation(reconciliationData) {
    try {
      const {
        account_id,
        reconciliation_date,
        statement_balance,
        reconciled_items,
        unreconciled_items,
        notes,
        reconciled_by
      } = reconciliationData;

      // Get book balance
      const bookBalanceResult = await pool.query(
        'SELECT current_balance FROM chart_of_accounts WHERE id = $1',
        [account_id]
      );

      if (bookBalanceResult.rows.length === 0) {
        throw new Error('Account not found');
      }

      const bookBalance = bookBalanceResult.rows[0].current_balance;
      const difference = statement_balance - bookBalance;

      const query = `
        INSERT INTO account_reconciliation (
          account_id, reconciliation_date, statement_balance, book_balance,
          difference, reconciled_items, unreconciled_items, status,
          reconciled_by, reconciled_at, notes, created_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, CURRENT_TIMESTAMP, $10, CURRENT_TIMESTAMP
        ) RETURNING *
      `;

      const result = await pool.query(query, [
        account_id, reconciliation_date, statement_balance, bookBalance,
        difference, reconciled_items, unreconciled_items,
        Math.abs(difference) < 0.01 ? 'RECONCILED' : 'DISCREPANCY',
        reconciled_by, notes
      ]);

      logger.info(`Account reconciliation created for account ${account_id}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating account reconciliation:', error);
      throw error;
    }
  }

  // Get financial periods
  static async getFinancialPeriods(filters = {}) {
    try {
      const { is_current, is_closed } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (is_current !== undefined) {
        whereClause += ` AND fp.is_current = $${paramIndex++}`;
        queryParams.push(is_current);
      }

      if (is_closed !== undefined) {
        whereClause += ` AND fp.is_closed = $${paramIndex++}`;
        queryParams.push(is_closed);
      }

      const query = `
        SELECT 
          fp.*,
          closer.name as closed_by_name
        FROM financial_periods fp
        LEFT JOIN users closer ON fp.closed_by = closer.id
        WHERE ${whereClause}
        ORDER BY fp.start_date DESC
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting financial periods:', error);
      throw error;
    }
  }

  // Get dashboard statistics
  static async getDashboardStats() {
    try {
      const queries = {
        total_accounts: 'SELECT COUNT(*) as count FROM chart_of_accounts WHERE is_active = true',
        active_journal_entries: 'SELECT COUNT(*) as count FROM journal_entries WHERE status = \'POSTED\'',
        pending_entries: 'SELECT COUNT(*) as count FROM journal_entries WHERE status = \'PENDING_APPROVAL\'',
        total_debits: 'SELECT COALESCE(SUM(debit_amount), 0) as count FROM journal_entry_lines jel JOIN journal_entries je ON jel.journal_entry_id = je.id WHERE je.status = \'POSTED\'',
        total_credits: 'SELECT COALESCE(SUM(credit_amount), 0) as count FROM journal_entry_lines jel JOIN journal_entries je ON jel.journal_entry_id = je.id WHERE je.status = \'POSTED\'',
        active_cost_centers: 'SELECT COUNT(*) as count FROM cost_centers WHERE is_active = true',
        pending_reconciliations: 'SELECT COUNT(*) as count FROM account_reconciliation WHERE status = \'PENDING\'',
        current_period: 'SELECT period_name FROM financial_periods WHERE is_current = true'
      };

      const results = await Promise.all(
        Object.entries(queries).map(([key, query]) => pool.query(query))
      );

      const stats = {};
      Object.keys(queries).forEach((key, index) => {
        if (key === 'current_period') {
          stats[key] = results[index].rows[0]?.period_name || 'N/A';
        } else {
          stats[key] = parseFloat(results[index].rows[0].count) || 0;
        }
      });

      return stats;
    } catch (error) {
      logger.error('Error getting dashboard stats:', error);
      throw error;
    }
  }
}

// API Routes

// Get chart of accounts
router.get('/accounts', async (req, res) => {
  try {
    const filters = {
      account_type: req.query.account_type,
      account_category: req.query.account_category,
      parent_account_id: req.query.parent_account_id,
      is_active: req.query.is_active,
      include_balances: req.query.include_balances
    };

    const accounts = await ChartOfAccounts.getChartOfAccounts(filters);
    
    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    logger.error('Error getting chart of accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create account
router.post('/accounts', authorizePermission('COA_WRITE'), [
  body('account_code').trim().isLength({ min: 2, max: 20 }),
  body('account_name').trim().isLength({ min: 3, max: 100 }),
  body('account_type').isIn(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  body('account_category').trim().isLength({ min: 2, max: 30 }),
  body('nature').isIn(['DEBIT', 'CREDIT']),
  body('normal_balance').isIn(['DEBIT', 'CREDIT']),
  body('created_by').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const account = await ChartOfAccounts.createAccount(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: account
    });
  } catch (error) {
    logger.error('Error creating account:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Get transaction types
router.get('/transaction-types', async (req, res) => {
  try {
    const filters = {
      is_active: req.query.is_active
    };

    const types = await ChartOfAccounts.getTransactionTypes(filters);
    
    res.json({
      success: true,
      data: types
    });
  } catch (error) {
    logger.error('Error getting transaction types:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create journal entry
router.post('/journal-entries', authorizePermission('JE_WRITE'), [
  body('entry_date').isISO8601().toDate(),
  body('transaction_type_id').isInt(),
  body('description').trim().isLength({ min: 5, max: 500 }),
  body('lines').isArray({ min: 2 }),
  body('created_by').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Validate lines
    for (const line of req.body.lines) {
      if (!line.account_id || (!line.debit_amount && !line.credit_amount)) {
        return res.status(400).json({
          success: false,
          message: 'Each line must have account_id and either debit_amount or credit_amount'
        });
      }
    }

    const entry = await ChartOfAccounts.createJournalEntry(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Journal entry created successfully',
      data: entry
    });
  } catch (error) {
    logger.error('Error creating journal entry:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Get journal entries
router.get('/journal-entries', async (req, res) => {
  try {
    const filters = {
      entry_date_from: req.query.entry_date_from,
      entry_date_to: req.query.entry_date_to,
      transaction_type_id: req.query.transaction_type_id,
      status: req.query.status,
      center_id: req.query.center_id,
      department_id: req.query.department_id,
      reference_type: req.query.reference_type,
      reference_id: req.query.reference_id,
      page: req.query.page,
      limit: req.query.limit
    };

    const result = await ChartOfAccounts.getJournalEntries(filters);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting journal entries:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get trial balance
router.get('/trial-balance', async (req, res) => {
  try {
    const { period_id } = req.query;
    
    if (!period_id) {
      return res.status(400).json({
        success: false,
        message: 'period_id is required'
      });
    }

    const trialBalance = await ChartOfAccounts.getTrialBalance(period_id);
    
    res.json({
      success: true,
      data: trialBalance
    });
  } catch (error) {
    logger.error('Error getting trial balance:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get balance sheet
router.get('/balance-sheet', async (req, res) => {
  try {
    const { period_id } = req.query;
    
    if (!period_id) {
      return res.status(400).json({
        success: false,
        message: 'period_id is required'
      });
    }

    const balanceSheet = await ChartOfAccounts.getBalanceSheet(period_id);
    
    res.json({
      success: true,
      data: balanceSheet
    });
  } catch (error) {
    logger.error('Error getting balance sheet:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get profit and loss
router.get('/profit-loss', async (req, res) => {
  try {
    const { period_id } = req.query;
    
    if (!period_id) {
      return res.status(400).json({
        success: false,
        message: 'period_id is required'
      });
    }

    const profitLoss = await ChartOfAccounts.getProfitLoss(period_id);
    
    res.json({
      success: true,
      data: profitLoss
    });
  } catch (error) {
    logger.error('Error getting profit and loss:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get cost centers
router.get('/cost-centers', async (req, res) => {
  try {
    const filters = {
      center_id: req.query.center_id,
      is_active: req.query.is_active
    };

    const costCenters = await ChartOfAccounts.getCostCenters(filters);
    
    res.json({
      success: true,
      data: costCenters
    });
  } catch (error) {
    logger.error('Error getting cost centers:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get account reconciliation
router.get('/reconciliation/:account_id', async (req, res) => {
  try {
    const { account_id } = req.params;
    const { reconciliation_date } = req.query;
    
    if (!reconciliation_date) {
      return res.status(400).json({
        success: false,
        message: 'reconciliation_date is required'
      });
    }

    const reconciliation = await ChartOfAccounts.getAccountReconciliation(account_id, reconciliation_date);
    
    res.json({
      success: true,
      data: reconciliation
    });
  } catch (error) {
    logger.error('Error getting account reconciliation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create account reconciliation
router.post('/reconciliation', authorizePermission('JE_WRITE'), [
  body('account_id').isInt(),
  body('reconciliation_date').isISO8601().toDate(),
  body('statement_balance').isFloat(),
  body('reconciled_by').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const reconciliation = await ChartOfAccounts.createReconciliation(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Account reconciliation created successfully',
      data: reconciliation
    });
  } catch (error) {
    logger.error('Error creating account reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Get financial periods
router.get('/financial-periods', async (req, res) => {
  try {
    const filters = {
      is_current: req.query.is_current,
      is_closed: req.query.is_closed
    };

    const periods = await ChartOfAccounts.getFinancialPeriods(filters);
    
    res.json({
      success: true,
      data: periods
    });
  } catch (error) {
    logger.error('Error getting financial periods:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get dashboard statistics
router.get('/dashboard/stats', async (req, res) => {
  try {
    const stats = await ChartOfAccounts.getDashboardStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled error in chart of accounts:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

module.exports = router;
