export default function GuestOffMarketEmpty({ onRequireSignup, onBackToAggregator }) {
  return (
    <div className="guest-my-deals-empty">
      <h2>Off Market is for members</h2>
      <p>
        Sign up to research verticals, run outreach from your Gmail, and promote willing sellers
        into Vettr CRM.
      </p>
      <div className="guest-my-deals-empty__actions">
        <button type="button" className="btn-primary" onClick={() => onRequireSignup?.('off_market')}>
          Sign up free
        </button>
        <button type="button" className="btn-secondary" onClick={() => onBackToAggregator?.()}>
          Back to Deal Aggregator
        </button>
      </div>
    </div>
  );
}
