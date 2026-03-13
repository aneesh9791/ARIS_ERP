# Billing Operations Guide

## Overview
This guide covers the comprehensive bill operations system with role-based access control, including bill editing, discount management, cancellations, and refunds.

## 🔐 Role-Based Access Control (RBAC)

### User Roles
```
SUPER_ADMIN    - Full system access
ADMIN          - Administrative access
MANAGER        - Managerial access with approvals
ACCOUNTANT     - Financial operations
BILLING_CLERK  - Basic billing operations
RECEPTIONIST    - View-only access
VIEWER          - Read-only access
```

### Permission Matrix

| Operation | SUPER_ADMIN | ADMIN | MANAGER | ACCOUNTANT | BILLING_CLERK | RECEPTIONIST | VIEWER |
|------------|-------------|-------|---------|-----------|----------------|--------------|-------|
| Edit Bill | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete Bill | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cancel Bill | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Apply Discount | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve Discount | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Process Refund | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve Refund | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View Bill | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Financials | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

## 📝 Bill Operations

### 1. Edit Bill
**Endpoint**: `PUT /api/bills/:billId/edit`

**Permissions Required**: `EDIT_BILL`

**Editable Fields**:
- `payment_terms` - Payment terms (IMMEDIATE, NET15, NET30, NET45, NET60)
- `notes` - Bill notes
- `study_codes` - Study codes (recreates bill items)
- `billing_address` - Billing address
- `shipping_address` - Shipping address

**Status Restrictions**:
- Can only edit bills in status: `DRAFT`, `PENDING`, `POSTED`
- Cannot edit bills that are `VOIDED`, `WRITTEN_OFF`, or fully processed

**Example Request**:
```json
{
  "payment_terms": "NET30",
  "notes": "Updated payment terms per customer request",
  "study_codes": ["XRAY", "MRI"]
}
```

### 2. Apply Discount
**Endpoint**: `POST /api/bills/:billId/discount`

**Permissions Required**: `APPLY_DISCOUNT`

**Discount Types**:
- **Percentage**: Percentage-based discount (0-100%)
- **Fixed Amount**: Fixed amount discount

**Approval Requirements**:
- Discounts > 10% require managerial approval
- Fixed amount discounts > ₹1,000 require approval
- Manual approval flag can be set for any discount

**Example Request**:
```json
{
  "discount_type": "percentage",
  "discount_percentage": 15.5,
  "discount_reason": "Special discount for loyal customer",
  "requires_approval": false
}
```

**Business Logic**:
- Automatically recalculates GST amounts
- Updates taxable amount proportionally
- Maintains accounting entries
- Creates audit trail

### 3. Cancel Bill
**Endpoint**: `POST /api/bills/:billId/cancel`

**Permissions Required**: `CANCEL_BILL`

**Status Restrictions**:
- Can cancel bills in status: `DRAFT`, `PENDING`, `POSTED`, `PARTIALLY_PAID`
- Cannot cancel fully paid bills (use refund instead)

**Cancellation Process**:
1. Updates bill status to `VOIDED`
2. Updates payment status to `CANCELLED`
3. Processes automatic refund if amount paid > 0
4. Creates cancellation audit trail

**Example Request**:
```json
{
  "cancellation_reason": "Patient requested cancellation",
  "refund_amount": 500.00,
  "refund_method": "CASH",
  "refund_reference": "REF-001"
}
```

### 4. Process Refund
**Endpoint**: `POST /api/bills/:billId/refund`

**Permissions Required**: `PROCESS_REFUND`

**Status Restrictions**:
- Can refund bills in status: `FULLY_PAID`, `OVERPAID`, `PARTIALLY_PAID`
- Must have amount paid > 0

**Approval Requirements**:
- Refunds > ₹5,000 require managerial approval
- Manual approval flag can be set for any refund

**Refund Process**:
1. Creates refund payment record
2. Updates bill amounts and status
3. Generates unique refund number
4. Creates comprehensive audit trail

