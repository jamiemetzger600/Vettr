import LegalDocLayout from '../components/LegalDocLayout';

/**
 * Full-product Privacy Policy (web, extension, integrations).
 * Placeholders + legal review required before broad launch / OAuth verification.
 */
export default function PrivacyPage() {
  return (
    <LegalDocLayout title="Privacy Policy">
      <p className="legal-doc__meta">
        <strong>Last updated:</strong> September 28, 2026
      </p>
      <p className="legal-doc__notice">
        This draft covers the Vettr web app, Chrome extension, and related integrations.
        Replace bracketed placeholders and obtain legal review before Google OAuth verification
        or Chrome Web Store publication.
      </p>

      <h2>1. Who we are</h2>
      <p>
        Vettr is operated by <strong>[COMPANY LEGAL NAME]</strong> (&ldquo;Vettr,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us&rdquo;). Contact: <strong>[CONTACT EMAIL]</strong>. This policy describes how we
        collect, use, and share information when you use Vettr&apos;s website, progressive web app,
        Chrome extension, and APIs (the &ldquo;Service&rdquo;).
      </p>

      <h2>2. Information we collect</h2>
      <h3>Account information</h3>
      <p>
        When you register, we store your email address and a hashed password (we do not store
        plaintext passwords). Authentication may also use session cookies and tokens.
      </p>
      <h3>Saved deals and CRM data</h3>
      <p>
        If you save deals or use CRM features, we store deal metadata, notes, pipeline stages,
        contacts, tasks, underwriting inputs, IOI drafts, due-diligence checklist state, and related
        activity you create in the Service.
      </p>
      <h3>Buy-box and preferences</h3>
      <p>
        Filters, exclude lists, notification preferences, visible columns, and similar settings are
        stored so the feed and alerts match your criteria.
      </p>
      <h3>Gmail send scope</h3>
      <p>
        If you connect Google and enable sending (for example Quick IOI), we request permission to
        send email on your behalf via Gmail. We use that access only to send messages you initiate
        from Vettr. We do not use Gmail access to read your mailbox for advertising or unrelated
        profiling.
      </p>
      <h3>Google Calendar tokens</h3>
      <p>
        If you connect Google Calendar, we store OAuth tokens needed to create or update calendar
        events you request in Vettr (for example follow-ups). You can disconnect in Settings; we then
        stop using those tokens for new actions and delete or invalidate stored credentials as
        described in retention below.
      </p>
      <h3>Push notifications</h3>
      <p>
        If you enable desktop/PWA alerts, we may store a Web Push subscription endpoint and related
        keys so we can deliver notifications you opted into (for example match alerts or CRM mentions).
      </p>
      <h3>Email digests</h3>
      <p>
        Based on your notification settings, we may send transactional and product emails such as
        password resets, daily/weekly match digests, and CRM activity summaries to your account email.
      </p>
      <h3>Cookies and local storage</h3>
      <p>
        We use cookies (including an HttpOnly session cookie) and browser local storage for sign-in,
        preferences, guest browse state, and similar client-side features. The Chrome extension may
        also store deals, settings, and a session token locally via extension storage.
      </p>
      <h3>Scraped and aggregated listing data</h3>
      <p>
        Vettr aggregates publicly available or source-provided business listing information into our
        market deal database so you can filter by buy box. That listing data is not treated as your
        personal CRM content; your saved notes and pipeline state are.
      </p>
      <h3>Usage and diagnostics</h3>
      <p>
        We may collect coarse technical logs (timestamps, IP address for security/rate limiting,
        user agent, error messages) to operate, secure, and debug the Service.
      </p>

      <h2>3. How we use information</h2>
      <ul>
        <li>Provide and improve deal matching, CRM, calculators, and underwriting tools</li>
        <li>Authenticate you and protect accounts (including rate limiting and abuse prevention)</li>
        <li>Send emails and push notifications you configure</li>
        <li>Send messages or calendar events you explicitly trigger via connected Google accounts</li>
        <li>Comply with law and enforce our Terms</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>4. Google API Limited Use disclosure</h2>
      <p>
        Vettr&apos;s use and transfer to any other app of information received from Google APIs will
        adhere to the{' '}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Google user data obtained via OAuth (such as Gmail
        send or Calendar) is used only to provide or improve user-facing features that are prominent
        in the Service, and is not used for serving advertisements.
      </p>

      <h2>5. Sharing</h2>
      <p>We may share information with:</p>
      <ul>
        <li>Service providers (hosting, email delivery, payment processors such as Stripe when billing is enabled) under contractual confidentiality obligations</li>
        <li>Team members you invite to a Vettr workspace, for deals and activity you share with that team</li>
        <li>Authorities when required by law or to protect rights and safety</li>
        <li>A successor in connection with a merger, acquisition, or asset sale, subject to this policy</li>
      </ul>

      <h2>6. Retention</h2>
      <p>
        We retain account, CRM, and settings data while your account is active. After account deletion
        or a verified deletion request, we delete or anonymize personal CRM and account data within a
        reasonable period, except where we must retain records for legal, security, or billing
        purposes. Aggregated market listing data may be retained independently of your account.
        Password-reset tokens expire automatically. Google OAuth tokens are retained until you
        disconnect or we purge unused credentials.
      </p>

      <h2>7. Deletion and your choices</h2>
      <p>
        You can update settings, disconnect Google integrations, and disable email digests or push
        notifications in the product. To request deletion of your account and associated personal CRM
        data, email <strong>[CONTACT EMAIL]</strong> from your account address. We will confirm and
        process the request as described above. You may also clear local extension storage and browser
        data on your devices.
      </p>

      <h2>8. Chrome extension</h2>
      <p>
        The extension may read listing pages you visit (to power on-page tools), store data locally,
        optionally sync saved deals with your Vettr account, and request host or identity permissions
        described in the Chrome Web Store listing. Extension behavior is covered by this same Privacy
        Policy.
      </p>

      <h2>9. Security</h2>
      <p>
        We use industry-standard measures such as HTTPS, hashed passwords, and access controls.
        No method of transmission or storage is completely secure; please use a strong unique password.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not directed to children under 16 (or the minimum age in your jurisdiction).
        We do not knowingly collect personal information from children.
      </p>

      <h2>11. International users</h2>
      <p>
        The Service may be hosted in the United States. If you access it from elsewhere, you consent
        to processing in the U.S. and other locations where we or our providers operate.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update this policy. The &ldquo;Last updated&rdquo; date will change when we do.
        Material changes will be posted on this page.
      </p>

      <h2>13. Contact</h2>
      <p>
        Privacy questions or deletion requests: <strong>[CONTACT EMAIL]</strong>
        <br />
        Legal entity: <strong>[COMPANY LEGAL NAME]</strong>
        <br />
        Governing law / principal place of business state: <strong>[GOVERNING LAW STATE]</strong>
      </p>
    </LegalDocLayout>
  );
}
