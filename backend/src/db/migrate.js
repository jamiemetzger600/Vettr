import pool from './pool.js';

const migrations = [
  {
    name: 'create_users_table',
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `
  },
  {
    name: 'create_user_settings_table',
    up: `
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        
        -- Buy Box Config
        buy_box JSONB DEFAULT '{}'::jsonb,
        
        -- Exclude Keywords & Lists
        exclude_keywords JSONB DEFAULT '[]'::jsonb,
        exclude_lists JSONB DEFAULT '{}'::jsonb,
        current_exclude_list VARCHAR(255),
        
        -- Hidden Deals
        hidden_deal_ids JSONB DEFAULT '[]'::jsonb,
        
        -- User Preferences
        preferences JSONB DEFAULT '{}'::jsonb,
        
        -- Custom Sources
        custom_sources JSONB DEFAULT '[]'::jsonb,
        
        -- Auto-refresh settings
        auto_refresh_enabled BOOLEAN DEFAULT false,
        refresh_interval INTEGER DEFAULT 60,
        notify_new_deals BOOLEAN DEFAULT true,
        
        -- Notification frequency
        notification_frequency VARCHAR(20) DEFAULT 'daily' CHECK (notification_frequency IN ('instant', 'daily', 'weekly')),
        notification_channel VARCHAR(20) DEFAULT 'email' CHECK (notification_channel IN ('email', 'push')),
        last_notification_sent TIMESTAMP,
        
        -- UI state
        visible_columns JSONB DEFAULT '[]'::jsonb,
        deal_view_style VARCHAR(20) DEFAULT 'table',
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
    `
  },
  {
    name: 'create_saved_deals_table',
    up: `
      CREATE TABLE IF NOT EXISTS saved_deals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        
        -- Deal data (mirroring extension structure)
        deal_id VARCHAR(255) NOT NULL,
        name TEXT NOT NULL,
        url TEXT,
        description TEXT,
        broker TEXT,
        broker_name TEXT,
        broker_company TEXT,
        broker_email TEXT,
        broker_phone TEXT,
        source TEXT,
        source_type TEXT,
        discovered_at BIGINT,
        
        -- Financial data
        asking_price NUMERIC,
        ebitda NUMERIC,
        revenue NUMERIC,
        
        -- Location
        location TEXT,
        city TEXT,
        state TEXT,
        county TEXT,
        country TEXT,
        
        -- Other
        industry TEXT,
        years_established TEXT,
        franchise TEXT,
        remote TEXT,
        listing_id TEXT,
        
        -- User-added fields
        notes TEXT,
        status VARCHAR(50) DEFAULT 'none',
        progress_stage VARCHAR(50),
        progress_history JSONB DEFAULT '[]'::jsonb,
        
        -- Metadata
        saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(user_id, deal_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_saved_deals_user_id ON saved_deals(user_id);
      CREATE INDEX IF NOT EXISTS idx_saved_deals_status ON saved_deals(status);
    `
  },
  {
    name: 'create_subscriptions_table',
    up: `
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        
        -- Stripe data
        stripe_customer_id VARCHAR(255) UNIQUE,
        stripe_subscription_id VARCHAR(255),
        
        -- Subscription status
        status VARCHAR(50) DEFAULT 'none' CHECK (status IN ('active', 'canceled', 'past_due', 'none')),
        plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free', 'monthly', 'yearly')),
        
        -- Entitlements (for one-time purchases or special features)
        entitlements JSONB DEFAULT '[]'::jsonb,
        
        -- Timestamps
        subscription_start TIMESTAMP,
        subscription_end TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
    `
  },
  {
    name: 'harmonize_deal_statuses',
    up: `
      UPDATE saved_deals SET status = 'none' WHERE status = 'new';
      UPDATE saved_deals SET status = 'pass' WHERE status = 'passed';
      UPDATE saved_deals SET status = 'warm' WHERE status IN ('reviewing', 'contacted');
      UPDATE saved_deals SET status = 'hot' WHERE status IN ('due-diligence', 'offer');
      DO $$ BEGIN
        ALTER TABLE saved_deals ALTER COLUMN status SET DEFAULT 'none';
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `
  },
  {
    name: 'create_airtable_deals_table',
    up: `
      CREATE TABLE IF NOT EXISTS airtable_deals (
        id SERIAL PRIMARY KEY,
        airtable_id INTEGER UNIQUE,
        name TEXT,
        description TEXT,
        industries TEXT[],
        listing_url TEXT,
        asking_price NUMERIC,
        annual_revenue NUMERIC,
        annual_profit NUMERIC,
        profit_multiple NUMERIC,
        revenue_multiple NUMERIC,
        city TEXT,
        county TEXT,
        state TEXT,
        country TEXT,
        years_established INTEGER,
        remote_relocatable TEXT,
        franchise TEXT,
        five_plus_years TEXT,
        broker_name TEXT,
        broker_company TEXT,
        broker_contact TEXT,
        broker_email TEXT,
        airtable_updated_at TIMESTAMP,
        airtable_added_at TIMESTAMP,
        first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_airtable_deals_airtable_id ON airtable_deals(airtable_id);
      CREATE INDEX IF NOT EXISTS idx_airtable_deals_state ON airtable_deals(state);
      CREATE INDEX IF NOT EXISTS idx_airtable_deals_asking_price ON airtable_deals(asking_price);
      CREATE INDEX IF NOT EXISTS idx_airtable_deals_last_scraped ON airtable_deals(last_scraped_at);
    `
  },
  {
    name: 'create_updated_at_trigger',
    up: `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
      
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
      CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_saved_deals_updated_at ON saved_deals;
      CREATE TRIGGER update_saved_deals_updated_at BEFORE UPDATE ON saved_deals
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
      CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `
  },
  {
    name: 'idx_airtable_deals_updated_added_at',
    up: `
      CREATE INDEX IF NOT EXISTS idx_airtable_deals_airtable_updated_at ON airtable_deals(airtable_updated_at);
      CREATE INDEX IF NOT EXISTS idx_airtable_deals_airtable_added_at ON airtable_deals(airtable_added_at);
    `
  },
  {
    name: 'create_market_deals_table',
    up: `
      CREATE TABLE IF NOT EXISTS market_deals (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50) NOT NULL,
        source_id VARCHAR(255) NOT NULL,
        name TEXT,
        description TEXT,
        listing_url TEXT,
        industries TEXT[],
        asking_price NUMERIC,
        annual_revenue NUMERIC,
        annual_profit NUMERIC,
        profit_multiple NUMERIC,
        revenue_multiple NUMERIC,
        city TEXT,
        county TEXT,
        state TEXT,
        country TEXT,
        years_established INTEGER,
        remote_relocatable TEXT,
        franchise TEXT,
        five_plus_years TEXT,
        broker_name TEXT,
        broker_company TEXT,
        broker_contact TEXT,
        broker_email TEXT,
        source_added_at TIMESTAMP,
        source_updated_at TIMESTAMP,
        first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        UNIQUE(source, source_id)
      );

      CREATE INDEX IF NOT EXISTS idx_market_deals_source ON market_deals(source);
      CREATE INDEX IF NOT EXISTS idx_market_deals_source_id ON market_deals(source, source_id);
      CREATE INDEX IF NOT EXISTS idx_market_deals_state ON market_deals(state);
      CREATE INDEX IF NOT EXISTS idx_market_deals_asking_price ON market_deals(asking_price);
      CREATE INDEX IF NOT EXISTS idx_market_deals_source_added_at ON market_deals(source_added_at);
      CREATE INDEX IF NOT EXISTS idx_market_deals_source_updated_at ON market_deals(source_updated_at);
      CREATE INDEX IF NOT EXISTS idx_market_deals_is_active ON market_deals(is_active);
      CREATE INDEX IF NOT EXISTS idx_market_deals_annual_profit ON market_deals(annual_profit);
      CREATE INDEX IF NOT EXISTS idx_market_deals_annual_revenue ON market_deals(annual_revenue);
    `
  },
  {
    name: 'create_deal_sources_table',
    up: `
      CREATE TABLE IF NOT EXISTS deal_sources (
        id SERIAL PRIMARY KEY,
        source_key VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(255),
        source_type VARCHAR(50),
        config JSONB DEFAULT '{}',
        scrape_enabled BOOLEAN DEFAULT TRUE,
        scrape_cron VARCHAR(50),
        last_scrape_at TIMESTAMP,
        last_scrape_result JSONB,
        deal_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO deal_sources (source_key, display_name, source_type, scrape_cron, scrape_enabled)
      VALUES ('airtable_bizbuysell', 'Airtable (BizBuySell)', 'airtable', '0 4 * * *', true)
      ON CONFLICT (source_key) DO NOTHING;
    `
  },
  {
    name: 'migrate_airtable_deals_to_market_deals',
    up: `
      INSERT INTO market_deals (
        source, source_id, name, description, listing_url, industries,
        asking_price, annual_revenue, annual_profit, profit_multiple, revenue_multiple,
        city, county, state, country, years_established,
        remote_relocatable, franchise, five_plus_years,
        broker_name, broker_company, broker_contact, broker_email,
        source_added_at, source_updated_at, first_seen_at, last_scraped_at, is_active
      )
      SELECT
        'airtable_bizbuysell',
        airtable_id::text,
        name, description, listing_url, industries,
        asking_price, annual_revenue, annual_profit, profit_multiple, revenue_multiple,
        city, county, state, country, years_established,
        remote_relocatable, franchise, five_plus_years,
        broker_name, broker_company, broker_contact, broker_email,
        airtable_added_at, airtable_updated_at, first_seen_at, last_scraped_at, true
      FROM airtable_deals
      WHERE airtable_id IS NOT NULL
      ON CONFLICT (source, source_id) DO NOTHING;

      UPDATE deal_sources
      SET deal_count = (SELECT COUNT(*) FROM market_deals WHERE source = 'airtable_bizbuysell')
      WHERE source_key = 'airtable_bizbuysell';
    `
  },
  {
    name: 'market_deals_search_indexes',
    up: `
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE INDEX IF NOT EXISTS idx_market_deals_name_trgm ON market_deals USING gin (name gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_market_deals_desc_trgm ON market_deals USING gin (description gin_trgm_ops);
    `
  },
  {
    name: 'market_deals_dedupe_and_unique',
    up: `
      UPDATE market_deals SET source_id = trim(both from source_id)
      WHERE source_id IS NOT NULL AND source_id <> trim(both from source_id);

      UPDATE saved_deals sd
      SET market_deal_id = d.keep_id
      FROM (
        SELECT md.id AS dup_id,
          MAX(md.id) OVER (PARTITION BY md.source, md.source_id) AS keep_id
        FROM market_deals md
      ) d
      WHERE sd.market_deal_id = d.dup_id AND d.dup_id <> d.keep_id;

      DELETE FROM market_deals md
      WHERE md.id IN (
        SELECT id FROM (
          SELECT id,
            ROW_NUMBER() OVER (PARTITION BY source, source_id ORDER BY id DESC) AS rn
          FROM market_deals
        ) sub WHERE rn > 1
      );

      UPDATE saved_deals sd
      SET market_deal_id = d.keep_id
      FROM (
        SELECT md.id AS dup_id,
          MAX(md.id) OVER (
            PARTITION BY lower(trim(split_part(md.listing_url, '#', 1)))
          ) AS keep_id
        FROM market_deals md
        WHERE md.listing_url IS NOT NULL AND trim(md.listing_url) <> ''
      ) d
      WHERE sd.market_deal_id = d.dup_id AND d.dup_id <> d.keep_id;

      DELETE FROM market_deals md
      WHERE md.id IN (
        SELECT id FROM (
          SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY lower(trim(split_part(listing_url, '#', 1)))
              ORDER BY id DESC
            ) AS rn
          FROM market_deals
          WHERE listing_url IS NOT NULL AND trim(listing_url) <> ''
        ) sub WHERE rn > 1
      );

      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'market_deals'::regclass
            AND conname = 'market_deals_source_source_id_key'
        ) THEN
          ALTER TABLE market_deals ADD CONSTRAINT market_deals_source_source_id_key UNIQUE (source, source_id);
        END IF;
      END $$;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_market_deals_source_listing_url
        ON market_deals (source, lower(trim(split_part(listing_url, '#', 1))))
        WHERE listing_url IS NOT NULL AND trim(listing_url) <> '';
    `
  },
  {
    name: 'deal_sources_airtable_cron_12h',
    up: `
      UPDATE deal_sources
      SET scrape_cron = '0 */12 * * *'
      WHERE source_key = 'airtable_bizbuysell'
        AND (scrape_cron IS NULL OR scrape_cron = '0 */4 * * *' OR scrape_cron = '*/30 * * * *');
    `
  },
  {
    name: 'deal_sources_airtable_cron_daily_pacific',
    up: `
      UPDATE deal_sources
      SET scrape_cron = '0 4 * * *'
      WHERE source_key = 'airtable_bizbuysell'
        AND (scrape_cron IN ('0 */12 * * *', '0 */4 * * *', '*/30 * * * *'));
    `
  },
  {
    name: 'saved_deals_calculator_state',
    up: `
      ALTER TABLE saved_deals ADD COLUMN IF NOT EXISTS calculator_state JSONB DEFAULT NULL;
    `
  },
  {
    name: 'crm_core_tables_v5',
    up: `
      ALTER TABLE saved_deals ADD COLUMN IF NOT EXISTS market_deal_id BIGINT REFERENCES market_deals(id);
      ALTER TABLE saved_deals ADD COLUMN IF NOT EXISTS listing_snapshot_at TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_saved_deals_market_deal_id ON saved_deals(market_deal_id);

      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        domain TEXT,
        phone TEXT,
        company_type VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id);

      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        name TEXT,
        email TEXT,
        phone TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(user_id, email);

      CREATE TABLE IF NOT EXISTS deal_contacts (
        saved_deal_id INTEGER NOT NULL REFERENCES saved_deals(id) ON DELETE CASCADE,
        contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL DEFAULT 'broker',
        PRIMARY KEY (saved_deal_id, contact_id, role)
      );

      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        saved_deal_id INTEGER NOT NULL REFERENCES saved_deals(id) ON DELETE CASCADE,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        activity_type VARCHAR(50) NOT NULL,
        body TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        occurred_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_activities_saved_deal ON activities(saved_deal_id, occurred_at DESC);
    `
  },
  {
    name: 'crm_tasks_reminders_v5_1',
    up: `
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        saved_deal_id INTEGER NOT NULL REFERENCES saved_deals(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'open',
        due_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        source VARCHAR(30) DEFAULT 'manual',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, status, due_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_saved_deal ON tasks(saved_deal_id);

      CREATE TABLE IF NOT EXISTS reminders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        saved_deal_id INTEGER REFERENCES saved_deals(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        remind_at TIMESTAMPTZ NOT NULL,
        channel VARCHAR(20) DEFAULT 'in_app',
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_reminders_user_remind ON reminders(user_id, remind_at);
    `
  },
  {
    name: 'crm_dd_tables_v5_2',
    up: `
      CREATE TABLE IF NOT EXISTS dd_templates (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        asset_type VARCHAR(20) DEFAULT 'business',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dd_template_groups (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES dd_templates(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        sort_order INT DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS dd_template_items (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES dd_template_groups(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        requests_document BOOLEAN DEFAULT FALSE,
        sort_order INT DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS dd_checklists (
        id SERIAL PRIMARY KEY,
        saved_deal_id INTEGER NOT NULL REFERENCES saved_deals(id) ON DELETE CASCADE UNIQUE,
        template_id INTEGER REFERENCES dd_templates(id),
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS dd_groups (
        id SERIAL PRIMARY KEY,
        checklist_id INTEGER NOT NULL REFERENCES dd_checklists(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        sort_order INT DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS dd_items (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES dd_groups(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status VARCHAR(30) DEFAULT 'not_started',
        due_at TIMESTAMPTZ,
        requests_document BOOLEAN DEFAULT FALSE,
        sort_order INT DEFAULT 0,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dd_item_assignees (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES dd_items(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role_label VARCHAR(100),
        notified_at TIMESTAMPTZ,
        UNIQUE(item_id, email)
      );

      CREATE TABLE IF NOT EXISTS dd_item_comments (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES dd_items(id) ON DELETE CASCADE,
        author_email VARCHAR(255),
        author_name VARCHAR(255),
        body TEXT NOT NULL,
        is_external BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dd_share_links (
        id SERIAL PRIMARY KEY,
        checklist_id INTEGER NOT NULL REFERENCES dd_checklists(id) ON DELETE CASCADE,
        token VARCHAR(64) UNIQUE NOT NULL,
        label VARCHAR(255),
        mode VARCHAR(20) NOT NULL DEFAULT 'view_only',
        password_hash TEXT,
        expires_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        show_deal_name BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dd_share_access_log (
        id SERIAL PRIMARY KEY,
        share_link_id INTEGER NOT NULL REFERENCES dd_share_links(id) ON DELETE CASCADE,
        ip_hash VARCHAR(64),
        action VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_dd_items_due ON dd_items(due_at) WHERE status NOT IN ('complete', 'na');
    `
  },
  {
    name: 'crm_phase4_extras_v5_3',
    up: `
      CREATE TABLE IF NOT EXISTS dd_item_documents (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES dd_items(id) ON DELETE CASCADE,
        filename TEXT,
        storage_key TEXT,
        mime_type TEXT,
        uploaded_by_email VARCHAR(255),
        is_external BOOLEAN DEFAULT FALSE,
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS deal_documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        saved_deal_id INTEGER NOT NULL REFERENCES saved_deals(id) ON DELETE CASCADE,
        doc_type VARCHAR(50) DEFAULT 'other',
        filename TEXT NOT NULL,
        storage_key TEXT,
        mime_type TEXT,
        notes TEXT,
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_deal_documents_saved_deal ON deal_documents(saved_deal_id);

      CREATE TABLE IF NOT EXISTS calendar_connections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(20) DEFAULT 'google',
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMPTZ,
        calendar_id TEXT,
        connected_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id)
      );
    `
  },
  {
    name: 'crm_reminder_recipients_v5_4',
    up: `
      ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recipient_email TEXT;
      ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recipient_name TEXT;
      ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recipient_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
    `
  },
  {
    name: 'crm_calendar_events_v5_5',
    up: `
      CREATE TABLE IF NOT EXISTS calendar_events (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        google_event_id TEXT,
        task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        saved_deal_id INTEGER REFERENCES saved_deals(id) ON DELETE SET NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'vettr',
        title TEXT NOT NULL,
        description TEXT,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        all_day BOOLEAN DEFAULT FALSE,
        google_updated_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_user_google
        ON calendar_events(user_id, google_event_id)
        WHERE google_event_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_calendar_events_user_range
        ON calendar_events(user_id, starts_at, ends_at)
        WHERE deleted_at IS NULL;
    `
  },
  {
    name: 'teams_phase1_v5_6',
    up: `
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'member'
          CHECK (role IN ('admin', 'member', 'viewer')),
        status VARCHAR(20) NOT NULL DEFAULT 'active'
          CHECK (status IN ('invited', 'active', 'removed')),
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(team_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_team_members_user
        ON team_members(user_id) WHERE status = 'active';
      CREATE INDEX IF NOT EXISTS idx_team_members_team
        ON team_members(team_id) WHERE status = 'active';

      CREATE TABLE IF NOT EXISTS team_invites (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'member'
          CHECK (role IN ('admin', 'member', 'viewer')),
        token VARCHAR(64) NOT NULL UNIQUE,
        invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_team_invites_email
        ON team_invites(LOWER(email)) WHERE accepted_at IS NULL;

      ALTER TABLE saved_deals ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;
      ALTER TABLE saved_deals ADD COLUMN IF NOT EXISTS shared_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_saved_deals_team_id ON saved_deals(team_id) WHERE team_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS deal_approvals (
        id SERIAL PRIMARY KEY,
        saved_deal_id INTEGER NOT NULL REFERENCES saved_deals(id) ON DELETE CASCADE,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action_type VARCHAR(40) NOT NULL DEFAULT 'stage_change',
        from_value TEXT,
        to_value TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected')),
        reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_deal_approvals_pending
        ON deal_approvals(team_id, status) WHERE status = 'pending';
      CREATE INDEX IF NOT EXISTS idx_deal_approvals_deal
        ON deal_approvals(saved_deal_id);

      CREATE TABLE IF NOT EXISTS deal_messages (
        id SERIAL PRIMARY KEY,
        saved_deal_id INTEGER NOT NULL REFERENCES saved_deals(id) ON DELETE CASCADE,
        author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        message_kind VARCHAR(20) NOT NULL DEFAULT 'chat'
          CHECK (message_kind IN ('chat', 'system')),
        assignee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        resolved_at TIMESTAMPTZ,
        resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_deal_messages_deal
        ON deal_messages(saved_deal_id, created_at);

      CREATE TABLE IF NOT EXISTS deal_message_mentions (
        message_id INTEGER NOT NULL REFERENCES deal_messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (message_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS deal_message_reactions (
        message_id INTEGER NOT NULL REFERENCES deal_messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji VARCHAR(16) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (message_id, user_id, emoji)
      );

      CREATE TABLE IF NOT EXISTS deal_thread_reads (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        saved_deal_id INTEGER NOT NULL REFERENCES saved_deals(id) ON DELETE CASCADE,
        last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, saved_deal_id)
      );
    `
  },
  {
    // Team workspaces need a separate saved_deals row per team listing.
    // The original UNIQUE(user_id, deal_id) blocked saving a listing to a team
    // when the same user already had it in personal My Deals (Postgres 23505).
    name: 'saved_deals_scoped_unique_deal_id',
    up: `
      ALTER TABLE saved_deals DROP CONSTRAINT IF EXISTS saved_deals_user_id_deal_id_key;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_deals_personal_deal_id
        ON saved_deals (user_id, deal_id)
        WHERE team_id IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_deals_team_deal_id
        ON saved_deals (team_id, deal_id)
        WHERE team_id IS NOT NULL;
    `
  },
  {
    name: 'team_invites_link_kind',
    up: `
      ALTER TABLE team_invites ADD COLUMN IF NOT EXISTS invite_kind VARCHAR(20) NOT NULL DEFAULT 'email';
      ALTER TABLE team_invites ALTER COLUMN email DROP NOT NULL;
    `
  },
  {
    name: 'team_invites_code_password',
    up: `
      ALTER TABLE team_invites ADD COLUMN IF NOT EXISTS invite_code VARCHAR(16);
      ALTER TABLE team_invites ADD COLUMN IF NOT EXISTS password_hash TEXT;

      UPDATE team_invites
      SET invite_code = UPPER(SUBSTRING(md5(random()::text || id::text || COALESCE(token, '')) FROM 1 FOR 8))
      WHERE invite_code IS NULL OR invite_code = '';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_invite_code
        ON team_invites(invite_code);
    `
  },
  {
    name: 'deal_messages_metadata',
    up: `
      ALTER TABLE deal_messages
        ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    `
  },
  {
    name: 'user_alerts',
    up: `
      CREATE TABLE IF NOT EXISTS user_alerts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        alert_type VARCHAR(40) NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        saved_deal_id INTEGER REFERENCES saved_deals(id) ON DELETE CASCADE,
        message_id INTEGER REFERENCES deal_messages(id) ON DELETE CASCADE,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_alerts_unread
        ON user_alerts (user_id, created_at DESC)
        WHERE read_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_user_alerts_deal
        ON user_alerts (user_id, saved_deal_id)
        WHERE read_at IS NULL;
    `
  },
  {
    name: 'feedback_engine',
    up: `
      CREATE TABLE IF NOT EXISTS feedback_submissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category VARCHAR(20) NOT NULL
          CHECK (category IN ('bug', 'feedback', 'suggestion')),
        severity VARCHAR(20) NOT NULL DEFAULT 'normal'
          CHECK (severity IN ('low', 'normal', 'blocking')),
        status VARCHAR(20) NOT NULL DEFAULT 'new'
          CHECK (status IN ('new', 'needs_info', 'in_progress', 'fixed', 'wont_fix', 'closed')),
        title TEXT NOT NULL,
        page_url TEXT,
        app_version VARCHAR(32),
        user_agent TEXT,
        viewport JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        me_too_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_submissions_user
        ON feedback_submissions (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_feedback_submissions_admin
        ON feedback_submissions (status, category, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_feedback_submissions_open_bugs
        ON feedback_submissions (category, status, me_too_count DESC)
        WHERE category = 'bug' AND status IN ('new', 'needs_info', 'in_progress');

      CREATE TABLE IF NOT EXISTS feedback_messages (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
        author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        message_kind VARCHAR(20) NOT NULL DEFAULT 'user'
          CHECK (message_kind IN ('user', 'admin', 'system')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_messages_submission
        ON feedback_messages (submission_id, created_at);

      CREATE TABLE IF NOT EXISTS feedback_attachments (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
        message_id INTEGER REFERENCES feedback_messages(id) ON DELETE SET NULL,
        kind VARCHAR(20) NOT NULL
          CHECK (kind IN ('screenshot', 'voice', 'image')),
        mime_type VARCHAR(100) NOT NULL,
        byte_size INTEGER NOT NULL DEFAULT 0,
        data BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_attachments_submission
        ON feedback_attachments (submission_id);

      CREATE TABLE IF NOT EXISTS feedback_reads (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        submission_id INTEGER NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
        last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, submission_id)
      );

      CREATE TABLE IF NOT EXISTS feedback_me_too (
        submission_id INTEGER NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (submission_id, user_id)
      );
    `
  },
  {
    name: 'dd_templates_industry_key_v5_7',
    up: `
      ALTER TABLE dd_templates ADD COLUMN IF NOT EXISTS industry_key VARCHAR(40);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dd_templates_system_industry
        ON dd_templates (industry_key)
        WHERE user_id IS NULL AND industry_key IS NOT NULL;
    `
  },
  {
    name: 'dd_share_wave3_v5_8',
    up: `
      ALTER TABLE dd_share_links ADD COLUMN IF NOT EXISTS group_ids INTEGER[];

      ALTER TABLE dd_share_access_log ADD COLUMN IF NOT EXISTS guest_name VARCHAR(255);
      ALTER TABLE dd_share_access_log ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255);
      ALTER TABLE dd_share_access_log ADD COLUMN IF NOT EXISTS guest_session_id VARCHAR(64);

      CREATE INDEX IF NOT EXISTS idx_dd_share_access_link_created
        ON dd_share_access_log (share_link_id, created_at DESC);
    `
  },
  {
    name: 'feedback_repro_fields_v5_9',
    up: `
      ALTER TABLE feedback_submissions ADD COLUMN IF NOT EXISTS expected_result TEXT;
      ALTER TABLE feedback_submissions ADD COLUMN IF NOT EXISTS actual_result TEXT;
      ALTER TABLE feedback_submissions ADD COLUMN IF NOT EXISTS repro_steps TEXT;
    `
  },
  {
    name: 'underwriting_workbook_v5_10',
    up: `
      CREATE TABLE IF NOT EXISTS underwriting_models (
        id SERIAL PRIMARY KEY,
        saved_deal_id INTEGER NOT NULL REFERENCES saved_deals(id) ON DELETE CASCADE,
        buyer_type VARCHAR(40) DEFAULT 'owner_operator',
        ui_mode VARCHAR(20) DEFAULT 'guided',
        settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        shared_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (saved_deal_id)
      );

      CREATE TABLE IF NOT EXISTS underwriting_structure_paths (
        id SERIAL PRIMARY KEY,
        model_id INTEGER NOT NULL REFERENCES underwriting_models(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        path_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_uw_paths_model ON underwriting_structure_paths(model_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_uw_paths_one_baseline
        ON underwriting_structure_paths (model_id)
        WHERE is_baseline = TRUE;

      CREATE TABLE IF NOT EXISTS underwriting_revisions (
        id SERIAL PRIMARY KEY,
        model_id INTEGER NOT NULL REFERENCES underwriting_models(id) ON DELETE CASCADE,
        label VARCHAR(255),
        change_summary TEXT,
        snapshot JSONB NOT NULL,
        outputs JSONB,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_uw_revisions_model ON underwriting_revisions(model_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS underwriting_custom_sheets (
        id SERIAL PRIMARY KEY,
        model_id INTEGER NOT NULL REFERENCES underwriting_models(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        rows JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_uw_custom_sheets_model ON underwriting_custom_sheets(model_id);

      CREATE TABLE IF NOT EXISTS underwriting_evidence_links (
        id SERIAL PRIMARY KEY,
        model_id INTEGER NOT NULL REFERENCES underwriting_models(id) ON DELETE CASCADE,
        input_path VARCHAR(255) NOT NULL,
        dd_item_id INTEGER REFERENCES dd_items(id) ON DELETE SET NULL,
        deal_document_id INTEGER REFERENCES deal_documents(id) ON DELETE SET NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'requested',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_uw_evidence_model ON underwriting_evidence_links(model_id);

      CREATE TABLE IF NOT EXISTS underwriting_share_links (
        id SERIAL PRIMARY KEY,
        model_id INTEGER NOT NULL REFERENCES underwriting_models(id) ON DELETE CASCADE,
        token VARCHAR(64) NOT NULL UNIQUE,
        label VARCHAR(255),
        password_hash VARCHAR(255),
        expires_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        pinned_revision_id INTEGER REFERENCES underwriting_revisions(id) ON DELETE SET NULL,
        preferred_path_id INTEGER REFERENCES underwriting_structure_paths(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_uw_share_model ON underwriting_share_links(model_id);
    `
  },
  {
    name: 'crm_organize_v5_3',
    up: `
      -- Phase 1–3: external deals, contacts CRUD, task collab, tags/views/notes
      ALTER TABLE saved_deals ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE saved_deals ADD COLUMN IF NOT EXISTS close_target_date DATE;
      ALTER TABLE saved_deals ADD COLUMN IF NOT EXISTS referral_source TEXT;
      ALTER TABLE saved_deals ADD COLUMN IF NOT EXISTS external_source_type VARCHAR(40);
      ALTER TABLE saved_deals ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
      ALTER TABLE saved_deals ADD COLUMN IF NOT EXISTS custom_stage_label TEXT;

      CREATE INDEX IF NOT EXISTS idx_saved_deals_owner ON saved_deals(owner_user_id) WHERE owner_user_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_saved_deals_tags ON saved_deals USING GIN (tags);

      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS title TEXT;
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

      CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN (tags);

      ALTER TABLE companies ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority SMALLINT DEFAULT 3;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence VARCHAR(40);
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

      CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_user_id, status, due_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS task_comments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, created_at DESC);

      ALTER TABLE activities ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS title TEXT;

      CREATE TABLE IF NOT EXISTS crm_saved_views (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        view_type VARCHAR(30) NOT NULL DEFAULT 'deals',
        filters JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_shared BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_saved_views_user ON crm_saved_views(user_id);
      CREATE INDEX IF NOT EXISTS idx_crm_saved_views_team ON crm_saved_views(team_id) WHERE team_id IS NOT NULL;

      -- Backfill owner to deal creator where missing
      UPDATE saved_deals SET owner_user_id = user_id WHERE owner_user_id IS NULL;
    `
  },
  {
    name: 'market_deals_listing_fingerprint_index',
    up: `
      CREATE INDEX IF NOT EXISTS idx_market_deals_listing_fingerprint
        ON market_deals (
          (ROUND(asking_price)::bigint),
          (ROUND(annual_profit)::bigint),
          (ROUND(annual_revenue)::bigint),
          lower(BTRIM(COALESCE(city, ''))),
          lower(BTRIM(COALESCE(state, '')))
        )
        WHERE is_active
          AND asking_price > 0
          AND annual_profit > 0
          AND annual_revenue > 0
          AND (
            NULLIF(BTRIM(COALESCE(city, '')), '') IS NOT NULL
            OR NULLIF(BTRIM(COALESCE(state, '')), '') IS NOT NULL
          );
    `
  },
  {
    name: 'google_connection_gmail_scopes_v5_82',
    up: `
      ALTER TABLE calendar_connections
        ADD COLUMN IF NOT EXISTS google_email TEXT,
        ADD COLUMN IF NOT EXISTS granted_scopes TEXT;
    `
  },
  {
    name: 'password_reset_tokens_v5_85',
    up: `
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
    `
  },
  {
    name: 'teams_deed_board_prefs_v5_89',
    up: `
      ALTER TABLE teams ADD COLUMN IF NOT EXISTS deed_board_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE teams ADD COLUMN IF NOT EXISTS deed_board_prefs_updated_at TIMESTAMPTZ;
      ALTER TABLE teams ADD COLUMN IF NOT EXISTS deed_board_prefs_updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    `
  },
  {
    name: 'push_subscriptions_v5_92',
    up: `
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
        ON push_subscriptions (user_id);
      ALTER TABLE user_settings
        ADD COLUMN IF NOT EXISTS last_team_activity_notified TIMESTAMPTZ;
    `
  },
  {
    name: 'saved_deal_views_v5_94',
    up: `
      CREATE TABLE IF NOT EXISTS saved_deal_views (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        saved_deal_id INTEGER NOT NULL REFERENCES saved_deals(id) ON DELETE CASCADE,
        seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, saved_deal_id)
      );
      CREATE INDEX IF NOT EXISTS idx_saved_deal_views_deal
        ON saved_deal_views (saved_deal_id);

      INSERT INTO saved_deal_views (user_id, saved_deal_id)
      SELECT tm.user_id, sd.id
      FROM saved_deals sd
      INNER JOIN team_members tm
        ON tm.team_id = sd.team_id AND tm.status = 'active'
      WHERE sd.team_id IS NOT NULL
      ON CONFLICT (user_id, saved_deal_id) DO NOTHING;
    `
  },
  {
    name: 'off_market_v5_95',
    up: `
      CREATE TABLE IF NOT EXISTS user_llm_connections (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(30) NOT NULL DEFAULT 'openai_compat',
        model TEXT,
        base_url TEXT,
        api_key_cipher BYTEA,
        api_key_nonce BYTEA,
        key_last4 TEXT,
        ingest_token_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_llm_ingest_hash
        ON user_llm_connections (ingest_token_hash)
        WHERE ingest_token_hash IS NOT NULL;

      CREATE TABLE IF NOT EXISTS off_market_sequences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        steps JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_off_market_sequences_user
        ON off_market_sequences (user_id);

      CREATE TABLE IF NOT EXISTS off_market_campaigns (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        vertical TEXT,
        geography TEXT,
        brief TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        daily_send_cap INTEGER NOT NULL DEFAULT 50,
        send_delay_sec INTEGER NOT NULL DEFAULT 90,
        auto_promote_on_interested BOOLEAN NOT NULL DEFAULT false,
        sequence_id INTEGER REFERENCES off_market_sequences(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_off_market_campaigns_user
        ON off_market_campaigns (user_id, status);

      CREATE TABLE IF NOT EXISTS off_market_prospects (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        campaign_id INTEGER NOT NULL REFERENCES off_market_campaigns(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        saved_deal_id INTEGER REFERENCES saved_deals(id) ON DELETE SET NULL,
        company_name TEXT NOT NULL,
        owner_name TEXT,
        email TEXT,
        title TEXT,
        location TEXT,
        notes TEXT,
        source_url TEXT,
        research_json JSONB DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'new',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_off_market_prospects_campaign
        ON off_market_prospects (campaign_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_off_market_prospects_email
        ON off_market_prospects (campaign_id, lower(email))
        WHERE email IS NOT NULL AND email <> '';

      CREATE TABLE IF NOT EXISTS off_market_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        campaign_id INTEGER NOT NULL REFERENCES off_market_campaigns(id) ON DELETE CASCADE,
        prospect_id INTEGER NOT NULL REFERENCES off_market_prospects(id) ON DELETE CASCADE,
        step_index INTEGER NOT NULL DEFAULT 0,
        gmail_message_id TEXT,
        gmail_thread_id TEXT,
        rfc_message_id TEXT,
        to_email TEXT NOT NULL,
        subject TEXT,
        body_text TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        sent_at TIMESTAMPTZ,
        last_event_at TIMESTAMPTZ,
        error TEXT,
        metadata JSONB DEFAULT '{}'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_off_market_messages_campaign
        ON off_market_messages (campaign_id, status);
      CREATE INDEX IF NOT EXISTS idx_off_market_messages_queued
        ON off_market_messages (user_id, status)
        WHERE status = 'queued';

      CREATE TABLE IF NOT EXISTS off_market_suppressions (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        reason VARCHAR(30) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, email)
      );
    `
  }
];

export async function runMigrations(poolInstance = pool) {
  console.log('🔄 Running database migrations...');
  for (const migration of migrations) {
    console.log(`  Running: ${migration.name}`);
    try {
      await poolInstance.query(migration.up);
      console.log(`  ✅ ${migration.name} completed`);
    } catch (err) {
      // Many ups are idempotent (IF NOT EXISTS). Older data migrations can fail on
      // re-run (e.g. unique conflicts) and must not block later schema (teams, etc.).
      console.error(`  ⚠️ ${migration.name} failed:`, err.message);
      if (process.env.NODE_ENV === 'production' && !/duplicate key|already exists/i.test(err.message || '')) {
        throw err;
      }
    }
  }
  console.log('✅ All migrations completed successfully');
}

async function migrateCli() {
  try {
    await runMigrations();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

const isMigrateCli = process.argv[1]?.replace(/\\/g, '/').endsWith('/src/db/migrate.js')
  || process.argv[1]?.endsWith('migrate.js');
if (isMigrateCli) {
  migrateCli();
}