**Example Request**:
```json
{
  "refund_amount": 1500.00,
  "refund_reason": "Service not provided",
  "refund_method": "BANK_TRANSFER",
  "refund_reference": "BANK-REF-001",
  "requires_approval": false
}
```

### 5. Delete Bill
**Endpoint**: `DELETE /api/bills/:billId`

**Permissions Required**: `DELETE_BILL`

**Status Restrictions**:
- Can only delete bills in status: `DRAFT`, `PENDING`, `POSTED`
- Soft delete (marks as inactive, doesn't remove data)

**Deletion Process**:
1. Marks bill as inactive
2. Marks related items as inactive
3. Creates deletion audit trail
4. Preserves all data for compliance

### 6. View Bill History
**Endpoint**: `GET /api/bills/:billId/history`

**Permissions Required**: `VIEW_BILL`

**Returns**: Complete audit trail of all bill operations
- User information
- Timestamps
- Old and new values
- IP addresses and user agents

## 🔍 Audit Trail System

### Audit Entries Structure
```json
{
  "id": 123,
  "action": "APPLY_DISCOUNT",
  "user_name": "John Doe",
  "user_role": "ACCOUNTANT",
  "timestamp": "2023-12-25T10:30:00.000Z",
  "old_values": {
    "discount_amount": "0.00",
    "total_amount": "1000.00"
  },
  "new_values": {
    "discount_amount": "100.00",
    "total_amount": "918.00"
  },
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "session_id": "sess_abc123"
}
```

### Tracked Operations
- `CREATE_BILL` - Bill creation
- `UPDATE` - Bill modifications
- `APPLY_DISCOUNT` - Discount applications
- `CANCEL_BILL` - Bill cancellations
- `PROCESS_REFUND` - Refund processing
- `DELETE_BILL` - Bill deletions
- `UPDATE_PAYMENT` - Payment modifications

## 📊 Business Rules & Validations

### Discount Rules
1. **Maximum Discount**: Cannot exceed subtotal amount
2. **GST Impact**: Discounts proportionally reduce taxable amount
3. **Approval Thresholds**: Configurable limits for automatic approval
4. **Reason Required**: All discounts must have valid reason

### Refund Rules
1. **Maximum Refund**: Cannot exceed amount paid
2. **Status Validation**: Only refundable from paid bills
3. **Method Requirements**: Refund method must be specified
4. **Reference Tracking**: Optional reference numbers for tracking

### Cancellation Rules
1. **Status Validation**: Only cancellable bills can be cancelled
2. **Automatic Refunds**: Refunds processed automatically if paid
3. **Irreversible**: Cancellations cannot be undone (except by admin)

### Edit Rules
1. **Status Restrictions**: Limited to early-stage bills
2. **Item Updates**: Study code changes recreate bill items
3. **Tax Recalculation**: Automatic tax recalculation on changes
4. **Payment Terms**: Due dates updated based on terms

## 🛡️ Security Features

### Authentication
- JWT-based authentication required for all operations
- Session validation and timeout handling
- IP address tracking for audit

### Authorization
- Role-based permission checking
- Operation-level access control
- Permission inheritance (higher roles get lower permissions)

### Data Integrity
- Database constraints for critical fields
- Transaction-based operations
- Rollback capability for failed operations

### Audit Compliance
- Complete audit trail for all operations
- Immutable audit records
- Regulatory compliance logging

## 🔧 API Integration

### Error Handling
```json
{
  "success": false,
  "message": "Insufficient permissions to perform this action",
  "required_permission": "APPLY_DISCOUNT",
  "user_role": "BILLING_CLERK"
}
```

### Success Responses
```json
{
  "success": true,
  "message": "Discount applied successfully",
  "data": {
    "id": 123,
    "invoice_number": "INV-1-20231225-1234",
    "discount_amount": "100.00",
    "total_amount": "918.00"
  },
  "requires_approval": false
}
```

### Validation Errors
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "discount_percentage",
      "message": "Discount percentage must be between 0 and 100",
      "value": 150
    }
  ]
}
```

## 📈 Reporting & Analytics

### Available Reports
1. **Discount Report**: All discounts applied with approval status
2. **Refund Report**: All refunds processed with reasons
3. **Cancellation Report**: All cancelled bills with reasons
4. **User Activity Report**: Operations by user/role
5. **Financial Impact Report**: Financial impact of all operations

### Key Metrics
- Discount frequency and amounts
- Refund processing time
- Cancellation rates
- User operation patterns
- Approval workflow efficiency

## 🔄 Workflow Automation

### Discount Approval Workflow
1. User applies discount
2. System checks approval requirements
3. If approval needed → Manager approval queue
4. Manager approves/rejects
5. System processes approved discount
6. Audit trail updated

### Refund Approval Workflow
1. User processes refund
2. System checks approval requirements
3. If approval needed → Manager approval queue
4. Manager approves/rejects
5. System processes approved refund
6. Audit trail updated

### Automated Notifications
- Email notifications for approval requests
- SMS alerts for high-value operations
- Dashboard notifications for pending approvals
- System alerts for unusual patterns

## 🎯 Best Practices

### For Users
1. **Provide Clear Reasons**: Always include detailed reasons for discounts/refunds
2. **Check Permissions**: Verify you have required permissions before operations
3. **Review Before Submit**: Double-check amounts and details
4. **Document Exceptions**: Note any special circumstances

### For Managers
1. **Review Promptly**: Process approval requests quickly
2. **Verify Details**: Check all information before approving
3. **Monitor Patterns**: Watch for unusual discount/refund patterns
4. **Maintain Compliance**: Ensure all operations follow company policies

### For Administrators
1. **Regular Audits**: Review audit trails periodically
2. **Permission Management**: Keep role assignments current
3. **System Monitoring**: Monitor for unusual activity
4. **Backup Procedures**: Ensure data backup procedures

## 🚀 Implementation Checklist

### Backend Implementation
- [x] Role-based access control middleware
- [x] Permission checking functions
- [x] Audit trail system
- [x] Validation rules
- [x] Business logic implementation
- [x] Error handling
- [x] Security measures

### Frontend Implementation
- [x] Role-based UI components
- [x] Permission-aware buttons/menus
- [x] Modal dialogs for operations
- [x] Form validation
- [x] Real-time updates
- [x] History viewing
- [x] Error display

### Database Implementation
- [x] Audit trail table
- [x] Permission tables
- [x] Indexes for performance
- [x] Constraints for data integrity
- [x] Triggers for automatic updates
- [x] Views for reporting

### Testing
- [x] Unit tests for all operations
- [x] Permission testing
- [x] Business logic testing
- [x] Security testing
- [x] Performance testing
- [x] Integration testing

## 📞 Support & Troubleshooting

### Common Issues
1. **Permission Denied**: Check user role and permissions
2. **Invalid Status**: Verify bill current status
3. **Validation Errors**: Check input format and constraints
4. **System Errors**: Check logs for detailed error information

### Support Channels
- **System Administrator**: For permission and access issues
- **Finance Team**: For business rule questions
- **IT Support**: For technical issues
- **Management**: For policy and approval questions

### Escalation Procedures
1. **Level 1**: User self-service (check permissions, status)
2. **Level 2**: Department manager (business questions)
3. **Level 3**: System admin (technical issues)
4. **Level 4**: Senior management (policy exceptions)

---

## 📚 Additional Resources

### API Documentation
- Complete API endpoint documentation
- Request/response examples
- Error code reference
- Authentication guide

### User Manuals
- Role-specific operation guides
- Step-by-step procedures
- Frequently asked questions
- Troubleshooting guides

### Compliance Documents
- Audit compliance requirements
- Financial reporting standards
- Data protection policies
- Regulatory requirements

---

*This guide provides comprehensive information for the billing operations system. For specific implementation details or technical support, refer to the API documentation or contact your system administrator.*
