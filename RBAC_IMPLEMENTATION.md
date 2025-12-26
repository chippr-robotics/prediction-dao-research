# Role-Based Access Control (RBAC) Implementation

## Overview

This implementation provides a comprehensive Role-Based Access Control (RBAC) system for the Prediction DAO platform, focusing on premium features and administrative capabilities.

## Architecture

### Core Components

#### 1. RoleContext (`frontend/src/contexts/RoleContext.jsx`)
Central state management for user roles, providing:
- Role definitions for the system
- Role checking utilities
- Role grant/revoke functionality
- Integration with wallet authentication

**Available Roles:**
- `MARKET_MAKER` - Create and manage prediction markets
- `CLEARPATH_USER` - Access DAO governance platform
- `TOKENMINT` - Mint and manage NFTs and ERC20 tokens
- `ADMIN` - Full system access including role management

#### 2. Role Storage (`frontend/src/utils/roleStorage.js`)
Local storage-based persistence layer that:
- Stores roles per wallet address
- Maintains purchase history
- Provides lookup and management utilities
- Follows principle of least privilege

#### 3. RoleGate Component (`frontend/src/components/ui/RoleGate.jsx`)
Access control wrapper that:
- Conditionally renders content based on user roles
- Shows premium upgrade options
- Provides clear messaging about required permissions
- Integrates with purchase flow

## User Flows

### 1. Regular User Flow

1. **Connect Wallet** - User connects their Web3 wallet
2. **View Profile** - Click user icon → Opens User Management Modal
3. **See Roles Section** - Empty state if no premium roles
4. **Purchase Access** - Click "Get Premium Access" → Opens Purchase Modal
5. **Select Role** - Choose desired premium role (e.g., CLEARPATH_USER)
6. **Complete Payment** - Simulate stablecoin payment
7. **Register ZK Key** (ClearPath only) - Register zero-knowledge public key
8. **Access Features** - Can now access premium features

### 2. ClearPath User Flow

1. **With CLEARPATH_USER role** - User has purchased access
2. **User Modal** - Shows active role badge
3. **Management Link** - "Manage Organizations" button appears
4. **Navigate to ClearPath** - Click button → Redirects to `/clearpath`
5. **Access Dashboard** - Full DAO governance features available

### 3. Administrator Flow

1. **With ADMIN role** - User has administrator privileges
2. **User Modal** - Shows admin section
3. **Role Management** - Click "Role Management" → Opens admin panel
4. **Grant Roles** - Search/add users and assign roles
5. **Revoke Roles** - Remove roles from users
6. **View Statistics** - See role distribution across platform

## Implementation Details

### Role Context Integration

The RoleProvider wraps the entire application in `frontend/src/main.jsx`:

```jsx
<RoleProvider>
  <App />
</RoleProvider>
```

### Using Roles in Components

```jsx
import { useRoles } from '../hooks/useRoles'

function MyComponent() {
  const { hasRole, roles, ROLES } = useRoles()
  
  if (hasRole(ROLES.CLEARPATH_USER)) {
    // Show ClearPath features
  }
}
```

### Protecting Routes with RoleGate

```jsx
import RoleGate from './ui/RoleGate'

<RoleGate 
  requiredRoles={[ROLES.CLEARPATH_USER]}
  showPurchase={true}
  onPurchase={handlePurchaseClick}
>
  <ProtectedContent />
</RoleGate>
```

## Key Features

### 1. Premium Access Purchase

- **Role Selection** - Choose from available premium roles
- **Pricing Display** - Clear pricing in USDC stablecoin
- **Payment Processing** - Simulated blockchain transaction
- **Immediate Activation** - Role granted upon successful payment

### 2. ZK Key Registration

For ClearPath users specifically:
- **Post-Purchase Step** - Register zero-knowledge public key
- **Privacy Preservation** - Required for ZK-protected governance
- **Optional** - Can be skipped and done later
- **Validation** - Key format checking

### 3. Role Management Admin Panel

Accessible at `/admin/roles` for ADMIN role holders:

**Features:**
- **User List** - View all users with roles
- **Search** - Find users by wallet address
- **Grant Roles** - Assign roles to any wallet address
- **Revoke Roles** - Remove roles from users
- **Statistics** - Role distribution dashboard
- **Validation** - Ethereum address format checking

