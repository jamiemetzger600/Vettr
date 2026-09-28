import LegalDocLayout from '../components/LegalDocLayout';

/**
 * Terms of Service — draft for beta. Placeholders must be filled and
 * this document needs legal review before broad launch.
 */
export default function TermsPage() {
  return (
    <LegalDocLayout title="Terms of Service">
      <p className="legal-doc__meta">
        <strong>Last updated:</strong> September 28, 2026
      </p>
      <p className="legal-doc__notice">
        This is a draft for Vettr beta. Replace bracketed placeholders and have counsel review
        before inviting paying users or submitting Google OAuth / Chrome Web Store listings.
      </p>

      <h2>1. Agreement</h2>
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Vettr,
        including the website, progressive web app, Chrome extension, and related APIs
        (collectively, the &ldquo;Service&rdquo;), operated by{' '}
        <strong>[COMPANY LEGAL NAME]</strong> (&ldquo;Vettr,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
        or &ldquo;our&rdquo;). By creating an account or using the Service, you agree to these Terms
        and our <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use the Service.
      </p>

      <h2>2. The Service</h2>
      <p>
        Vettr is a deal-sourcing, underwriting, and CRM tool for people evaluating small-business
        acquisitions. Features may include browsing market listings that match your buy-box criteria,
        deal calculators, saving deals and CRM pipeline data, optional Gmail send for letters of
        intent / interest, optional Google Calendar integration, email digests, and browser push
        notifications. Features may change, and some capabilities may require a paid plan or third-party
        account connections.
      </p>

      <h2>3. Accounts</h2>
      <p>
        You must provide accurate registration information and keep your password confidential.
        You are responsible for activity under your account. Notify us promptly at{' '}
        <strong>[CONTACT EMAIL]</strong> if you suspect unauthorized access. We may suspend or
        terminate accounts that violate these Terms or create risk for the Service or other users.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for unlawful purposes or to violate others&apos; rights</li>
        <li>Attempt to access accounts, data, or systems you are not authorized to use</li>
        <li>Scrape, overload, or reverse engineer the Service except as allowed by law</li>
        <li>Upload malware or interfere with Service integrity or availability</li>
        <li>Misrepresent your identity when contacting brokers or sellers through the Service</li>
        <li>Resell or redistribute listing data scraped or aggregated by Vettr as a competing data feed</li>
      </ul>

      <h2>5. Listing data and third-party content</h2>
      <p>
        Market listings and related content may come from third-party sources, public pages, or user
        submissions. We do not guarantee accuracy, completeness, or availability of listing data.
        You are responsible for your own diligence before making investment or purchase decisions.
        Vettr is not a broker-dealer, investment adviser, or escrow agent, and does not provide legal,
        tax, or financial advice.
      </p>

      <h2>6. Google and other integrations</h2>
      <p>
        Optional features may connect to Google (for example Gmail send or Calendar) or other providers
        under their terms. You authorize us to use tokens and permissions you grant solely to provide
        the features you enable. You can disconnect integrations in Settings. Our use of Google user
        data is described in the Privacy Policy (including Google API Limited Use commitments).
      </p>

      <h2>7. Fees</h2>
      <p>
        Free and paid plans may be offered. Paid features, pricing, and billing terms will be shown
        at purchase (for example via Stripe Checkout). Unless required by law, fees are non-refundable.
        We may change pricing with reasonable notice for renewals.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        Vettr and its software, branding, and documentation remain our property or that of our
        licensors. You retain rights to content you submit (notes, CRM data, IOI drafts). You grant us
        a limited license to host and process that content to operate the Service.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE.&rdquo; TO THE MAXIMUM
        EXTENT PERMITTED BY LAW, WE DISCLAIM WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
        PURPOSE, AND NON-INFRINGEMENT. We do not warrant uninterrupted or error-free operation.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, [COMPANY LEGAL NAME] AND ITS AFFILIATES WILL NOT BE
        LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST
        PROFITS, DATA, OR BUSINESS OPPORTUNITIES. OUR AGGREGATE LIABILITY FOR CLAIMS RELATING TO THE
        SERVICE WILL NOT EXCEED THE GREATER OF (A) AMOUNTS YOU PAID US FOR THE SERVICE IN THE TWELVE
        MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED U.S. DOLLARS (US $100).
      </p>

      <h2>11. Indemnity</h2>
      <p>
        You will indemnify and hold harmless [COMPANY LEGAL NAME] from claims arising out of your
        misuse of the Service, your content, or your violation of these Terms or applicable law.
      </p>

      <h2>12. Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or end access if you breach these
        Terms or if we discontinue the Service. Provisions that by nature should survive (including
        disclaimers, liability limits, and governing law) will survive termination.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of <strong>[GOVERNING LAW STATE]</strong>,
        without regard to conflict-of-law rules. Courts in <strong>[GOVERNING LAW STATE]</strong> will
        have exclusive jurisdiction, except where prohibited by law.
      </p>

      <h2>14. Changes</h2>
      <p>
        We may update these Terms. Material changes will be posted on this page with an updated date.
        Continued use after changes become effective constitutes acceptance.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions about these Terms: <strong>[CONTACT EMAIL]</strong>
        <br />
        Legal entity: <strong>[COMPANY LEGAL NAME]</strong>
      </p>
    </LegalDocLayout>
  );
}
