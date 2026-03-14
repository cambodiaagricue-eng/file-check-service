type ApiField = {
  name: string;
  type: string;
  required: boolean;
  description?: string;
};

type ApiContract = {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  group: string;
  auth: "none" | "cookie_or_bearer" | "cookie";
  role?: string[];
  contentType?: "application/json" | "multipart/form-data";
  query?: ApiField[];
  body?: ApiField[];
  formData?: ApiField[];
  successResponse: {
    success: true;
    message: string;
    dataShape: unknown;
  };
  errorResponse: {
    success: false;
    message: string;
    details?: unknown;
  };
  notes?: string[];
};

const API_BASE = "http://localhost:3003";

const contracts: ApiContract[] = [
  {
    id: "auth_signup",
    method: "POST",
    path: "/api/v1/auth/signup",
    group: "auth",
    auth: "none",
    contentType: "application/json",
    body: [
      { name: "username", type: "string", required: true },
      { name: "phone", type: "string (+91... or +855...)", required: true },
      { name: "password", type: "string", required: true },
    ],
    successResponse: {
      success: true,
      message: "Signup successful. OTP sent for account verification.",
      dataShape: {
        token: "string(accessToken)",
        refreshToken: "string",
        username: "string",
        phone: "string",
        password: "string",
        verified: false,
      },
    },
    errorResponse: { success: false, message: "string", details: {} },
  },
  {
    id: "auth_login",
    method: "POST",
    path: "/api/v1/auth/login",
    group: "auth",
    auth: "none",
    contentType: "application/json",
    body: [
      { name: "username", type: "string", required: true },
      { name: "password", type: "string", required: true },
      { name: "location", type: "string", required: true },
    ],
    successResponse: {
      success: true,
      message: "Login successful.",
      dataShape: {
        accessToken: "string",
        refreshToken: "string",
        user: {
          id: "string",
          username: "string",
          phone: "string",
          role: "string",
          memberQrCode: "string",
          isVerified: true,
          lastLogins: [{ location: "string", loggedAt: "datetime" }],
        },
      },
    },
    errorResponse: { success: false, message: "string", details: {} },
    notes: ["Sets access_token + refresh_token cookies."],
  },
  {
    id: "auth_refresh_token",
    method: "POST",
    path: "/api/v1/auth/refresh-token",
    group: "auth",
    auth: "cookie",
    contentType: "application/json",
    successResponse: {
      success: true,
      message: "Token refreshed.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string", details: {} },
    notes: ["Requires refresh_token cookie.", "Rotates refresh token."],
  },
  {
    id: "auth_verify_account_request",
    method: "POST",
    path: "/api/v1/auth/verify-account/request",
    group: "auth",
    auth: "none",
    contentType: "application/json",
    body: [{ name: "phone", type: "string", required: true }],
    successResponse: {
      success: true,
      message: "Verification OTP sent.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string", details: {} },
  },
  {
    id: "auth_verify_account_confirm",
    method: "POST",
    path: "/api/v1/auth/verify-account/confirm",
    group: "auth",
    auth: "none",
    contentType: "application/json",
    body: [
      { name: "phone", type: "string", required: true },
      { name: "code", type: "string", required: true },
    ],
    successResponse: {
      success: true,
      message: "Account verified successfully.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string", details: {} },
  },
  {
    id: "auth_reset_password_request",
    method: "POST",
    path: "/api/v1/auth/reset-password/request",
    group: "auth",
    auth: "none",
    contentType: "application/json",
    body: [{ name: "phone", type: "string", required: true }],
    successResponse: {
      success: true,
      message: "Password reset OTP sent.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string", details: {} },
  },
  {
    id: "auth_reset_password_confirm",
    method: "POST",
    path: "/api/v1/auth/reset-password/confirm",
    group: "auth",
    auth: "none",
    contentType: "application/json",
    body: [
      { name: "phone", type: "string", required: true },
      { name: "code", type: "string", required: true },
      { name: "newPassword", type: "string", required: true },
    ],
    successResponse: {
      success: true,
      message: "Password reset successful.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string", details: {} },
  },
  {
    id: "auth_me",
    method: "GET",
    path: "/api/v1/auth/me",
    group: "auth",
    auth: "cookie_or_bearer",
    successResponse: {
      success: true,
      message: "Authenticated user profile.",
      dataShape: {
        user: {
          id: "string",
          username: "string",
          phone: "string",
          role: "string",
          onboardingCompleted: "boolean",
        },
      },
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "auth_logout",
    method: "POST",
    path: "/api/v1/auth/logout",
    group: "auth",
    auth: "cookie",
    successResponse: {
      success: true,
      message: "Logout successful.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string" },
    notes: ["Clears access_token and refresh_token cookies."],
  },
  {
    id: "auth_phone_country_codes",
    method: "GET",
    path: "/api/v1/auth/phone-country-codes",
    group: "auth",
    auth: "none",
    successResponse: {
      success: true,
      message: "Whitelisted phone country codes",
      dataShape: {
        countries: [
          { code: "+91", country: "India" },
          { code: "+855", country: "Cambodia" },
        ],
      },
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "auth_set_marketplace_mode",
    method: "POST",
    path: "/api/v1/auth/marketplace-mode",
    group: "auth",
    auth: "cookie_or_bearer",
    contentType: "application/json",
    body: [{ name: "mode", type: "buyer|seller|both", required: true }],
    successResponse: {
      success: true,
      message: "Marketplace mode updated.",
      dataShape: { mode: "string", role: "string" },
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "onboarding_status",
    method: "GET",
    path: "/api/v1/onboarding/status",
    group: "onboarding",
    auth: "cookie_or_bearer",
    successResponse: {
      success: true,
      message: "Onboarding status fetched.",
      dataShape: {
        onboardingCompleted: "boolean",
        currentStep: "number",
        profile: {},
        steps: {},
      },
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "onboarding_submit_all",
    method: "POST",
    path: "/api/v1/onboarding/submit",
    group: "onboarding",
    auth: "cookie_or_bearer",
    contentType: "multipart/form-data",
    formData: [
      { name: "fullName", type: "string", required: true },
      { name: "address", type: "string", required: true },
      { name: "gender", type: "male|female|other", required: true },
      { name: "age", type: "number", required: true },
      { name: "selfie", type: "file(image)", required: true },
      { name: "govId", type: "file(image|pdf)", required: true },
      { name: "landDocuments", type: "file[] (image|pdf)", required: true },
    ],
    successResponse: {
      success: true,
      message: "Onboarding submitted and completed successfully.",
      dataShape: {
        onboardingCompleted: true,
        currentStep: 4,
      },
    },
    errorResponse: { success: false, message: "string", details: {} },
  },
  {
    id: "onboarding_step_1",
    method: "POST",
    path: "/api/v1/onboarding/step-1",
    group: "onboarding",
    auth: "cookie_or_bearer",
    contentType: "multipart/form-data",
    formData: [
      { name: "fullName", type: "string", required: true },
      { name: "address", type: "string", required: true },
      { name: "gender", type: "male|female|other", required: true },
      { name: "age", type: "number", required: true },
      { name: "selfie", type: "file(image)", required: true },
    ],
    successResponse: {
      success: true,
      message: "Onboarding step 1 completed.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "onboarding_step_2",
    method: "POST",
    path: "/api/v1/onboarding/step-2",
    group: "onboarding",
    auth: "cookie_or_bearer",
    contentType: "multipart/form-data",
    formData: [{ name: "govId", type: "file(image|pdf)", required: true }],
    successResponse: {
      success: true,
      message: "Onboarding step 2 completed.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "onboarding_step_3",
    method: "POST",
    path: "/api/v1/onboarding/step-3",
    group: "onboarding",
    auth: "cookie_or_bearer",
    contentType: "multipart/form-data",
    formData: [{ name: "landDocuments", type: "file[]", required: true }],
    successResponse: {
      success: true,
      message: "Onboarding step 3 completed.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "wallet_get",
    method: "GET",
    path: "/api/v1/wallet",
    group: "wallet",
    auth: "cookie_or_bearer",
    successResponse: {
      success: true,
      message: "Wallet fetched.",
      dataShape: { userId: "string", coins: "number", usdBalance: "number" },
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "wallet_buy_coins",
    method: "POST",
    path: "/api/v1/wallet/buy-coins",
    group: "wallet",
    auth: "cookie_or_bearer",
    contentType: "application/json",
    body: [{ name: "amountUsd", type: "number", required: true }],
    successResponse: {
      success: true,
      message: "Coins purchased successfully.",
      dataShape: {
        wallet: { coins: "number", usdBalance: "number" },
        payment: { paymentId: "string", provider: "mock", amountUsd: "number" },
      },
    },
    errorResponse: { success: false, message: "string" },
    notes: ["Rate is 1 USD = 1 coin (10 USD => 10 coins)."],
  },
  {
    id: "wallet_soil_test",
    method: "POST",
    path: "/api/v1/wallet/soil-test",
    group: "wallet",
    auth: "cookie_or_bearer",
    successResponse: {
      success: true,
      message: "Soil test charged 10 coins.",
      dataShape: { coins: "number" },
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "wallet_mayur_gpt",
    method: "POST",
    path: "/api/v1/wallet/mayur-gpt",
    group: "wallet",
    auth: "cookie_or_bearer",
    successResponse: {
      success: true,
      message: "Mayur GPT usage charged.",
      dataShape: { coins: "number" },
    },
    errorResponse: { success: false, message: "string" },
    notes: ["Agent-created users are blocked from this endpoint currently."],
  },
  {
    id: "marketplace_create_listing",
    method: "POST",
    path: "/api/v1/marketplace/listings",
    group: "marketplace",
    auth: "cookie_or_bearer",
    role: ["seller", "admin", "superadmin"],
    contentType: "application/json",
    body: [
      { name: "title", type: "string", required: true },
      { name: "description", type: "string", required: false },
      { name: "basePriceUsd", type: "number", required: true },
      { name: "quantity", type: "number", required: true },
    ],
    successResponse: {
      success: true,
      message: "Listing created.",
      dataShape: { _id: "string", sellerId: "string", highestBidUsd: 0 },
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "marketplace_place_bid",
    method: "POST",
    path: "/api/v1/marketplace/bids",
    group: "marketplace",
    auth: "cookie_or_bearer",
    role: ["buyer", "farmer", "admin", "superadmin"],
    contentType: "application/json",
    body: [
      { name: "listingId", type: "string", required: true },
      { name: "amountUsd", type: "number", required: true },
    ],
    successResponse: {
      success: true,
      message: "Bid placed.",
      dataShape: { listing: {}, bid: {} },
    },
    errorResponse: { success: false, message: "string" },
    notes: ["Updates highest bid in DB and broadcasts WebSocket event."],
  },
  {
    id: "marketplace_seller_bids",
    method: "GET",
    path: "/api/v1/marketplace/seller/bids",
    group: "marketplace",
    auth: "cookie_or_bearer",
    role: ["seller", "admin", "superadmin"],
    successResponse: {
      success: true,
      message: "Seller bids fetched.",
      dataShape: [{ listingId: "string", bidderId: "string", amountUsd: "number" }],
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "pool_order_create",
    method: "POST",
    path: "/api/v1/pool-orders/create",
    group: "pool-orders",
    auth: "cookie_or_bearer",
    role: ["admin", "superadmin"],
    contentType: "application/json",
    body: [
      { name: "title", type: "string", required: true },
      { name: "description", type: "string", required: false },
      { name: "coinsPerUnit", type: "number", required: true },
      { name: "minParticipants", type: "number", required: true },
      { name: "maxParticipants", type: "number", required: false },
    ],
    successResponse: {
      success: true,
      message: "Pool order created.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "pool_order_join",
    method: "POST",
    path: "/api/v1/pool-orders/join",
    group: "pool-orders",
    auth: "cookie_or_bearer",
    contentType: "application/json",
    body: [
      { name: "poolOrderId", type: "string", required: true },
      { name: "units", type: "number", required: true },
      { name: "deliveryAddress", type: "string", required: true },
    ],
    successResponse: {
      success: true,
      message: "Joined pool order.",
      dataShape: { coinsCharged: "number", deliveryAddress: "string" },
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "pool_order_admin_view",
    method: "GET",
    path: "/api/v1/pool-orders/admin/joins",
    group: "pool-orders",
    auth: "cookie_or_bearer",
    role: ["admin", "superadmin"],
    successResponse: {
      success: true,
      message: "Pool order joins fetched.",
      dataShape: [{ poolOrderId: {}, buyerId: {}, deliveryAddress: "string" }],
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "admin_create_admin",
    method: "POST",
    path: "/api/v1/admin/create-admin",
    group: "admin",
    auth: "cookie_or_bearer",
    role: ["superadmin"],
    contentType: "application/json",
    body: [
      { name: "username", type: "string", required: true },
      { name: "phone", type: "string", required: true },
      { name: "password", type: "string", required: true },
    ],
    successResponse: {
      success: true,
      message: "Admin created.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "admin_approve_agent_user",
    method: "POST",
    path: "/api/v1/admin/approve-agent-user/:userId",
    group: "admin",
    auth: "cookie_or_bearer",
    role: ["admin", "superadmin"],
    successResponse: {
      success: true,
      message: "Agent-created user approved.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "agent_create_farmer",
    method: "POST",
    path: "/api/v1/agent/create-farmer",
    group: "agent",
    auth: "cookie_or_bearer",
    role: ["agent", "admin", "superadmin"],
    contentType: "application/json",
    body: [
      { name: "username", type: "string", required: true },
      { name: "phone", type: "string", required: true },
      { name: "password", type: "string", required: true },
    ],
    successResponse: {
      success: true,
      message: "Farmer account created by agent. Pending admin approval.",
      dataShape: {},
    },
    errorResponse: { success: false, message: "string" },
  },
  {
    id: "document_verify_name",
    method: "POST",
    path: "/api/documents/verify-name",
    group: "documents",
    auth: "cookie_or_bearer",
    contentType: "multipart/form-data",
    query: [{ name: "expectedName", type: "string", required: true }],
    formData: [{ name: "file", type: "file(pdf)", required: true }],
    successResponse: {
      success: true,
      message: "File uploaded and name checked successfully",
      dataShape: {
        documentUrl: "string(s3)",
        aiResult: {
          namefound: "boolean",
          expectednamefound: "boolean",
          "document oneliner summary": "string",
        },
        validation: {
          valid: "boolean",
          expectedNameChangeCount: "number",
          maxExpectedNameChanges: 3,
          isLoginBlocked: "boolean",
          message: "string",
        },
      },
    },
    errorResponse: { success: false, message: "string", details: {} },
  },
];

const WEBSOCKET_SPEC = {
  url: `${API_BASE.replace("http", "ws")}/ws?userId=<USER_ID>`,
  events: [
    {
      event: "marketplace.bid.updated",
      payload: {
        listingId: "string",
        highestBidUsd: "number",
        highestBidByUserId: "string",
        bidId: "string",
      },
    },
    {
      event: "marketplace.bid.for_seller",
      payload: {
        listingId: "string",
        highestBidUsd: "number",
        highestBidByUserId: "string",
        bidId: "string",
      },
    },
  ],
};

const output = {
  apiBase: API_BASE,
  authMode: {
    primary: "HttpOnly cookies (access_token, refresh_token)",
    fallback: "Bearer access token for protected endpoints",
  },
  envelope: {
    success: "boolean",
    message: "string",
    data: "any",
    details: "any (optional)",
  },
  routes: contracts,
  websocket: WEBSOCKET_SPEC,
};

console.log(JSON.stringify(output, null, 2));
