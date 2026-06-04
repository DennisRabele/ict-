# Firebase Data Model

This project uses Firebase instead of SQL tables:

- Customer web portal and mobile customer app share the same Firestore database: `(default)`.
- Admin console currently uses the same Firestore database, but separate admin-only collections.
- Pictures and attachments are stored in Firebase Storage.

Firebase requires billing to create a second Firestore database. If billing is enabled later, change `firebaseDatabases.admin` in `firebase/config.js` from `(default)` to `admin`.

The rules in this folder are open for local development. Lock them down with Firebase Authentication before production.

## Shared Customer Database

Database id: `(default)`

Collections:

- `customerProfiles`
  - Primary id: customer id, for example `customer-prime-logistics`.
  - Related collections store `customerId`.
  - Web and mobile customer registrations create profile documents here.

- `catalogProducts`
  - Primary id: SKU, for example `LT-T14`.
  - Used by catalog search, product details, cart, checkout, RFQs, and admin-facing inventory references.
  - Admin inventory additions also upsert matching catalog records so customer apps show the same products.
  - Picture URL: `imageUrl`.

- `pcComponents`
  - Primary id: component code.
  - Fields: `group` (`cpu`, `board`, `ram`, `storage`), compatibility fields such as `socket`, `ramType`, and `read`.

- `customerAssets`
  - Primary id: asset id.
  - Relationship: `customerId -> customerProfiles`.
  - Optional relationship: `productId -> catalogProducts`.

- `subscriptions`
  - Primary id: subscription id.
  - Relationships: `customerId -> customerProfiles`, `assetId -> customerAssets`.

- `invoices`
  - Primary id: invoice id.
  - Relationships: `customerId -> customerProfiles`, `subscriptionId -> subscriptions`.

- `tickets`
  - Primary id: generated document id.
  - Relationships: `customerId -> customerProfiles`, `assetId -> customerAssets`.
  - Picture URL: `attachmentUrl`, stored under `customer/tickets/...`.

- `cartItems`
  - Primary id: generated document id.
  - Relationship: `customerId -> customerProfiles`.
  - Optional relationship: `productId -> catalogProducts`.

- `orders`
  - Primary id: generated document id with display field `id`, for example `ORD-1023`.
  - Relationship: `customerId -> customerProfiles`.
  - Stores delivery details, payment method, payment status, order status, and total.

- `orderItems`
  - Primary id: generated document id.
  - Relationships: `orderId -> orders.id`, optional `productId -> catalogProducts`.

- `rfqs`
  - Primary id: generated document id.
  - Relationship: `customerId -> customerProfiles`.

- `rfqItems`
  - Primary id: generated document id.
  - Relationships: `rfqId -> rfqs`, optional `productId -> catalogProducts`.

## Admin Collections

Database id: `(default)` in billing-free mode.

Collections:

- `adminUsers`
  - Primary id: admin user id.
  - Relationship: `roleId -> adminRoles`.

- `adminRoles`
  - Primary id: role id.
  - Stores a permissions map for RBAC.

- `serviceProvisioning`
  - Tracks hosting/domain/SSL jobs.
  - Relationship: `companyId -> companies`.

- `adminBilling`
  - Tracks subscription billing operations.
  - Relationship: `companyId -> companies`.

- `quotaMonitors`
  - Tracks service bandwidth/storage utilization.
  - Relationship: `companyId -> companies`.

- `warehouses`
  - Primary id: warehouse id.

- `suppliers`
  - Primary id: supplier id.

- `inventoryItems`
  - Primary id: inventory item id.
  - Relationships: `warehouseId -> warehouses`, optional `supplierId -> suppliers`, optional `productId -> catalogProducts` by SKU.
  - Picture URL: `photoUrl`, stored under `admin/inventory/...`.

- `companies`
  - Primary id: company id.

- `companyUsers`
  - Primary id: company user id.
  - Relationship: `companyId -> companies`.

- `quoteRequests`
  - Primary id: RFQ/quote id.
  - Relationship: `companyId -> companies`.

- `quoteItems`
  - Primary id: generated document id.
  - Relationship: `quoteId -> quoteRequests`.

- `supportTickets`
  - Primary id: ticket id.
  - Relationship: `companyId -> companies`.

- `knowledgeArticles`
  - Primary id: generated document id.

- `auditLogs`
  - Primary id: generated document id.
  - Optional relationship: `adminUserId -> adminUsers`.

- `analyticsSnapshots`
  - Primary id: month or date key.
