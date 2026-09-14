/** System default business acquisition DD template — seeded once. */
export const BUSINESS_ACQUISITION_DD_TEMPLATE = {
  name: 'Business Acquisition DD',
  assetType: 'business',
  groups: [
    {
      name: 'Financial & QoE',
      items: [
        { title: '3-year P&L', requestsDocument: true },
        { title: 'Balance sheet', requestsDocument: true },
        { title: 'AR/AP aging', requestsDocument: true },
        { title: 'Revenue by customer', requestsDocument: true },
        { title: 'Add-backs schedule', requestsDocument: true }
      ]
    },
    {
      name: 'Tax',
      items: [
        { title: '3 years business tax returns', requestsDocument: true },
        { title: 'Personal returns (seller)', requestsDocument: true },
        { title: 'Sales tax filings', requestsDocument: true }
      ]
    },
    {
      name: 'Legal & Corporate',
      items: [
        { title: 'Org documents / cap table', requestsDocument: true },
        { title: 'Material contracts', requestsDocument: true },
        { title: 'Litigation summary', requestsDocument: false },
        { title: 'IP assignments', requestsDocument: true }
      ]
    },
    {
      name: 'Operations',
      items: [
        { title: 'SOPs and key processes', requestsDocument: true },
        { title: 'Vendor list', requestsDocument: true },
        { title: 'Equipment inventory', requestsDocument: false }
      ]
    },
    {
      name: 'HR & Benefits',
      items: [
        { title: 'Employee roster and comp', requestsDocument: true },
        { title: 'Benefits summary', requestsDocument: true },
        { title: 'Non-compete / employment agreements', requestsDocument: true }
      ]
    },
    {
      name: 'Real Estate & Facilities',
      items: [
        { title: 'Lease or deed', requestsDocument: true },
        { title: 'Environmental Phase I (if applicable)', requestsDocument: true }
      ]
    },
    {
      name: 'IT & Systems',
      items: [
        { title: 'Software stack and licenses', requestsDocument: false },
        { title: 'Data security / transition plan', requestsDocument: false }
      ]
    },
    {
      name: 'Customer & Revenue',
      items: [
        { title: 'Top customers and concentration', requestsDocument: true },
        { title: 'Customer contracts', requestsDocument: true },
        { title: 'Pipeline / backlog', requestsDocument: false }
      ]
    },
    {
      name: 'SBA',
      items: [
        { title: 'Buyer equity injection (cash + source of funds)', requestsDocument: true },
        { title: 'SBA Franchise Directory / Form 2462 (if franchise)', requestsDocument: true },
        { title: 'Phase I ESA (SOP 50 10 when required)', requestsDocument: true },
        { title: 'Seller note standby / CDC confirmation', requestsDocument: true }
      ]
    }
  ]
};
