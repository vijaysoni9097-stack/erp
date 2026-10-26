import PurchaseOrders from './PurchaseOrders';

// Both entry points use the same persisted purchasing workflow.
export default function Orders({ profile }) {
  return <PurchaseOrders title="Orders" profile={profile} />;
}
