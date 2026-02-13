/**
 * English translations
 */
const LANG_EN = {
    // ── Global ──
    app_name: 'Express Cargo',
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    filter: 'Filter',
    export: 'Export',
    retry: 'Retry',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    actions: 'Actions',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    all: 'All',
    none: 'None',
    select: 'Select',
    required: 'Required',
    optional: 'Optional',
    or: 'or',
    of: 'of',
    no_results: 'No results',
    error_generic: 'An error occurred',
    error_loading: 'Loading error',
    success_saved: 'Saved successfully',
    success_deleted: 'Deleted successfully',
    success_updated: 'Updated successfully',
    copied: 'Copied',

    // ── Nav / Sidebar ──
    nav: {
        dashboard: 'Dashboard',
        packages: 'Packages',
        departures: 'Departures',
        pickups_payments: 'Pickups & Payments',
        clients: 'Clients',
        reports: 'Reports',
        tarifs: 'Routes & Rates',
        announcements: 'Announcements',
        staff: 'Staff',
        payroll: 'HR / Payroll',
        settings: 'Settings',
        guide: 'Guide & Support',
        test_webhooks: 'Test Webhooks',
        profile: 'My Profile',
        subscription: 'My Subscription',
        logout: 'Logout',
    },

    // ── Header ──
    header: {
        user_default: 'User',
        calculator: 'Calculator',
        estimator: 'Rate Estimator',
        notifications: 'Notifications',
    },

    // ── Roles ──
    roles: {
        admin: 'Administrator',
        manager: 'Manager',
        staff: 'Agent',
        accountant: 'Accountant',
    },

    // ── Login ──
    login: {
        title: 'Login',
        email: 'Email',
        password: 'Password',
        submit: 'Sign in',
        forgot_password: 'Forgot password?',
        logging_in: 'Signing in...',
        error_credentials: 'Invalid email or password',
        error_inactive: 'Account disabled',
    },

    // ── Dashboard ──
    dashboard: {
        title: 'Dashboard',
        total_packages: 'Total packages',
        in_transit: 'In transit',
        delivered: 'Delivered',
        revenue: 'Revenue',
        recent_packages: 'Recent packages',
        recent_activity: 'Recent activity',
        today: 'Today',
        this_week: 'This week',
        this_month: 'This month',
    },

    // ── Packages ──
    packages: {
        title: 'Packages',
        new_package: 'New package',
        receive: 'Receive',
        tracking: 'Tracking',
        client: 'Client',
        status: 'Status',
        origin: 'Origin',
        destination: 'Destination',
        weight: 'Weight',
        amount: 'Amount',
        date: 'Date',
        description: 'Description',
        transport_mode: 'Transport mode',
        no_packages: 'No packages found',
        search_placeholder: 'Search by tracking, client...',
        filter_status: 'Filter by status',
        filter_departure: 'Filter by departure',
        all_statuses: 'All statuses',
        all_departures: 'All departures',
        bulk_actions: 'Bulk actions',
        selected: 'selected',
        export_list: 'Export list',
    },

    // ── Package statuses ──
    status: {
        registered: 'Registered',
        in_transit: 'In transit',
        arrived: 'Arrived',
        customs: 'Customs',
        ready: 'Ready',
        delivered: 'Delivered',
        returned: 'Returned',
        lost: 'Lost',
    },

    // ── Package Detail ──
    package_detail: {
        title: 'Package Details',
        not_found: 'Package not found',
        not_found_text: 'This package does not exist',
        back_to_list: 'Back to packages',
        client_info: 'Client information',
        package_info: 'Package information',
        payment_info: 'Payment',
        history: 'History',
        total_amount: 'Total amount',
        paid_amount: 'Paid amount',
        remaining: 'Remaining',
        paid: 'Paid',
        partial: 'Partial',
        unpaid: 'Unpaid',
        update_status: 'Update status',
        phone: 'Phone',
        supplier_tracking: 'Supplier tracking',
    },

    // ── Clients ──
    clients: {
        title: 'Clients',
        new_client: 'New client',
        name: 'Name',
        email: 'Email',
        phone: 'Phone',
        total_packages: 'Total packages',
        balance: 'Balance',
        created: 'Registered on',
        no_clients: 'No clients found',
        search_placeholder: 'Search by name, email, phone...',
    },

    // ── Client Detail ──
    client_detail: {
        title: 'Client Details',
        packages: 'Packages',
        payments: 'Payments',
        info: 'Information',
    },

    // ── Departures ──
    departures: {
        title: 'Departures',
        new_departure: 'New departure',
        departure_name: 'Departure name',
        departure_date: 'Departure date',
        packages_count: 'Package count',
        total_weight: 'Total weight',
        no_departures: 'No departures found',
        status_open: 'Open',
        status_closed: 'Closed',
        status_shipped: 'Shipped',
    },

    // ── Pickups & Payments ──
    pickups_payments: {
        title: 'Pickups & Payments',
        tab_pickups: 'Pickups',
        tab_payments: 'Payments',
    },

    // ── Pickups ──
    pickups: {
        title: 'Package Pickup',
        history: 'History',
        awaiting: 'Awaiting pickup',
        payment_pending: 'Payment pending',
        today_pickups: 'Pickups today',
        this_month: 'This month',
        scan_code: 'Scan code',
        scan_placeholder: 'Scan or paste tracking...',
        search_by_name: 'Or search by name/phone',
        search_placeholder: 'Client name or phone...',
        available_packages: 'Packages available for pickup',
        pickup_form: 'Pickup form',
        no_package_selected: 'No package selected',
        package_info: 'Package information',
        who_picks_up: 'Who is picking up?',
        client_self: 'Client (self)',
        proxy: 'Proxy (third party)',
        proxy_name: 'Proxy name',
        proxy_phone: 'Phone',
        id_type: 'ID type',
        id_number: 'ID number',
        collection: 'Collection',
        amount_to_collect: 'Amount to collect',
        signature: 'Signature',
        photo: 'Photo',
        confirm_pickup: 'Confirm pickup',
    },

    // ── Payments ──
    payments: {
        title: 'Payments',
        new_payment: 'New payment',
        export: 'Export',
        today_collections: "Today's collections",
        this_week: 'This week',
        this_month: 'This month',
        pending: 'Pending',
        method: 'Method',
        all_methods: 'All methods',
        date_from: 'From date',
        date_to: 'To date',
        no_payments: 'No payments found',
        reference: 'Reference',
        amount: 'Amount',
        date: 'Date',
        search_placeholder: 'Client, reference...',
    },

    // ── Reports ──
    reports: {
        title: 'Reports',
        export_pdf: 'Export PDF',
        export_excel: 'Export Excel',
        tab_statistics: 'Statistics',
        tab_departures: 'Departures',
        tab_accounting: 'Accounting',
        period_week: 'Week',
        period_month: 'Month',
        period_quarter: 'Quarter',
        period_year: 'Year',
        revenue: 'Revenue',
        packages_processed: 'Packages processed',
        new_clients: 'New clients',
        delivery_rate: 'Delivery rate',
        unpaid: 'Unpaid',
    },

    // ── Announcements ──
    announcements: {
        title: 'Announcements',
        new_announcement: 'New announcement',
        no_announcements: 'No announcements',
        active: 'Active',
        inactive: 'Inactive',
    },

    // ── Staff ──
    staff: {
        title: 'Staff',
        new_staff: 'New member',
        name: 'Name',
        email: 'Email',
        role: 'Role',
        status: 'Status',
        active: 'Active',
        inactive: 'Inactive',
        last_login: 'Last login',
        no_staff: 'No staff members',
        permissions: 'Permissions',
    },

    // ── Payroll ──
    payroll: {
        title: 'Human Resources',
        new_employee: 'New employee',
        new_expense: 'Misc. expense',
        tab_employees: 'Employees',
        tab_payments: 'Payments',
        tab_expenses: 'Misc. expenses',
        salary: 'Salary',
        position: 'Position',
        hire_date: 'Hire date',
    },

    // ── Tarifs ──
    tarifs: {
        title: 'Rate Configuration',
        tab_origins: 'Origins',
        tab_destinations: 'Destinations',
        tab_routes: 'Rates by route',
    },

    // ── Settings ──
    settings: {
        title: 'Settings',
        tab_general: 'General',
        tab_system: 'System',
        tab_notifications: 'SMS / WhatsApp',
        tab_online_payments: 'Online Payment',
        tab_appearance: 'Appearance',
        company: 'Company',
        company_name: 'Company name',
        email: 'Email',
        phone: 'Phone',
        website: 'Website',
        address: 'Address',
        currency: 'Currency',
        timezone: 'Timezone',
        language: 'Language',
    },

    // ── Profile ──
    profile: {
        title: 'My Profile',
        personal_info: 'Personal information',
        first_name: 'First name',
        last_name: 'Last name',
        phone: 'Phone',
        email: 'Email',
        change_email: 'Change',
        save_profile: 'Save',
        security: 'Security',
        security_note: 'For security reasons, changing your password requires OTP verification.',
        change_password: 'Change password',
    },

    // ── Subscription ──
    subscription: {
        title: 'My Subscription',
        subtitle: 'Manage your plan and renewals',
        loading: 'Loading information...',
        error_loading: 'Loading error',
        error_text: 'Unable to retrieve subscription information.',
        retry: 'Retry',
    },

    // ── Guide ──
    guide: {
        title: 'Guide & Support',
        contact_support: 'Contact support',
        subject: 'Subject',
        message: 'Message',
        send: 'Send',
        subject_required: 'Subject and message are required',
        message_sent: 'Message sent successfully',
    },

    // ── Invoices ──
    invoices: {
        title: 'Invoices',
        new_invoice: 'New invoice',
        invoice_number: 'Invoice #',
        client: 'Client',
        description: 'Description',
        amount: 'Amount',
        date: 'Date',
        status: 'Status',
        status_draft: 'Draft',
        status_sent: 'Sent',
        status_paid: 'Paid',
        status_cancelled: 'Cancelled',
        no_invoices: 'No invoices',
        send: 'Send',
    },

    // ── Tarif Estimator ──
    estimator: {
        title: 'Rate Calculator',
        origin: 'Origin',
        destination: 'Destination',
        transport: 'Transport',
        package_type: 'Package type',
        weight_kg: 'Weight (kg)',
        volume_cbm: 'Volume (m³)',
        quantity: 'Quantity',
        result: 'Result',
        unit_rate: 'Unit rate',
        calculation: 'Calculation',
        estimated_total: 'Estimated total',
        select_all_params: 'Select all parameters',
        enter_values: 'Enter weight, volume or quantity',
        rate_not_configured: 'Rate not configured for this route',
        select_origin_dest: 'Select origin/destination',
        select_transport: 'Select a transport',
        no_transport: 'No transport available',
        no_type: 'No type',
        fixed: 'flat rate',
        pieces: 'piece(s)',
    },

    // ── Misc ──
    not_found: {
        title: 'Page not found',
        text: 'The page you are looking for does not exist.',
        back_home: 'Back to home',
    },
    access_denied: {
        title: 'Access denied',
        text: 'You do not have permission to access this page.',
        back_home: 'Back to home',
    },

    // ── DataTable / Pagination ──
    datatable: {
        no_data: 'No data',
        showing: 'Showing',
        to: 'to',
        of: 'of',
        entries: 'entries',
        first: 'First',
        last: 'Last',
    },

    // ── Confirmation dialogs ──
    confirm_delete: 'Are you sure you want to delete this item?',
    confirm_action: 'Are you sure you want to perform this action?',
};