### 4. User Management Modal

Enhanced with role display:
- **Active Roles** - Shows all roles user currently has
- **Premium Badges** - Visual indicators for premium roles
- **Quick Actions** - Direct links to role-specific features
- **Admin Controls** - Administrative options for admins

## Security Considerations

### Principle of Least Privilege

- No default admin roles
- Each role has specific, limited permissions
- Roles must be explicitly granted
- Admin role required for role management

### Role Validation

- Wallet address validation on grant
- Storage isolation per wallet
- Local verification of role ownership
- Clear separation between roles

### Future Enhancements

The system is designed for extensibility:

1. **Blockchain Integration**
   - Smart contract role verification
   - On-chain role storage
   - Decentralized role management

2. **Advanced Access Modifiers**
   - Financial controls per role
   - Time-locked permissions
   - M-of-N multi-signature requirements
   - Tiered access levels

3. **Audit Trail**
   - Role grant/revoke history
   - Transaction logging
   - Compliance reporting

## File Structure

```
frontend/src/
├── contexts/
│   └── RoleContext.jsx          # Role state management
├── hooks/
│   └── useRoles.js              # Role access hook
├── utils/
│   └── roleStorage.js           # Role persistence
├── components/
│   ├── RoleManagementAdmin.jsx  # Admin panel
│   └── ui/
│       ├── RoleGate.jsx         # Access control wrapper
│       ├── RolePurchaseModal.jsx # Purchase interface
│       └── UserManagementModal.jsx # Enhanced with roles
```

## Testing

### Manual Testing Steps

1. **Basic Flow**
   - Connect wallet
   - View user modal
   - Purchase a role
   - Verify role appears in profile

2. **ClearPath Access**
   - Purchase CLEARPATH_USER role
   - Navigate to ClearPath
   - Verify access granted
   - Test ZK key registration

3. **Admin Functions**
   - Grant ADMIN role to test account
   - Access admin panel at `/admin/roles`
   - Grant role to another address
   - Revoke role from address
   - Verify statistics update

4. **Access Control**
   - Without role: Try accessing ClearPath → See purchase prompt
   - With role: Access ClearPath → See dashboard
   - Logout: Roles reset
   - Reconnect: Roles load from storage

## Integration Notes

### Current Implementation Status

✅ **Completed:**
- Core RBAC infrastructure
- Role storage and management
- User interface components
- Admin panel
- Purchase flow
- ClearPath integration
- Access control gates

⚠️ **Mock/Simulated:**
- Payment processing (uses local storage)
- ZK key registration (simulated)
- Role purchase transactions (no actual blockchain calls)

🔄 **Future Work:**
- Smart contract integration
- Real payment processing
- Actual ZK key verification
- On-chain role verification
- MARKET_MAKER and TOKENMINT feature screens

## Usage Examples

### Grant Admin Role (for testing)

1. Open browser console
2. Run:
```javascript
// Import storage utility
import { addUserRole } from './src/utils/roleStorage.js'

// Grant ADMIN role to your wallet
addUserRole('0xYourWalletAddress', 'ADMIN')

// Refresh page
location.reload()
```

### Check Current Roles

```javascript
import { getUserRoles } from './src/utils/roleStorage.js'

// Check roles for connected wallet
const roles = getUserRoles(ethereum.selectedAddress)
console.log('Current roles:', roles)
```

## Troubleshooting

### Issue: Role not appearing after purchase
**Solution:** Refresh the page to reload roles from storage

### Issue: Cannot access admin panel
**Solution:** Verify ADMIN role is granted using console commands above

### Issue: Purchase modal not showing
**Solution:** Ensure wallet is connected and User Management Modal is open

### Issue: ClearPath shows purchase prompt despite having role
**Solution:** Check that CLEARPATH_USER role is properly stored, verify in User Modal

## Related Documentation

- [ClearPath Governance UI](../CLEARPATH_GOVERNANCE_UI_IMPLEMENTATION.md)
- [DAO UI Implementation](../DAO_UI_IMPLEMENTATION.md)
- [Frontend Build Book](../FRONTEND_BUILD_BOOK.md)
